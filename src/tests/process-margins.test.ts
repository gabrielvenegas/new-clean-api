import { setupQueues, closeQueues, queues } from "../jobs/queue-setup.js";
import { JobType } from "../types/job.js";
import { logger } from "../utils/logger.js";

async function testProcessCustomerMargins() {
  try {
    logger.info("🚀 Starting customer margins processing test...");

    // Setup queues
    await setupQueues();

    // Test data - replace with actual customer IDs
    const testCustomerId = "j578a955rzc1wtzkjbzknqrsfx7qckt5";
    const testOlistCustomerId = "756970516";

    // Add customer margins job
    const marginsJob = await queues[JobType.PROCESS_CUSTOMER_MARGINS].add(
      "test-process-customer-margins",
      {
        customerId: testCustomerId,
        olistCustomerId: testOlistCustomerId,
      },
    );

    logger.info(`✅ Customer margins job queued with ID: ${marginsJob.id}`);
    logger.info(`📊 Processing margins for customer: ${testOlistCustomerId}`);

    // Monitor job completion
    logger.info("⏳ Monitoring job completion...");
    const startTime = Date.now();

    while (true) {
      await new Promise((resolve) => setTimeout(resolve, 2000)); // Check every 2s

      const jobStatus = await marginsJob.getState();

      if (jobStatus === "completed") {
        const elapsedSeconds = Math.round((Date.now() - startTime) / 1000);
        logger.info(
          `✅ Customer margins job completed! Time: ${elapsedSeconds}s`,
        );
        break;
      }

      if (jobStatus === "failed") {
        const jobData = marginsJob.asJSON();
        logger.error("❌ Customer margins job failed:", jobData.failedReason);
        throw new Error(`Job failed: ${jobData.failedReason}`);
      }

      logger.info(`📊 Job status: ${jobStatus}`);

      // Safety timeout after 5 minutes
      if (Date.now() - startTime > 300000) {
        logger.warn("⏰ Job taking longer than 5 minutes, stopping monitor");
        break;
      }
    }

    // Get final job details
    const finalJobData = await marginsJob.asJSON();
    logger.info("📊 Final job details:", {
      id: finalJobData.id,
      // @ts-ignore
      state: finalJobData.state,
      progress: finalJobData.progress,
      processedOn: finalJobData.processedOn,
      finishedOn: finalJobData.finishedOn,
    });

    // Clean up
    await closeQueues();
    logger.info("✅ Customer margins test finished!");
  } catch (error) {
    logger.error("❌ Customer margins test failed:", error);
    await closeQueues();
    process.exit(1);
  }
}

testProcessCustomerMargins();
