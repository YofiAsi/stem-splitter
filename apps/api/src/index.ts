import { existsSync } from "node:fs";
import Fastify from "fastify";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from "fastify-type-provider-zod";

import { env } from "./env.js";
import { ensureSchema, reconcileOrphans } from "./db.js";
import { setQueueLogger } from "./jobs/queue.js";
import { registerSearchRoutes } from "./routes/search.js";
import { registerJobRoutes } from "./routes/jobs.js";
import { registerStemRoutes } from "./routes/stems.js";

async function build() {
  const app = Fastify({
    logger: { level: process.env.LOG_LEVEL ?? "info" },
    trustProxy: true,
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  await app.register(cors, {
    origin: true,
    credentials: true,
  });

  app.get("/api/health", async () => ({ ok: true }));

  await registerSearchRoutes(app);
  await registerJobRoutes(app);
  await registerStemRoutes(app);

  // Serve the built React UI from this same process (replaces the nginx
  // container). Skipped when WEB_DIR is absent (e.g. unit tests, api-only dev).
  if (existsSync(env.WEB_DIR)) {
    await app.register(fastifyStatic, { root: env.WEB_DIR });
    app.setNotFoundHandler((req, reply) => {
      if (req.method === "GET" && !req.url.startsWith("/api")) {
        return reply.sendFile("index.html");
      }
      return reply.code(404).send({ error: "not_found" });
    });
  }

  app.setErrorHandler((err, _req, reply) => {
    const error = err as Error & { statusCode?: number };
    const statusCode = error.statusCode ?? 500;
    reply.log.error({ err }, "request error");
    reply.code(statusCode).send({ error: error.message ?? "internal_error" });
  });

  return app;
}

async function main(): Promise<void> {
  ensureSchema();
  const orphaned = reconcileOrphans();
  const app = await build();
  setQueueLogger({
    info: (msg) => app.log.info(msg),
    error: (msg) => app.log.error(msg),
  });
  if (orphaned > 0) {
    app.log.warn({ orphaned }, "marked interrupted jobs as failed on boot");
  }
  try {
    await app.listen({ port: env.PORT, host: env.HOST });
    app.log.info({ port: env.PORT, host: env.HOST }, "stem-splitter listening");
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

export { build };

if (!process.env.VITEST) {
  main();
}
