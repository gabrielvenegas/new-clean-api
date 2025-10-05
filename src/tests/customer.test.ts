import { closeQueues, queues, setupQueues } from "../jobs/queue-setup.js";
import { JobType, type FetchCustomersJobData } from "../types/job.js";
import { logger } from "../utils/logger.js";

async function testCustomerPipeline() {
  try {
    logger.info("🚀 Starting customer pipeline test...");

    // Setup queues ONCE
    await setupQueues();

    // Add first customer job
    const jobData: FetchCustomersJobData = {
      id: `customers-test-${Date.now()}`,
      page: 1,
      limit: 5,
      createdAt: new Date(),
    };

    const job = await queues[JobType.FETCH_CUSTOMERS].add(
      "test-customers",
      jobData,
    );
    logger.info(`✅ Customer job queued with ID: ${job.id}`);

    // Wait a bit for job processing (optional)
    logger.info("⏳ Waiting 30 seconds for job processing...");
    await new Promise((resolve) => setTimeout(resolve, 30000));

    // Clean up
    await closeQueues();
    logger.info("✅ Test completed successfully!");
  } catch (error) {
    logger.error("❌ Test failed:", error);
    await closeQueues(); // Cleanup on error
    process.exit(1);
  }
}

testCustomerPipeline();
