import Fastify from "fastify";
import cors from "@fastify/cors";
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from "fastify-type-provider-zod";

import { env } from "./env.js";
import { ensureSchema } from "./db.js";
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

  app.setErrorHandler((err, _req, reply) => {
    const error = err as Error & { statusCode?: number };
    const statusCode = error.statusCode ?? 500;
    reply.log.error({ err }, "request error");
    reply.code(statusCode).send({ error: error.message ?? "internal_error" });
  });

  return app;
}

async function main(): Promise<void> {
  await ensureSchema();
  const app = await build();
  try {
    await app.listen({ port: env.PORT, host: env.HOST });
    app.log.info({ port: env.PORT, host: env.HOST }, "api listening");
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

export { build };

if (!process.env.VITEST) {
  main();
}
