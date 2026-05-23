import type { DatabaseSync } from "node:sqlite";
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { env } from "./env.js";

// Load the builtin via createRequire so Vite/Vitest's static import analysis
// (whose builtin list predates node:sqlite) never tries to bundle it.
const nodeRequire = createRequire(import.meta.url);
const { DatabaseSync: DatabaseSyncCtor } = nodeRequire(
  "node:sqlite",
) as typeof import("node:sqlite");

if (env.SQLITE_PATH !== ":memory:") {
  mkdirSync(path.dirname(env.SQLITE_PATH), { recursive: true });
}

export const db: DatabaseSync = new DatabaseSyncCtor(env.SQLITE_PATH);
db.exec("PRAGMA journal_mode = WAL;");

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS jobs (
  id              TEXT PRIMARY KEY,
  status          TEXT NOT NULL,
  format          TEXT NOT NULL,
  mode            TEXT NOT NULL DEFAULT 'split',
  source_video_id TEXT NOT NULL,
  source_title    TEXT,
  error           TEXT,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS jobs_created_at_idx ON jobs (created_at DESC);
`;

export interface JobRecord {
  id: string;
  status: string;
  format: "mp3" | "wav";
  mode: "split" | "original";
  source_video_id: string;
  source_title: string | null;
  error: string | null;
  created_at: string;
}

const NON_TERMINAL = ["queued", "downloading", "separating", "packaging"];

export function ensureSchema(): void {
  db.exec(SCHEMA_SQL);
}

export function insertJob(job: {
  id: string;
  format: "mp3" | "wav";
  mode: "split" | "original";
  source_video_id: string;
  source_title: string | null;
}): void {
  db.prepare(
    `INSERT INTO jobs (id, status, format, mode, source_video_id, source_title)
     VALUES (@id, 'queued', @format, @mode, @source_video_id, @source_title)`,
  ).run(job);
}

export function getJob(id: string): JobRecord | undefined {
  return db
    .prepare(
      `SELECT id, status, format, mode, source_video_id, source_title, error, created_at
       FROM jobs WHERE id = ?`,
    )
    .get(id) as JobRecord | undefined;
}

export function loadJob(id: string): JobRecord {
  const job = getJob(id);
  if (!job) throw new Error(`job ${id} not found`);
  return job;
}

export function setJobStatus(
  id: string,
  status: string,
  error: string | null = null,
): void {
  db.prepare(`UPDATE jobs SET status = ?, error = ? WHERE id = ?`).run(
    status,
    error,
    id,
  );
}

export function deleteJob(id: string): void {
  db.prepare(`DELETE FROM jobs WHERE id = ?`).run(id);
}

// On boot, any job left mid-flight is unrecoverable (in-process queue lost it
// and the on-disk files are ephemeral), so mark it failed.
export function reconcileOrphans(): number {
  const placeholders = NON_TERMINAL.map(() => "?").join(", ");
  const res = db
    .prepare(
      `UPDATE jobs SET status = 'failed', error = 'interrupted by restart'
       WHERE status IN (${placeholders})`,
    )
    .run(...NON_TERMINAL);
  return Number(res.changes);
}
