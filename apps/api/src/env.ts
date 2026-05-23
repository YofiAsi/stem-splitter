import { z } from "zod";

const EnvSchema = z.object({
  PORT: z.coerce.number().int().positive().default(4000),
  HOST: z.string().default("0.0.0.0"),
  SQLITE_PATH: z.string().default("/var/stems/db.sqlite"),
  STEMS_DIR: z.string().default("/var/stems"),
  WEB_DIR: z.string().default("/app/apps/web/dist"),

  // yt-dlp (search + download)
  YTDLP_BIN: z.string().default("yt-dlp"),
  YTDLP_TIMEOUT_MS: z.coerce.number().int().positive().default(15_000),
  DOWNLOAD_TIMEOUT_MS: z.coerce.number().int().positive().default(180_000),

  // demucs separation
  PYTHON_BIN: z.string().default("python3"),
  SEPARATE_PY_PATH: z.string().default("/app/apps/api/python/separate.py"),
  DEMUCS_MODEL: z.string().default("htdemucs"),
  DEMUCS_DEVICE: z.enum(["cuda", "cpu"]).default("cuda"),
  SEPARATE_TIMEOUT_MS: z.coerce.number().int().positive().default(600_000),

  // ffmpeg transcode
  FFMPEG_BIN: z.string().default("ffmpeg"),
  TRANSCODE_TIMEOUT_MS: z.coerce.number().int().positive().default(120_000),
});

export const env = EnvSchema.parse(process.env);
export type Env = typeof env;
