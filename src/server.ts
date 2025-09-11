import { fastify } from "fastify";
import { queues, setupQueues } from "@/jobs/queue-setup";
import { CronScheduler } from "./cron/scheduler";
import { ConvexHttpClient } from "convex/browser";
import type { JobType } from "./types/job";
// import { startCronJobs } from "@/cron/trigger";
import { Novu } from "@novu/api";
import { ChatOrPushProviderEnum } from "@novu/api/models/components";

const server = fastify({ logger: true });
const convex = new ConvexHttpClient(process.env.CONVEX_URL || "");

let cronScheduler: CronScheduler;

server.get("/health", async () => ({ status: "ok" }));

server.get("/queue-status", async () => {
  // Return queue statistics
});

server.get("/test-novu", async () => {
  const novu = new Novu({
    secretKey: "a84a7279bba9a4420d65de0e3f9f286e",
  });

  await novu.subscribers.credentials.update(
    {
      providerId: ChatOrPushProviderEnum.Discord,
      credentials: {
        webhookUrl:
          "https://discord.com/api/webhooks/1415340598294085674/uFFG4zMo6tFzc_2VunLKHn1hyIbT-126CrVkOEGGuOxerPgu8819RJyybKCV1FWuasoY",
      },
      integrationIdentifier: "discord",
    },
    "5a83a0dd-4164-497b-a57e-15069af67d72",
  );
});

server.get("/test-novu-message", async () => {
  const novu = new Novu({
    secretKey: "a84a7279bba9a4420d65de0e3f9f286e",
  });

  try {
    const result = await novu.trigger({
      workflowId: "sector-notifier",
      payload: {
        post: {
          text: `
            ### Teste 123 :airplane:
          `,
        },
      },
      to: "5a83a0dd-4164-497b-a57e-15069af67d72",
    });

    return result.result;
  } catch (err) {
    console.log(err);
  }
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
