import { OlistApiService } from "../services/olist-api.service.js";
import { ConvexService } from "../services/convex.service.js";
import { logger } from "../utils/logger.js";
import { JobType, type FetchCustomerOrdersJobData } from "@/types/job.js";
import type { Job } from "bullmq";
import { queues } from "@/jobs/queue-setup.js";

const olistApi = new OlistApiService();
const convexService = new ConvexService();

export async function processCustomerOrders(
  job: Job<FetchCustomerOrdersJobData>,
): Promise<void> {
  const { customerId, olistCustomerId, page, limit } = job.data;

  logger.info(
    `Processing orders for customer ${olistCustomerId} - Page ${page}, Limit ${limit}`,
  );

  const customer = await olistApi.fetchCustomerById(olistCustomerId);

  try {
    const response = await olistApi.fetchCustomerOrders(
      customer.retorno.contato.nome,
      page,
      limit,
    );

    logger.info(
      `Fetched ${response.retorno?.pedidos?.length || 0} orders for customer ${olistCustomerId} on page ${page}`,
    );

    if (!response.retorno?.pedidos?.length) {
      logger.info(
        `No orders found for customer ${olistCustomerId}. Deactivating customer`,
      );
      await convexService.deactivateCustomer(customerId);
      return;
    }

    // Just console log for now
    console.log(`Orders for customer ${customerId}:`, response.retorno.pedidos);

    // Handle pagination if there are more pages
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
