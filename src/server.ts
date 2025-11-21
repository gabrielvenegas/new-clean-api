import { queues, setupQueues } from "@/jobs/queue-setup";
import { ConvexHttpClient } from "convex/browser";
import { fastify } from "fastify";
import { CronScheduler } from "./cron/scheduler";
import type { JobType } from "./types/job";
// import { startCronJobs } from "@/cron/trigger";

const server = fastify({ logger: true });
const convex = new ConvexHttpClient(process.env.CONVEX_URL || "");

let cronScheduler: CronScheduler;

server.get("/health", async () => ({ status: "ok" }));

server.get("/queue", async () => {
  const queueStats = {};
  for (const [jobType, queue] of Object.entries(queues)) {
    try {
      const stats = await queue.getJobCounts(
        "waiting",
        "active",
        "delayed",
        "completed",
        "failed",
      );
      (queueStats as any)[jobType] = stats;
    } catch (error) {
      server.log.error(`Error getting stats for queue ${jobType}:`, error);
      (queueStats as any)[jobType] = { error: "Could not retrieve stats" };
    }
  }
  return queueStats;
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

    await server.listen({ port: 3000, host: "0.0.0.0" });
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

start();
