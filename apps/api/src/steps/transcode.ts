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

export async function mixDown(
  inputPaths: string[],
  outDir: string,
  name: string,
  format: "mp3" | "wav",
): Promise<string> {
  const out = path.join(outDir, `${name}.${format}`);
  const codecArgs =
    format === "mp3"
      ? ["-codec:a", "libmp3lame", "-q:a", "2"]
      : ["-codec:a", "pcm_s16le"];
  await runProcess(
    env.FFMPEG_BIN,
    [
      "-y",
      "-loglevel",
      "error",
      ...inputPaths.flatMap((p) => ["-i", p]),
      "-filter_complex",
      // normalize=0 keeps stem levels so the sum matches the source mix;
      // the limiter only catches the occasional overshoot above full scale.
      `amix=inputs=${inputPaths.length}:duration=longest:normalize=0,alimiter=limit=0.98`,
      ...codecArgs,
      out,
    ],
    { timeoutMs: env.TRANSCODE_TIMEOUT_MS },
  );
  return out;
}
