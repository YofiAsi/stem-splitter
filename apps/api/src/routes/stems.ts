import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import type { FastifyInstance } from "fastify";
import { JobParamsSchema, STEM_NAMES } from "@stem-splitter/shared";
import { pool } from "../db.js";
import { env } from "../env.js";
import { sanitize } from "../util/sanitize.js";

const ALLOWED_NAMES = new Set<string>([...STEM_NAMES, "original"]);

const StemParamsSchema = JobParamsSchema.extend({
  name: z.string(),
});

const StemQuerySchema = z.object({
  download: z.string().optional(),
});

export async function registerStemRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/jobs/:id/stems/:name", {
    schema: { params: StemParamsSchema, querystring: StemQuerySchema },
    handler: async (req, reply) => {
      const { id, name } = req.params as { id: string; name: string };
      const { download } = req.query as { download?: string };

      if (!ALLOWED_NAMES.has(name)) {
        return reply.code(404).send({ error: "unknown_stem" });
      }

      const { rows } = await pool.query<{
        status: string;
        format: "mp3" | "wav";
        mode: "split" | "original";
        source_title: string | null;
        source_video_id: string;
      }>(
        `SELECT status, format, mode, source_title, source_video_id
         FROM jobs WHERE id = $1`,
        [id],
      );
      if (rows.length === 0) return reply.code(404).send({ error: "not_found" });
      const job = rows[0];
      if (job.status !== "ready") {
        return reply.code(409).send({ error: "not_ready", status: job.status });
      }
      if (job.mode === "original" && name !== "original") {
        return reply.code(404).send({ error: "stem_not_available" });
      }

      const filePath = path.join(
        env.STEMS_DIR,
        id,
        "out",
        `${name}.${job.format}`,
      );

      let size: number;
      try {
        const s = await stat(filePath);
        size = s.size;
      } catch {
        return reply.code(410).send({ error: "files_missing" });
      }

      const contentType = job.format === "mp3" ? "audio/mpeg" : "audio/wav";
      reply
        .header("Content-Type", contentType)
        .header("Accept-Ranges", "bytes")
        .header("Cache-Control", "private, max-age=3600");

      if (download) {
        const base = sanitize(job.source_title ?? job.source_video_id);
        const suffix = name === "original" ? "" : `_${name}`;
        reply.header(
          "Content-Disposition",
          `attachment; filename="${base}${suffix}.${job.format}"`,
        );
      }

      const range = req.headers.range;
      if (range) {
        const m = /^bytes=(\d*)-(\d*)$/.exec(range);
        if (m) {
          const start = m[1] ? parseInt(m[1], 10) : 0;
          const end = m[2] ? parseInt(m[2], 10) : size - 1;
          if (start >= size || end >= size || start > end) {
            return reply
              .code(416)
              .header("Content-Range", `bytes */${size}`)
              .send();
          }
          reply
            .code(206)
            .header("Content-Range", `bytes ${start}-${end}/${size}`)
            .header("Content-Length", String(end - start + 1));
          return reply.send(createReadStream(filePath, { start, end }));
        }
      }

      reply.header("Content-Length", String(size));
      return reply.send(createReadStream(filePath));
    },
  });
}
