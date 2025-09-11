import { setupQueues, closeQueues, queues } from "../jobs/queue-setup.js";
import { JobType } from "../types/job.js";
import { logger } from "../utils/logger.js";

async function testOrderOrchestrationComplete() {
  try {
    logger.info("🚀 Starting complete order orchestration test...");

    // Setup queues ONCE
    await setupQueues();

    // Add orchestrator job
    const orchestratorJob = await queues[JobType.QUEUE_PENDING_ORDERS].add(
      "test-queue-pending-orders",
      {
        id: `orchestrator-test-${Date.now()}`,
        createdAt: new Date(),
      },
    );

    logger.info(`✅ Orchestrator job queued with ID: ${orchestratorJob.id}`);

    // Wait for orchestrator to queue all jobs
    logger.info("⏳ Waiting for orchestrator to queue all individual jobs...");
    await new Promise((resolve) => setTimeout(resolve, 15000));

    const initialStatus =
      await queues[JobType.FETCH_CUSTOMER_ORDERS].getJobCounts();
    const totalJobs =
      (initialStatus.waiting ?? 0) +
      (initialStatus.delayed ?? 0) +
      (initialStatus.active ?? 0);

    logger.info(`📊 Total jobs queued: ${totalJobs}`);

    if (totalJobs === 0) {
      logger.info("No jobs were queued. Test complete.");
      await closeQueues();
      return;
    }

    // Monitor until ALL jobs complete - no artificial limits
    logger.info(
      "⏳ Monitoring job completion... Will wait until ALL jobs finish!",
    );
    let lastStatus = initialStatus;
    let iterations = 0;
    const startTime = Date.now();

    while (true) {
      await new Promise((resolve) => setTimeout(resolve, 10000)); // Check every 10s

      const currentStatus =
        await queues[JobType.FETCH_CUSTOMER_ORDERS].getJobCounts();
      const activeJobs =
        (currentStatus.active ?? 0) +
        (currentStatus.waiting ?? 0) +
        (currentStatus.delayed ?? 0);
      const totalProcessed =
        (currentStatus.completed ?? 0) + (currentStatus.failed ?? 0);

      logger.info(
        `📊 Status: ${currentStatus.completed ?? 0} completed, ${currentStatus.failed ?? 0} failed, ${activeJobs} remaining`,
      );

      // ALL jobs completed or failed
      if (activeJobs === 0) {
        const elapsedMinutes = Math.round((Date.now() - startTime) / 60000);
        logger.info(
          `✅ ALL JOBS PROCESSED! Total time: ${elapsedMinutes} minutes`,
        );
        logger.info("📊 Final results:", currentStatus);
        break;
      }

      // Show progress if significant change
      if (currentStatus.completed !== lastStatus.completed) {
        const progress = Math.round(
          ((currentStatus.completed ?? 0) / totalJobs) * 100,
        );
        const elapsedMinutes = Math.round((Date.now() - startTime) / 60000);
        logger.info(
          `📈 Progress: ${progress}% (${currentStatus.completed}/${totalJobs}) - ${elapsedMinutes}m elapsed`,
        );
      }

      lastStatus = currentStatus;
      iterations++;

      // Safety check - warn if running for more than 2 hours but don't stop
      if (iterations % 72 === 0) {
        // Every ~12 minutes (72 * 10s)
        const elapsedHours = Math.round((Date.now() - startTime) / 3600000);
        logger.warn(
          `⏰ Test has been running for ${elapsedHours} hours. Still waiting for ${activeJobs} jobs...`,
        );
      }
    }

    // Clean up
    await closeQueues();
    logger.info("✅ Complete orchestration test finished!");
  } catch (error) {
    logger.error("❌ Orchestration test failed:", error);
    await closeQueues();
    process.exit(1);
  }
}

testOrderOrchestrationComplete();
