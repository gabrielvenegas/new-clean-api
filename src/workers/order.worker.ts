import { queues } from "@/jobs/queue-setup.js";
import { JobType, type FetchCustomerOrdersJobData } from "@/types/job.js";
import type { Order } from "@/types/order.js";
import type { Job } from "bullmq";
import { ConvexService } from "../services/convex.service.js";
import { OlistApiService } from "../services/olist-api.service.js";
import { logger } from "../utils/logger.js";

const olistApi = new OlistApiService();
const convexService = new ConvexService();

export async function processCustomerOrders(
  job: Job<FetchCustomerOrdersJobData>,
): Promise<void> {
  const { customerId, page, limit } = job.data;

  logger.info(
    `Processing orders for customer ${customerId} - Page ${page}, Limit ${limit}`,
  );

  const convexCustomer = await convexService.getCustomerById(customerId);

  if (!convexCustomer) {
    logger.error(`Customer ${customerId} not found in Convex`);
    return;
  }

  const customer = await olistApi.fetchCustomerById(
    convexCustomer?.olist_customer_id,
  );

  try {
    const response = await olistApi.fetchCustomerOrders(
      customer.retorno.contato.nome,
      page,
      limit,
    );

    logger.info(
      `Fetched ${response.retorno?.pedidos?.length || 0} orders for customer ${customerId} on page ${page}`,
    );

    if (!response.retorno?.pedidos?.length) {
      logger.info(
        `No orders found for customer ${customerId}. Deactivating customer`,
      );
      await convexService.deactivateCustomer(customerId);
      return;
    }

    console.log(`Orders for customer ${customerId}:`, response.retorno.pedidos);

    const orders: Order[] = response.retorno.pedidos.map((order: any) => ({
      customer_id: customerId,
      margin_percentage: 0,
      olist_customer_id: convexCustomer.olist_customer_id,
      // @ts-ignore
      olist_order_id: String(order?.pedido.id),
      created_at: Date.now(),
      updated_at: Date.now(),
    }));

    await convexService.storeOrders(customerId, orders);

    if (response.retorno.pagina < response.retorno.numero_paginas) {
      const nextPageJob = {
        name: `fetch-orders-${customerId}-page-${page + 1}`,
        data: {
          id: `orders-${customerId}-${page + 1}-${Date.now()}`,
          customerId,
          page: page + 1,
          limit,
          createdAt: new Date(),
        } as FetchCustomerOrdersJobData,
        opts: {
          delay: 10000,
        },
      };

      await queues[JobType.FETCH_CUSTOMER_ORDERS].add(
        nextPageJob.name,
        nextPageJob.data,
        nextPageJob.opts,
      );
      logger.info(
        `Queued next page for customer ${customerId}: ${page + 1}/${response.retorno.numero_paginas}`,
      );
    } else {
      logger.info(`✅ All order pages processed for customer ${customerId}!`);
    }

    await queues[JobType.PROCESS_CUSTOMER_MARGINS].add(
      `calculate-margins-${customerId}`,
      {
        id: `margins-${customerId}-${Date.now()}`,
        customerId,
        olistCustomerId: convexCustomer.olist_customer_id,
        createdAt: new Date(),
      },
      { delay: 5000 },
    );

    await job.updateProgress(
      Math.round((page / response.retorno.numero_paginas) * 100),
    );
  } catch (error) {
    logger.error(
      `Order worker failed for customer ${customerId}, page ${page}:`,
      error,
    );

    if (error instanceof Error && error.message === "RATE_LIMITED") {
      throw new Error(
        `Rate limited for customer ${customerId} on page ${page} - will retry`,
      );
    }

    throw error;
  }
}
