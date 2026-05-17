import { mkdir } from "node:fs/promises";
import path from "node:path";
import { env } from "../env.js";
import { runProcess } from "../proc.js";

export interface DownloadResult {
  filePath: string;
}

export async function downloadYouTubeAudio(
  videoId: string,
  jobDir: string,
): Promise<DownloadResult> {
  await mkdir(jobDir, { recursive: true });
  const outputTemplate = path.join(jobDir, `original.%(ext)s`);
  const targetPath = path.join(jobDir, `original.mp3`);
  const url = `https://youtu.be/${videoId}`;

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
      "-o",
      outputTemplate,
      url,
    ],
    { timeoutMs: env.DOWNLOAD_TIMEOUT_MS },
  );

  return { filePath: targetPath };
}
