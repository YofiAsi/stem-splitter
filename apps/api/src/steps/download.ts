import { mkdir } from "node:fs/promises";
import path from "node:path";
import { env } from "../env.js";
import { runProcess } from "../proc.js";

export interface DownloadResult {
  filePath: string;
}

export interface TrimRange {
  startSeconds: number;
  endSeconds?: number;
}

export async function downloadYouTubeAudio(
  videoId: string,
  jobDir: string,
  trim?: TrimRange,
): Promise<DownloadResult> {
  await mkdir(jobDir, { recursive: true });
  const outputTemplate = path.join(jobDir, `original.%(ext)s`);
  const targetPath = path.join(jobDir, `original.mp3`);
  const url = `https://youtu.be/${videoId}`;

  const trimArgs = trim
    ? [
        "--download-sections",
        `*${trim.startSeconds}-${trim.endSeconds ?? "inf"}`,
        "--force-keyframes-at-cuts",
      ]
    : [];

  await runProcess(
    env.YTDLP_BIN,
    [
      "-f",
      "bestaudio",
      "-x",
      "--audio-format",
      "mp3",
      "--no-playlist",
      "--no-progress",
      ...trimArgs,
      "-o",
      outputTemplate,
      url,
    ],
    { timeoutMs: env.DOWNLOAD_TIMEOUT_MS },
  );

  return { filePath: targetPath };
}
