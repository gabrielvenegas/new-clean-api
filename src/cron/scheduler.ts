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

  private static readonly BATCH_SIZE = 500;

  private static readonly CUSTOMER_DISCOVERY_SCHEDULE =
    process.env.CRON_CUSTOMER_DISCOVERY || "0 20 * * *";
  private static readonly MARGIN_CALCULATION_SCHEDULE =
    process.env.CRON_MARGIN_CALCULATION || "15 23 * * *";
  private static readonly TIMEZONE = process.env.TZ || "America/Sao_Paulo";
  private static readonly RUN_ON_STARTUP =
    process.env.CRON_RUN_ON_STARTUP === "true";

  constructor(queues: Map<JobType, Queue>, convexClient: ConvexHttpClient) {
    this.queues = queues;
    this.convex = convexClient;
  }

  public start(): void {
    logger.info("▶️  Starting cron scheduler...");
    logger.info(`🌍 Timezone: ${CronScheduler.TIMEZONE}`);
    logger.info(
      `📅 Customer Discovery: ${CronScheduler.CUSTOMER_DISCOVERY_SCHEDULE}`,
    );
    logger.info(
      `📅 Margin Calculation: ${CronScheduler.MARGIN_CALCULATION_SCHEDULE}`,
    );

    this.scheduleCustomerDiscovery();
    this.scheduleMarginCalculation();

    if (CronScheduler.RUN_ON_STARTUP) {
      logger.info("🚀 RUN_ON_STARTUP enabled, triggering jobs now...");
      this.triggerCustomerDiscovery().catch((err) =>
        logger.error("❌ Startup customer discovery failed:", err),
      );
      this.triggerMarginCalculation().catch((err) =>
        logger.error("❌ Startup margin calculation failed:", err),
      );
    }

    logger.info("✅ Cron scheduler started with all jobs.");
  }

  public stop(): void {
    logger.info("⏹️  Stopping all scheduled cron jobs...");
    this.scheduledJobs.forEach((job) => job.destroy());
    this.scheduledJobs.length = 0;
    logger.info("🛑 All cron jobs stopped.");
  }

  // Manual trigger methods
  public async triggerCustomerDiscovery(): Promise<void> {
    logger.info("🔧 Manually triggering customer discovery...");
    await this.executeCustomerDiscovery();
  }

  public async triggerMarginCalculation(): Promise<void> {
    logger.info("🔧 Manually triggering margin calculation...");
    await this.executeMarginCalculation();
  }

  private scheduleCustomerDiscovery(): void {
    const job = cron.schedule(
      CronScheduler.CUSTOMER_DISCOVERY_SCHEDULE,
      async () => {
        await this.executeCustomerDiscovery();
      },
    );

    this.scheduledJobs.push(job);
    logger.info(
      `➡️  Scheduled daily customer discovery: ${CronScheduler.CUSTOMER_DISCOVERY_SCHEDULE}`,
    );
  }

  private scheduleMarginCalculation(): void {
    const job = cron.schedule(
      CronScheduler.MARGIN_CALCULATION_SCHEDULE,
      async () => {
        await this.executeMarginCalculation();
      },
    );

    this.scheduledJobs.push(job);
    logger.info(
      `➡️  Scheduled margin calculation: ${CronScheduler.MARGIN_CALCULATION_SCHEDULE}`,
    );
  }

  // Extracted logic for reuse
  private async executeCustomerDiscovery(): Promise<void> {
    const startTime = Date.now();
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
      logger.info(
        `✅ Customer discovery job queued successfully (${Date.now() - startTime}ms)`,
      );
    } catch (error) {
      logger.error("❌ Failed to queue customer discovery job:");
      // @ts-ignore
      logger.error("Error message:", error?.message);
      // @ts-ignore
      logger.error("Error stack:", error?.stack);
    }
  }

  private async executeMarginCalculation(): Promise<void> {
    const startTime = Date.now();
    logger.info("🕰️  Cron: Starting margin calculation...");

    const queue = this.queues.get(JobType.PROCESS_CUSTOMER_MARGINS);
    if (!queue) {
      logger.error("❌ PROCESS_CUSTOMER_MARGINS queue not found");
      return;
    }

    try {
      logger.info("📞 Querying Convex for outdated customers...");

      const outdatedCustomers = await this.convex.query(
        api.customers.getAllCustomers,
        {
          limit: CronScheduler.BATCH_SIZE,
        },
      );

      logger.info(
        `✅ Convex query successful: ${outdatedCustomers.length} customers (${Date.now() - startTime}ms)`,
      );

      if (outdatedCustomers.length === 0) {
        logger.info("✅ No outdated customers found");
        return;
      }

      logger.info(`🔍 Found ${outdatedCustomers.length} outdated customers`);

      const marginJobs = outdatedCustomers.map((customer) => ({
        name: `process-margin-${customer.olist_customer_id}`,
        data: {
          id: `margin-${customer.olist_customer_id}-${Date.now()}`,
          customerId: customer._id,
          olistCustomerId: customer.olist_customer_id,
          createdAt: new Date(),
        } as ProcessCustomerMarginsJobData,
      }));

      logger.info("📦 Adding jobs to queue...");
      await queue.addBulk(marginJobs);
      logger.info(
        `✅ Queued ${marginJobs.length} margin jobs (${Date.now() - startTime}ms total)`,
      );
    } catch (error) {
      logger.error("❌ Margin calculation cron failed:");
      // @ts-ignore
      logger.error("Error name:", error?.name);
      // @ts-ignore
      logger.error("Error message:", error?.message);
      // @ts-ignore
      logger.error("Error stack:", error?.stack);
      // @ts-ignore
      if (error?.cause) {
        // @ts-ignore
        logger.error("Error cause:", error.cause);
      }
    }
  }
}
