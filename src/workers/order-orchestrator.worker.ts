import { ConvexService } from "../services/convex.service.js";
import { queues } from "../jobs/queue-setup.js";
import { JobType, type FetchCustomerOrdersJobData } from "@/types/job.js";
import { logger } from "../utils/logger.js";
import type { Job } from "bullmq";

const convexService = new ConvexService();

export async function queuePendingOrderJobs(job: Job): Promise<void> {
  logger.info("Starting to queue order jobs for pending customers");

  const customers = await convexService.getPendingMarginCustomers();

  if (!customers.length) {
    logger.info("No pending customers for margin calculation");
    return;
  }

  const orderJobs = customers.map((customer, index) => ({
    name: `fetch-orders-${customer.olist_customer_id}`,
    data: {
      id: `orders-${customer.olist_customer_id}-${Date.now()}`,
      customerId: customer._id,
      olistCustomerId: customer.olist_customer_id,
      page: 1,
      limit: 100,
      createdAt: new Date(),
    } as FetchCustomerOrdersJobData,
    opts: {
      delay: 2000,
    },
  }));

  await queues[JobType.FETCH_CUSTOMER_ORDERS].addBulk(orderJobs);
  logger.info(`✅ Queued ${orderJobs.length} order fetch jobs`);
}
