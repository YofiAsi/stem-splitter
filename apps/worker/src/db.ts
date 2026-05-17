import { Pool } from "pg";
import { env } from "./env.js";

export const pool = new Pool({ connectionString: env.DATABASE_URL });

export async function setJobStatus(
  jobId: string,
  status: string,
  error: string | null = null,
): Promise<void> {
  await pool.query(
    `UPDATE jobs SET status = $2, error = $3 WHERE id = $1`,
    [jobId, status, error],
  );
}

export interface JobRow {
  id: string;
  status: string;
  format: "mp3" | "wav";
  mode: "split" | "original";
  source_video_id: string;
  source_title: string | null;
}

export async function loadJob(jobId: string): Promise<JobRow> {
  const { rows } = await pool.query<JobRow>(
    `SELECT id, status, format, mode, source_video_id, source_title FROM jobs WHERE id = $1`,
    [jobId],
  );
  if (rows.length === 0) throw new Error(`job ${jobId} not found`);
  return rows[0];
}
