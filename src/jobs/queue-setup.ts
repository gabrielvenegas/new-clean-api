import { Queue, Worker } from "bullmq";
import Redis from "ioredis";
import { JobType } from "../types/job.js";
import { processCustomers } from "../workers/customer.worker.js";
import { logger } from "../utils/logger.js";

let redisConnection: Redis | null = null;
const workers: Worker[] = [];
let isSetup = false;

function createRedisConnection(): Redis {
  return new Redis({
    host: process.env.REDIS_HOST || "localhost",
    port: Number.parseInt(process.env.REDIS_PORT || "6379"),
    maxRetriesPerRequest: null,
  });
}

export function getRedisConnection(): Redis {
  if (!redisConnection) {
    redisConnection = createRedisConnection();
  }
  return redisConnection;
}

async function ensureRedisReady(redis: Redis): Promise<void> {
  if (redis.status === "ready") {
    return;
  }

  if (redis.status === "connecting") {
    logger.info("⏳ Redis is connecting, waiting for it to be ready...");
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("Redis connection timeout"));
      }, 15000);
      redis.once("ready", () => {
        clearTimeout(timeout);
        resolve();
      });

      redis.once("error", (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });
  } else {
    await redis.connect();
  }
}

export const queues = {
  [JobType.FETCH_CUSTOMERS]: new Queue(JobType.FETCH_CUSTOMERS, {
    connection: getRedisConnection(),
    defaultJobOptions: {
      removeOnComplete: 10,
      removeOnFail: 50,
      backoff: { type: "exponential", delay: 2000 },
      attempts: 3,
    },
  }),

  [JobType.FETCH_CUSTOMER_ORDERS]: new Queue(JobType.FETCH_CUSTOMER_ORDERS, {
    connection: getRedisConnection(),
    defaultJobOptions: {
      removeOnComplete: 10,
      removeOnFail: 50,
      backoff: { type: "exponential", delay: 2000 },
      attempts: 3,
    },
  }),
};

export async function setupQueues(): Promise<void> {
  if (isSetup) {
    logger.info("⚠️  Queues already setup, skipping...");
    return;
  }

  try {
    logger.info("🔄 Setting up Redis connection...");
    const redis = getRedisConnection();

    logger.info(`📊 Redis status: ${redis.status}`);

    await ensureRedisReady(redis);

    logger.info("✅ Redis connection ready");
    logger.info("🔄 Setting up queue workers...");

    const customerWorker = new Worker(
      JobType.FETCH_CUSTOMERS,
      processCustomers,
      {
        connection: getRedisConnection(),
        concurrency: 1,
        limiter: {
          max: 5,
          duration: 60 * 1000,
        },
      },
    );

    workers.push(customerWorker);

    // biome-ignore lint/complexity/noForEach: <explanation>
    workers.forEach((worker) => {
      worker.on("completed", (job) => {
        logger.info(`✅ Job ${job.id} completed successfully`);
      });

      worker.on("failed", (job, err) => {
        logger.error(`❌ Job ${job?.id} failed:`, err);
      });

      worker.on("error", (err) => {
        logger.error("❌ Worker error:", err);
      });
    });

    isSetup = true;
    logger.info("✅ Queue setup completed successfully");
  } catch (error) {
    logger.error("❌ Failed to setup queues:", error);
    throw error;
  }
}

export async function closeQueues(): Promise<void> {
  if (!isSetup) {
    logger.info("⚠️  Queues not setup, nothing to close");
    return;
  }

  logger.info("🔄 Closing workers...");

  for (const worker of workers) {
    await worker.close();
  }

  logger.info("🔄 Closing queues...");
  for (const queue of Object.values(queues)) {
    await queue.close();
  }

  if (redisConnection) {
    await redisConnection.disconnect();
    redisConnection = null;
  }

  isSetup = false;
  logger.info("✅ All queues closed");
}

process.on("SIGINT", async () => {
  logger.info("Received SIGINT, closing queues...");
  await closeQueues();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  logger.info("Received SIGTERM, closing queues...");
  await closeQueues();
  process.exit(0);
});
