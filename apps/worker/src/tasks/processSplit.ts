import type { Task } from "graphile-worker";
import { mkdir, copyFile, rm } from "node:fs/promises";
import path from "node:path";
import { env } from "../env.js";
import { loadJob, setJobStatus } from "../db.js";
import { downloadYouTubeAudio } from "../steps/download.js";
import { separateStems } from "../steps/separate.js";
import { toMp3, toWav } from "../steps/transcode.js";
import { STEM_NAMES } from "@stem-splitter/shared";

interface ProcessSplitPayload {
  jobId: string;
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

export const processSplit: Task = async (payload, helpers) => {
  const { jobId } = payload as ProcessSplitPayload;
  if (!jobId) throw new Error("jobId missing from payload");

  const jobDir = path.join(env.STEMS_DIR, jobId);
  const outDir = path.join(jobDir, "out");
  helpers.logger.info(`processSplit ${jobId} start`);

  try {
    const job = await loadJob(jobId);

    await setJobStatus(jobId, "downloading");
    const { filePath: originalMp3 } = await downloadYouTubeAudio(
      job.source_video_id,
      jobDir,
    );

    await mkdir(outDir, { recursive: true });

    if (job.mode === "original") {
      await setJobStatus(jobId, "packaging");
      await writeOriginal(originalMp3, outDir, job.format);
      await setJobStatus(jobId, "ready");
      helpers.logger.info(`processSplit ${jobId} ready (original)`);
      return;
    }

    await setJobStatus(jobId, "separating");
    const { stems, wallMs } = await separateStems(originalMp3, jobDir);
    helpers.logger.info(`separate.py wall=${wallMs}ms`);

    await setJobStatus(jobId, "packaging");

    for (const name of STEM_NAMES) {
      const src = stems[name];
      if (job.format === "wav") {
        await copyFile(src, path.join(outDir, `${name}.wav`));
      } else {
        await toMp3(src, outDir, name);
      }
    }

    await writeOriginal(originalMp3, outDir, job.format);

    await setJobStatus(jobId, "ready");
    helpers.logger.info(`processSplit ${jobId} ready`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    helpers.logger.error(`processSplit ${jobId} failed: ${message}`);
    await setJobStatus(jobId, "failed", message);
    await rm(jobDir, { recursive: true, force: true }).catch(() => void 0);
    throw err;
  }
};
