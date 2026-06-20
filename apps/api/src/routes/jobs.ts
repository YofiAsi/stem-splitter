import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { rm } from "node:fs/promises";
import path from "node:path";
import {
  CreateJobBodySchema,
  JobParamsSchema,
  extractYouTubeId,
  type JobView,
  type JobMode,
  type StemFormat,
} from "@stem-splitter/shared";
import { insertJob, getJob, deleteJob, type JobRecord } from "../db.js";
import { env } from "../env.js";
import { ytdlpSearch, isYtVideoUnavailableMessage } from "../ytdlp.js";
import { enqueueSplit } from "../jobs/enqueueSplit.js";

function rowToView(row: JobRecord): JobView {
  return {
    id: row.id,
    status: row.status as JobView["status"],
    format: row.format,
    mode: row.mode,
    source: { videoId: row.source_video_id, title: row.source_title },
    error: row.error,
    createdAt: row.created_at,
  };
}

async function resolveSource(input: {
  url?: string;
  videoId?: string;
  name?: string;
}): Promise<{ videoId: string; title: string | null }> {
  if (input.videoId) return { videoId: input.videoId, title: null };
  if (input.url) {
    const id = extractYouTubeId(input.url);
    if (!id) throw new Error("could not extract video id from url");
    return { videoId: id, title: null };
  }
  if (input.name) {
    const entries = await ytdlpSearch(input.name, 5);
    const playable = entries.find(
      (e) => !e.is_live && typeof e.duration === "number" && e.duration > 0 && e.duration < 600,
    );
    if (!playable) throw new Error("no playable result for query");
    return { videoId: playable.id, title: playable.title };
  }
  throw new Error("must provide one of url, videoId, name");
}

export async function registerJobRoutes(app: FastifyInstance): Promise<void> {
  app.post("/api/jobs", {
    schema: { body: CreateJobBodySchema },
    handler: async (req, reply) => {
      const body = req.body as {
        url?: string;
        videoId?: string;
        name?: string;
        format: StemFormat;
        mode: JobMode;
        trimStartSeconds?: number;
        trimEndSeconds?: number;
      };
      try {
        const { videoId, title } = await resolveSource(body);
        const id = randomUUID();
        insertJob({
          id,
          format: body.format,
          mode: body.mode,
          source_video_id: videoId,
          source_title: title,
          trim_start_seconds: body.trimStartSeconds ?? null,
          trim_end_seconds: body.trimEndSeconds ?? null,
        });
        await enqueueSplit(id);
        return reply.code(201).send({ jobId: id });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (isYtVideoUnavailableMessage(msg)) {
          return reply.code(422).send({ error: "video_unavailable" });
        }
        req.log.error({ err }, "create job failed");
        return reply.code(400).send({ error: msg });
      }
    },
  });

  app.get("/api/jobs/:id", {
    schema: { params: JobParamsSchema },
    handler: async (req, reply) => {
      const { id } = req.params as { id: string };
      const row = getJob(id);
      if (!row) return reply.code(404).send({ error: "not_found" });
      return reply.send(rowToView(row));
    },
  });

  app.delete("/api/jobs/:id", {
    schema: { params: JobParamsSchema },
    handler: async (req, reply) => {
      const { id } = req.params as { id: string };
      const jobDir = path.join(env.STEMS_DIR, id);
      await rm(jobDir, { recursive: true, force: true }).catch(() => void 0);
      deleteJob(id);
      return reply.code(204).send();
    },
  });
}
