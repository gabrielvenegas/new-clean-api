import {
  JobType,
  type FetchCustomerOrdersJobData,
  type FetchCustomersJobData,
} from "@/types/job.js";
import type { Job } from "bullmq";
import { queues } from "../jobs/queue-setup.js";
import { ConvexService } from "../services/convex.service.js";
import { OlistApiService } from "../services/olist-api.service.js";
import { logger } from "../utils/logger.js";

const olistApi = new OlistApiService();
const convexService = new ConvexService();

export async function processCustomers(
  job: Job<FetchCustomersJobData>,
): Promise<void> {
  const { page, limit } = job.data;

  logger.info(`Processing customers - Page ${page}, Limit ${limit}`);

  try {
    const response = await olistApi.fetchCustomers(page, limit);

    logger.info(
      `Fetched ${response.retorno?.contatos?.length} customers from page ${page}`,
    );

    if (response.retorno?.contatos?.length === 0) {
      logger.info("No customers found, ending pagination");
      return;
    }

    const companies = response.retorno?.contatos?.filter(
      ({ contato }) => contato.tipo_pessoa === "J",
    );

    const transformedCustomers = companies.map((company) => ({
      olist_customer_id: company?.contato?.id,
      is_active: true,
      created_at: Date.now(),
      updated_at: Date.now(),
    }));

    const savedCustomers =
      await convexService.saveCustomers(transformedCustomers);
    logger.info(`Saved ${transformedCustomers.length} customers to Convex`);

    const orderJobs = savedCustomers.map((customer, index) => ({
      name: `fetch-orders-${customer}`,
      data: {
        customerId: customer,
        page: 1,
        limit: 100,
        createdAt: new Date(),
      } as FetchCustomerOrdersJobData,
      opts: {
        delay: index * 2000,
      },
    }));

    if (orderJobs.length > 0) {
      await queues[JobType.FETCH_CUSTOMER_ORDERS].addBulk(orderJobs);
      logger.info(`✅ Queued ${orderJobs.length} order fetch jobs`);
    }

    if (response.retorno.pagina < response.retorno.numero_paginas) {
      const nextPageJob = {
        name: `fetch-customers-page-${page + 1}`,
        data: {
          id: `customers-${page + 1}-${Date.now()}`,
          page: page + 1,
          limit,
          createdAt: new Date(),
        } as FetchCustomersJobData,
        opts: {
          delay: 10000,
          jobId: `fetch-customers-page-${page + 1}`,
        },
      };

      await queues[JobType.FETCH_CUSTOMERS].add(
        nextPageJob.name,
        nextPageJob.data,
        nextPageJob.opts,
      );
      logger.info(
        `Queued next page: ${page + 1}/${response.retorno.numero_paginas}`,
      );
    } else {
      logger.info("✅ All customer pages processed!");
    }

    await job.updateProgress(
      Math.round((page / response.retorno.numero_paginas) * 100),
    );
  } catch (error) {
    logger.error(`Customer worker failed for page ${page}:`, error);

    if (error instanceof Error && error.message === "RATE_LIMITED") {
      throw new Error(`Rate limited on page ${page} - will retry`);
    }

    throw error;
  }
}
