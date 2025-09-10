import { fastify } from "fastify";
import { queues, setupQueues } from "@/jobs/queue-setup";
import { CronScheduler } from "./cron/scheduler";
import { ConvexHttpClient } from "convex/browser";
import type { JobType } from "./types/job";
// import { startCronJobs } from "@/cron/trigger";

const server = fastify({ logger: true });
const convex = new ConvexHttpClient(process.env.CONVEX_URL || "");

let cronScheduler: CronScheduler;

server.get("/health", async () => ({ status: "ok" }));

// Queue dashboard endpoint
server.get("/queue-status", async () => {
  // Return queue statistics
});

const start = async () => {
  try {
    await setupQueues();

    cronScheduler = new CronScheduler(
      new Map(
        Object.entries(queues).map(([key, value]) => [key as JobType, value]),
      ),
      convex,
    );
    cronScheduler.start();

    // startCronJobs();
    await server.listen({ port: 3000, host: "0.0.0.0" });
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

start();
