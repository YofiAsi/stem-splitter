import { z } from "zod";

export const SearchResultItemSchema = z.object({
  youtubeVideoId: z.string(),
  title: z.string(),
  channel: z.string(),
  durationSeconds: z.number().int().nonnegative(),
  thumbnailUrl: z.string().url(),
});
export type SearchResultItem = z.infer<typeof SearchResultItemSchema>;

export const SearchQuerySchema = z.object({
  q: z.string().trim().min(1).max(200),
});

export const StemFormatSchema = z.enum(["mp3", "wav"]);
export type StemFormat = z.infer<typeof StemFormatSchema>;

export const JobModeSchema = z.enum(["split", "original"]);
export type JobMode = z.infer<typeof JobModeSchema>;

export const JobStatusSchema = z.enum([
  "queued",
  "downloading",
  "separating",
  "packaging",
  "ready",
  "failed",
]);
export type JobStatus = z.infer<typeof JobStatusSchema>;

const youtubeUrlPattern =
  /^(https?:\/\/)?(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/|m\.youtube\.com\/watch\?v=)[\w-]{11}/;

export const CreateJobBodySchema = z
  .object({
    url: z.string().regex(youtubeUrlPattern).optional(),
    videoId: z.string().regex(/^[\w-]{11}$/).optional(),
    name: z.string().trim().min(1).max(200).optional(),
    format: StemFormatSchema.default("mp3"),
    mode: JobModeSchema.default("split"),
    trimStartSeconds: z.number().int().nonnegative().optional(),
    trimEndSeconds: z.number().int().positive().optional(),
  })
  .refine(
    (v) => [v.url, v.videoId, v.name].filter(Boolean).length === 1,
    { message: "exactly one of url, videoId, or name must be provided" },
  )
  .refine(
    (v) =>
      v.trimStartSeconds === undefined ||
      v.trimEndSeconds === undefined ||
      v.trimEndSeconds > v.trimStartSeconds,
    { message: "trimEndSeconds must be greater than trimStartSeconds" },
  );
export type CreateJobBody = z.infer<typeof CreateJobBodySchema>;

export const CreateJobResponseSchema = z.object({
  jobId: z.string().uuid(),
});

export const JobSourceSchema = z.object({
  videoId: z.string(),
  title: z.string().nullable(),
});
export type JobSource = z.infer<typeof JobSourceSchema>;

export const JobViewSchema = z.object({
  id: z.string().uuid(),
  status: JobStatusSchema,
  format: StemFormatSchema,
  mode: JobModeSchema,
  source: JobSourceSchema,
  error: z.string().nullable(),
  createdAt: z.string(),
});
export type JobView = z.infer<typeof JobViewSchema>;

export const JobParamsSchema = z.object({
  id: z.string().uuid(),
});

export const STEM_NAMES = ["vocals", "drums", "bass", "other"] as const;
export type StemName = (typeof STEM_NAMES)[number];

export function extractYouTubeId(input: string): string | null {
  const trimmed = input.trim();
  if (/^[\w-]{11}$/.test(trimmed)) return trimmed;
  const m = trimmed.match(
    /(?:youtube\.com\/(?:watch\?v=|shorts\/)|youtu\.be\/)([\w-]{11})/,
  );
  return m ? m[1] : null;
}
