import { ConvexService } from "@/services/convex.service";
import { OlistApiService } from "@/services/olist-api.service";
import { type ProcessCustomerMarginsJobData } from "@/types/job";
import type { Item, OlistOrder } from "@/types/olist/order";
import type { OlistProduct } from "@/types/olist/product";
import type { Order } from "@/types/order";
import { logger } from "@/utils/logger";
import { RateLimiter } from "@/utils/rate-limiter";
import type { Job } from "bullmq";
import PQueue from "p-queue";

class ProductCache {
  private cache = new Map<string, OlistProduct | null>();
  private pendingRequests = new Map<string, Promise<OlistProduct | null>>();

  async getProduct(productId: string): Promise<OlistProduct | null> {
    if (this.cache.has(productId)) {
      return this.cache.get(productId)!;
    }

    if (this.pendingRequests.has(productId)) {
      return this.pendingRequests.get(productId)!;
    }

    const promise = this.fetchProduct(productId);
    this.pendingRequests.set(productId, promise);

    try {
      const result = await promise;
      this.cache.set(productId, result);
      return result;
    } finally {
      this.pendingRequests.delete(productId);
    }
  }

  private async fetchProduct(productId: string): Promise<OlistProduct | null> {
    return productQueue.add(async () => {
      const MAX_RETRIES = 3;

      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
          const product = await circuitBreaker.execute(async () => {
            await adaptiveRateLimiter.wait();

            logger.info(
              `Fetching product ${productId} (attempt ${attempt + 1})`,
            );

            const response = await olistApiService.fetchProductById(productId);
            const product = response?.retorno?.produto || null;

            adaptiveRateLimiter.recordSuccess();

            if (product) {
              logger.info(
                `Successfully fetched product ${productId}: ${product.nome}`,
              );
            }

            return product;
          });

          return product;
        } catch (error) {
          adaptiveRateLimiter.recordFailure();

          if (isRateLimitError(error) && attempt < MAX_RETRIES) {
            const delay = Math.min(
              1000 * 2 ** attempt + Math.random() * 1000,
              30000,
            );
            logger.warn(
              `Rate limited on product ${productId}. Retry ${attempt + 1}/${MAX_RETRIES} in ${delay}ms`,
            );
            await new Promise((resolve) => setTimeout(resolve, delay));
            continue;
          }

          logger.error(
            `Failed to fetch product ${productId} after ${attempt + 1} attempts:`,
            error,
          );
          return null;
        }
      }
      return null;
    });
  }

  clear(): void {
    this.cache.clear();
    this.pendingRequests.clear();
  }
}

class CircuitBreaker {
  private failures = 0;
  private lastFailureTime = 0;
  private readonly failureThreshold = 5;
  private readonly recoveryTime = 60000;

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.isOpen()) {
      throw new Error("Circuit breaker is open - too many failures");
    }

    try {
      const result = await fn();
      this.reset();
      return result;
    } catch (error) {
      this.recordFailure();
      throw error;
    }
  }

  private isOpen(): boolean {
    return (
      this.failures >= this.failureThreshold &&
      Date.now() - this.lastFailureTime < this.recoveryTime
    );
  }

  private recordFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();
  }

  private reset(): void {
    this.failures = 0;
    this.lastFailureTime = 0;
  }
}

class AdaptiveRateLimiter {
  private successCount = 0;
  private failureCount = 0;
  private currentDelay = 2000;
  private readonly minDelay = 1000;
  private readonly maxDelay = 30000;

  async wait(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, this.currentDelay));
  }

  recordSuccess(): void {
    this.successCount++;
    if (this.successCount >= 5 && this.currentDelay > this.minDelay) {
      this.currentDelay = Math.max(this.currentDelay * 0.9, this.minDelay);
      this.successCount = 0;
      logger.info(`Rate limit decreased to ${this.currentDelay}ms`);
    }
  }

  recordFailure(): void {
    this.failureCount++;
    this.currentDelay = Math.min(this.currentDelay * 1.5, this.maxDelay);
    this.successCount = 0;
    logger.warn(`Rate limit increased to ${this.currentDelay}ms after failure`);
  }
}

function isRateLimitError(error: any): boolean {
  return (
    error?.status === 429 ||
    error?.response?.status === 429 ||
    error?.message?.toLowerCase().includes("rate limit") ||
    error?.message?.toLowerCase().includes("too many requests") ||
    error?.message?.toLowerCase().includes("quota exceeded")
  );
}

// Instances
const convexService = new ConvexService();
const olistApiService = new OlistApiService();
const rateLimiter = new RateLimiter(30);

const productQueue = new PQueue({
  concurrency: 1,
  interval: 2000,
  intervalCap: 1,
});

const circuitBreaker = new CircuitBreaker();
const adaptiveRateLimiter = new AdaptiveRateLimiter();
const productCache = new ProductCache();

export async function processCustomerMargins(
  job: Job<ProcessCustomerMarginsJobData>,
): Promise<void> {
  const { customerId, olistCustomerId } = job.data;

  try {
    productCache.clear();

    // 1. Fetch and validate customer
    const customer = await olistApiService.fetchCustomerById(olistCustomerId);

    if (!customer || !customer?.retorno || !customer?.retorno.contato) {
      logger.error("Invalid customer data", { customer });
      return;
    }

    // Check if customer should be deactivated
    if (
      customer.retorno.contato.nome === "Consumidor Final" ||
      customer.retorno.contato.cpf_cnpj === ""
    ) {
      logger.info(`Deactivating customer: ${customer.retorno.contato.nome}`);
      await convexService.deactivateCustomer(olistCustomerId);
      return;
    }

    logger.info(`Processing customer: ${customer.retorno.contato.nome}`);

    // 2. Fetch orders from Olist
    const orderResponse = await olistApiService.fetchCustomerOrdersByCpfCnpj(
      customer.retorno.contato.cpf_cnpj,
    );

    if (orderResponse.retorno.status === "Erro") {
      logger.info("No orders found for customer");
      return;
    }

    // 3. Diff orders to find missing ones
    const existingOrders =
      await convexService.getOrdersByCustomerId(customerId);

    const missingOrders = orderResponse.retorno.pedidos.filter(
      (order) =>
        !existingOrders.some(
          (existingOrder) => existingOrder.olist_order_id === order.pedido.id,
        ),
    );

    // 4. Save missing orders
    if (missingOrders.length > 0) {
      logger.info(`Saving ${missingOrders.length} missing orders`);
      const orders: Order[] = missingOrders.map((order) => ({
        customer_id: customerId,
        margin_percentage: 0,
        olist_customer_id: customer.retorno.contato.id,
        olist_order_id: String(order?.pedido.id),
        order_date: (() => {
          const [day, month, year] = order.pedido.data_pedido.split("/");
          return new Date(`${year}-${month}-${day}`).getTime();
        })(),
        total_value: order.pedido.valor,
        created_at: Date.now(),
        updated_at: Date.now(),
      }));

      await convexService.storeOrders(customerId, orders);
    }

    // 5. Get all orders (including newly saved ones) for margin calculation
    const allOrders = await convexService.getOrdersByCustomerId(customerId);

    if (allOrders.length === 0) {
      logger.info("No orders to process margins for");
      return;
    }

    // 6. Calculate individual order margins in batches
    const BATCH_SIZE = 3;
    const ordersWithMargins: any[] = [];

    for (let i = 0; i < allOrders.length; i += BATCH_SIZE) {
      const batch = allOrders.slice(i, i + BATCH_SIZE);

      logger.info(
        `Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(allOrders.length / BATCH_SIZE)}`,
      );

      const batchResults = await Promise.all(
        batch.map(async (order) => {
          try {
            const margin = await calculateOrderMargin(order.olist_order_id);
            return { ...order, margin_percentage: margin };
          } catch (error) {
            logger.error(
              `Failed to calculate margin for order ${order.olist_order_id}:`,
              error,
            );
            return { ...order, margin_percentage: 0 };
          }
        }),
      );

      ordersWithMargins.push(...batchResults);

      // Add delay between batches (except for the last batch)
      if (i + BATCH_SIZE < allOrders.length) {
        logger.info("Waiting before next batch...");
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
    }

    // 7. Update individual order margins
    const validOrders = ordersWithMargins.filter(
      (order) => order.margin_percentage !== null,
    );

    if (validOrders.length > 0) {
      await convexService.updateOrderMargins(
        validOrders.map((order) => ({
          id: order._id,
          margin: order.margin_percentage,
        })),
      );
      logger.info(`Updated margins for ${validOrders.length} orders`);
    }

    // 8. Calculate customer-level margins
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

    // 9. Update customer margins
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
    (sum, order) => sum + (order.margin_percentage || 0) * order.total_value,
    0,
  );

  return Math.round((weightedMargin / totalRevenue) * 100) / 100;
}

async function calculateOrderMargin(olistOrderId: string): Promise<number> {
  try {
    await rateLimiter.wait();

    const order = await circuitBreaker.execute(async () => {
      await adaptiveRateLimiter.wait();
      return await olistApiService.fetchOrderById(olistOrderId);
    });

    if (!order?.retorno?.pedido?.itens?.length) {
      logger.warn(`No items found for order ${olistOrderId}`);
      return 0;
    }

    const items = order.retorno.pedido.itens;

    logger.info(
      `Calculating margin for order ${olistOrderId} with ${items.length} items`,
    );

    // Fetch all product details using cache
    const itemsWithProductDetails: Array<{
      item: Item;
      productDetails: OlistProduct | null;
    }> = [];

    for (const orderItem of items) {
      const productId = orderItem?.item.id_produto;

      if (!productId) {
        itemsWithProductDetails.push({
          item: orderItem.item,
          productDetails: null,
        });
        continue;
      }

      try {
        const productDetails = await productCache.getProduct(productId);
        itemsWithProductDetails.push({
          item: orderItem.item,
          productDetails,
        });
      } catch (error) {
        logger.error(`Failed to fetch product ${productId}:`, error);
        itemsWithProductDetails.push({
          item: orderItem.item,
          productDetails: null,
        });
      }
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
    return 0;
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
              ? itemData.productDetails.preco * 0.7
              : unitPrice * 0.7;
        }

        logger.info(
          `Product ${itemData.productDetails.nome}: cost=${unitCost}, avg_cost=${itemData.productDetails.preco_custo_medio}, regular_cost=${itemData.productDetails.preco_custo}`,
        );
      } else {
        // No product details available, use order price with assumed margin
        unitCost = unitPrice * 0.7;
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
    const roundedMargin = Math.round(margin * 100) / 100;

    logger.info(
      `Margin calculation: revenue=${totalRevenue}, cost=${totalCost}, margin=${roundedMargin}%`,
    );

    return roundedMargin;
  } catch (error) {
    logger.error("Error calculating margin from order data:", error);
    return 0;
  }
}
