import { z } from "zod";

const EnvSchema = z.object({
  DATABASE_URL: z.string().min(1),
  PORT: z.coerce.number().int().positive().default(4000),
  HOST: z.string().default("0.0.0.0"),
  YTDLP_BIN: z.string().default("yt-dlp"),
  YTDLP_TIMEOUT_MS: z.coerce.number().int().positive().default(15_000),
  STEMS_DIR: z.string().default("/var/stems"),
});

export const env = EnvSchema.parse(process.env);
export type Env = typeof env;
