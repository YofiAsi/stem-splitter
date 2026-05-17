import path from "node:path";
import { env } from "../env.js";
import { runProcess } from "../proc.js";

export async function toMp3(inputPath: string, outDir: string, name: string): Promise<string> {
  const out = path.join(outDir, `${name}.mp3`);
  await runProcess(
    env.FFMPEG_BIN,
    ["-y", "-loglevel", "error", "-i", inputPath, "-codec:a", "libmp3lame", "-q:a", "2", out],
    { timeoutMs: env.TRANSCODE_TIMEOUT_MS },
  );
  return out;
}

export async function toWav(inputPath: string, outDir: string, name: string): Promise<string> {
  const out = path.join(outDir, `${name}.wav`);
  await runProcess(
    env.FFMPEG_BIN,
    ["-y", "-loglevel", "error", "-i", inputPath, "-codec:a", "pcm_s16le", out],
    { timeoutMs: env.TRANSCODE_TIMEOUT_MS },
  );
  return out;
}
