import type { Queue } from "bullmq";
import type { ConvexHttpClient } from "convex/browser";
import cron, { type ScheduledTask } from "node-cron";
import { api } from "../../convex/_generated/api.js";
import {
  JobType,
  type FetchCustomersJobData,
  type ProcessCustomerMarginsJobData,
} from "../types/job.js";
import { logger } from "../utils/logger.js";

export class CronScheduler {
  private readonly queues: Map<JobType, Queue>;
  private readonly convex: ConvexHttpClient;
  private readonly scheduledJobs: ScheduledTask[] = [];

  private static readonly STALENESS_THRESHOLD = 0;
  private static readonly BATCH_SIZE = 500;

  constructor(queues: Map<JobType, Queue>, convexClient: ConvexHttpClient) {
    this.queues = queues;
    this.convex = convexClient;
  }

  public start(): void {
    logger.info("▶️  Starting cron scheduler...");
    this.scheduleCustomerDiscovery();
    this.scheduleMarginCalculation();
    logger.info("✅ Cron scheduler started with all jobs.");
  }

  public stop(): void {
    logger.info("⏹️  Stopping all scheduled cron jobs...");
    // biome-ignore lint/complexity/noForEach: <explanation>
    this.scheduledJobs.forEach((job) => job.destroy());
    this.scheduledJobs.length = 0;
    logger.info("🛑 All cron jobs stopped.");
  }

  private scheduleCustomerDiscovery(): void {
    const job = cron.schedule(
      "0 5 * * *",
      async () => {
        logger.info("🕰️  Cron: Starting daily customer discovery...");

        const queue = this.queues.get(JobType.FETCH_CUSTOMERS);
        if (!queue) {
          logger.error("❌ FETCH_CUSTOMERS queue not found");
          return;
        }

        const jobData: FetchCustomersJobData = {
          id: `discovery-${Date.now()}`,
          page: 1,
          limit: 50,
          createdAt: new Date(),
        };

        try {
          await queue.add("daily-customer-discovery", jobData);
          logger.info("✅ Customer discovery job queued successfully");
        } catch (error) {
          logger.error("❌ Failed to queue customer discovery job:", error);
        }
      },
      {
        timezone: "America/Sao_Paulo",
      },
    );

    this.scheduledJobs.push(job);
    logger.info(
      `➡️  Scheduled daily customer discovery job ${process.env.CRON_CUSTOMER_DISCOVERY}`,
    );
  }

  private scheduleMarginCalculation(): void {
    const job = cron.schedule(
      "40 23 * * *",
      async () => {
        logger.info("🕰️  Cron: Starting margin calculation...");

        const queue = this.queues.get(JobType.PROCESS_CUSTOMER_MARGINS);
        if (!queue) {
          logger.error("❌ PROCESS_CUSTOMER_MARGINS queue not found");
          return;
        }

        try {
          const outdatedCustomers = await this.convex.query(
            api.customer.getAllCustomers,
            {
              // stalenessThreshold: CronScheduler.STALENESS_THRESHOLD,
              limit: CronScheduler.BATCH_SIZE,
            },
          );

          if (outdatedCustomers.length === 0) {
            logger.info("✅ No outdated customers found");
            return;
          }

          logger.info(
            `🔍 Found ${outdatedCustomers.length} outdated customers`,
          );

          const marginJobs = outdatedCustomers.map((customer) => ({
            name: `process-margin-${customer.olist_customer_id}`,
            data: {
              id: `margin-${customer.olist_customer_id}-${Date.now()}`,
              customerId: customer._id,
              olistCustomerId: customer.olist_customer_id,
              createdAt: new Date(),
            } as ProcessCustomerMarginsJobData,
          }));

          await queue.addBulk(marginJobs);
          logger.info(`✅ Queued ${marginJobs.length} margin jobs`);
        } catch (error) {
          logger.error("❌ Margin calculation cron failed:", error);
        }
      },
      {
        timezone: "America/Sao_Paulo",
      },
    );

    this.scheduledJobs.push(job);
    logger.info("➡️  Scheduled margin calculation job (every 10 minutes)");
  }
}
