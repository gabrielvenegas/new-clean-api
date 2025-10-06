import { ConvexService } from "@/services/convex.service";
import { OlistApiService } from "@/services/olist-api.service";
import type { ProcessCustomerMarginsJobData } from "@/types/job";
import type { Item, OlistOrder } from "@/types/olist/order";
import type { OlistProduct } from "@/types/olist/product";
import type { Order } from "@/types/order";
import { logger } from "@/utils/logger";
import { RateLimiter } from "@/utils/rate-limiter";
import type { Job } from "bullmq";

const convexService = new ConvexService();
const olistApiService = new OlistApiService();

const rateLimiter = new RateLimiter(1);

export async function processCustomerMargins(
  job: Job<ProcessCustomerMarginsJobData>,
): Promise<void> {
  const { customerId, olistCustomerId } = job.data;

  logger.info(`Calculating margins for customer ${olistCustomerId}`);

  try {
    // 1. Get all orders for this customer
    const orders = await convexService.getOrdersByCustomerId(customerId);

    if (!orders.length) {
      logger.warn(`No orders found for customer ${olistCustomerId}`);
      return;
    }

    // 2. Calculate individual order margins
    const ordersWithMargins = await Promise.all(
      orders.map(async (order) => {
        const margin = await calculateOrderMargin(order.olist_order_id);
        return { ...order, margin_percentage: margin };
      }),
    );

    // 3. Update individual order margins in batch
    await convexService.updateOrderMargins(
      ordersWithMargins.map((order) => ({
        id: order._id,
        margin: order.margin_percentage,
      })),
    );

    // 4. Calculate customer-level margins
    const now = Date.now();
    const oneMonthAgo = now - 30 * 24 * 60 * 60 * 1000;
    const oneYearAgo = now - 365 * 24 * 60 * 60 * 1000;

    const margins = {
      one_month_margin_percentage: calculatePeriodMargin(
        ordersWithMargins,
        oneMonthAgo,
      ),
      one_year_margin_percentage: calculatePeriodMargin(
        ordersWithMargins,
        oneYearAgo,
      ),
      historical_margin_percentage: calculatePeriodMargin(ordersWithMargins, 0),
    };

    // 5. Update customer margins
    await convexService.updateCustomerMargins(olistCustomerId, margins);

    logger.info(
      `✅ Margins calculated for customer ${olistCustomerId}`,
      margins,
    );
  } catch (error) {
    logger.error(
      `Failed to calculate margins for customer ${olistCustomerId}:`,
      error,
    );
    throw error;
  }
}

function calculatePeriodMargin(orders: Order[], fromTimestamp: number): number {
  const periodOrders = orders.filter(
    (order) => new Date(order.order_date).getTime() >= fromTimestamp,
  );

  if (!periodOrders.length) return 0;

  const totalRevenue = periodOrders.reduce(
    (sum, order) => sum + order.total_value,
    0,
  );

  if (totalRevenue === 0) return 0;

  const weightedMargin = periodOrders.reduce(
    (sum, order) => sum + order.margin_percentage * order.total_value,
    0,
  );

  return Math.round((weightedMargin / totalRevenue) * 100) / 100;
}

async function calculateOrderMargin(olistOrderId: string): Promise<number> {
  const MAX_RETRIES = 3;
  const RETRY_BASE_DELAY = 5000;
  const ITEM_DELAY = 1500;

  try {
    const order = await olistApiService.fetchOrderById(olistOrderId);

    if (!order?.retorno?.pedido?.itens?.length) {
      logger.warn(`No items found for order ${olistOrderId}`);
      return 0;
    }

    const items = order.retorno.pedido.itens;

    logger.info(
      `Calculating margin for order ${olistOrderId} with ${items.length} items`,
    );

    const itemsWithProductDetails: Array<{
      item?: Item;
      productDetails: OlistProduct | null;
    }> = [];

    for (let i = 0; i < items.length; i++) {
      const orderItem = items[i];
      const productId = orderItem?.item.id_produto;

      // Delay between items (not on first item)
      if (i > 0) {
        await new Promise((resolve) => setTimeout(resolve, ITEM_DELAY));
      }

      let productDetails: OlistProduct | null = null;

      for (let retryCount = 0; retryCount <= MAX_RETRIES; retryCount++) {
        try {
          logger.info(
            `Fetching product ${productId} (attempt ${retryCount + 1})`,
          );

          const productResponse = await olistApiService.fetchProductById(
            productId!,
          );
          productDetails = productResponse?.retorno?.produto || null;

          if (productDetails) {
            logger.info(
              `Successfully fetched product ${productId}: ${productDetails.nome}`,
            );
          }

          break; // Success
        } catch (error) {
          const isRateLimit =
            (error as any).status === 429 ||
            error.message?.includes("rate limit") ||
            error.message?.includes("too many requests");

          if (isRateLimit && retryCount < MAX_RETRIES) {
            // Exponential backoff: 5s, 10s, 20s
            const delay = RETRY_BASE_DELAY * 2 ** retryCount;
            logger.warn(
              `Rate limited on product ${productId}. Retry ${retryCount + 1}/${MAX_RETRIES} in ${delay}ms`,
            );
            await new Promise((resolve) => setTimeout(resolve, delay));
            continue;
          }

          logger.error(
            `Failed to fetch product ${productId} after ${retryCount + 1} attempts:`,
            error,
          );
          break;
        }
      }

      itemsWithProductDetails.push({
        item: orderItem?.item,
        productDetails,
      });
    }

    const margin = calculateMarginFromOrderData(
      order.retorno.pedido,
      itemsWithProductDetails,
    );

    logger.info(`Calculated margin ${margin}% for order ${olistOrderId}`);
    return margin;
  } catch (error) {
    logger.error(
      `Failed to calculate margin for order ${olistOrderId}:`,
      error,
    );
    throw error;
  }
}

function calculateMarginFromOrderData(
  order: OlistOrder,
  itemsWithProductDetails: Array<{
    item: Item;
    productDetails: OlistProduct | null;
  }>,
): number {
  try {
    let totalRevenue = 0;
    let totalCost = 0;
    let itemsWithoutCost = 0;

    for (const itemData of itemsWithProductDetails) {
      const quantity = Number.parseFloat(itemData.item.quantidade);
      const unitPrice = Number.parseFloat(itemData.item.valor_unitario);
      const itemRevenue = quantity * unitPrice;

      let unitCost = 0;

      if (itemData.productDetails) {
        // Use average cost price first, fallback to regular cost price
        unitCost =
          itemData.productDetails.preco_custo_medio > 0
            ? itemData.productDetails.preco_custo_medio
            : itemData.productDetails.preco_custo;

        // If still zero, use selling price from product as fallback
        if (unitCost <= 0) {
          unitCost =
            itemData.productDetails.preco > 0
              ? itemData.productDetails.preco * 0.7 // Assume 30% margin
              : unitPrice * 0.7;
        }
      } else {
        // No product details available, use order price with assumed margin
        unitCost = unitPrice * 0.7; // Assume 30% margin
        itemsWithoutCost++;
      }

      const itemCost = quantity * unitCost;

      totalRevenue += itemRevenue;
      totalCost += itemCost;

      logger.info(
        `Item ${itemData.item.codigo}: qty=${quantity}, price=${unitPrice}, cost=${unitCost}, revenue=${itemRevenue}, itemCost=${itemCost}`,
      );
    }

    if (itemsWithoutCost > 0) {
      logger.warn(
        `${itemsWithoutCost} items processed without product cost data`,
      );
    }

    if (totalRevenue === 0) {
      logger.warn("Total revenue is zero, cannot calculate margin");
      return 0;
    }

    const margin = ((totalRevenue - totalCost) / totalRevenue) * 100;
    const roundedMargin = Math.round(margin * 100) / 100; // Round to 2 decimals

    logger.info(
      `Margin calculation: revenue=${totalRevenue}, cost=${totalCost}, margin=${roundedMargin}%`,
    );

    return roundedMargin;
  } catch (error) {
    logger.error("Error calculating margin from order data:", error);
    return 0;
  }
}
