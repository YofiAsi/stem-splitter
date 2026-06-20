import { mkdir, copyFile, rm } from "node:fs/promises";
import path from "node:path";
import { env } from "../env.js";
import { loadJob, setJobStatus } from "../db.js";
import { downloadYouTubeAudio } from "../steps/download.js";
import { separateStems } from "../steps/separate.js";
import { toMp3, toWav } from "../steps/transcode.js";
import { STEM_NAMES } from "@stem-splitter/shared";

export interface Logger {
  info: (msg: string) => void;
  error: (msg: string) => void;
}

async function writeOriginal(
  originalMp3: string,
  outDir: string,
  format: "mp3" | "wav",
): Promise<void> {
  if (format === "wav") {
    await toWav(originalMp3, outDir, "original");
  } else {
    await copyFile(originalMp3, path.join(outDir, "original.mp3"));
  }
}

export async function processSplit(
  jobId: string,
  log: Logger = console,
): Promise<void> {
  if (!jobId) throw new Error("jobId missing");

  const jobDir = path.join(env.STEMS_DIR, jobId);
  const outDir = path.join(jobDir, "out");
  log.info(`processSplit ${jobId} start`);

  try {
    const job = loadJob(jobId);

    setJobStatus(jobId, "downloading");
    const trim =
      job.trim_start_seconds != null
        ? {
            startSeconds: job.trim_start_seconds,
            endSeconds: job.trim_end_seconds ?? undefined,
          }
        : undefined;
    const { filePath: originalMp3 } = await downloadYouTubeAudio(
      job.source_video_id,
      jobDir,
      trim,
    );

    await mkdir(outDir, { recursive: true });

    if (job.mode === "original") {
      setJobStatus(jobId, "packaging");
      await writeOriginal(originalMp3, outDir, job.format);
      setJobStatus(jobId, "ready");
      log.info(`processSplit ${jobId} ready (original)`);
      return;
    }

    setJobStatus(jobId, "separating");
    const { stems, wallMs } = await separateStems(originalMp3, jobDir);
    log.info(`separate.py wall=${wallMs}ms`);

    setJobStatus(jobId, "packaging");

    for (const name of STEM_NAMES) {
      const src = stems[name];
      if (job.format === "wav") {
        await copyFile(src, path.join(outDir, `${name}.wav`));
      } else {
        await toMp3(src, outDir, name);
      }
    }

    await writeOriginal(originalMp3, outDir, job.format);

    setJobStatus(jobId, "ready");
    log.info(`processSplit ${jobId} ready`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error(`processSplit ${jobId} failed: ${message}`);
    setJobStatus(jobId, "failed", message);
    await rm(jobDir, { recursive: true, force: true }).catch(() => void 0);
    throw err;
  }
}
