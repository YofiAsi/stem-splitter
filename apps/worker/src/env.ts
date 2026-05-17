import { z } from "zod";

const EnvSchema = z.object({
  DATABASE_URL: z.string().min(1),
  STEMS_DIR: z.string().default("/var/stems"),
  PYTHON_BIN: z.string().default("python3"),
  SEPARATE_PY_PATH: z.string().default("/app/apps/worker/python/separate.py"),
  DEMUCS_MODEL: z.string().default("htdemucs"),
  DEMUCS_DEVICE: z.enum(["cuda", "cpu"]).default("cuda"),
  YTDLP_BIN: z.string().default("yt-dlp"),
  FFMPEG_BIN: z.string().default("ffmpeg"),
  DOWNLOAD_TIMEOUT_MS: z.coerce.number().int().positive().default(180_000),
  SEPARATE_TIMEOUT_MS: z.coerce.number().int().positive().default(600_000),
  TRANSCODE_TIMEOUT_MS: z.coerce.number().int().positive().default(120_000),
});

export const env = EnvSchema.parse(process.env);
export type Env = typeof env;
