import { Pool } from "pg";
import { env } from "./env.js";

export const pool = new Pool({ connectionString: env.DATABASE_URL });

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS jobs (
  id              uuid PRIMARY KEY,
  status          text NOT NULL,
  format          text NOT NULL,
  mode            text NOT NULL DEFAULT 'split',
  source_video_id text NOT NULL,
  source_title    text,
  error           text,
  created_at      timestamptz NOT NULL DEFAULT NOW()
);
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS mode text NOT NULL DEFAULT 'split';
CREATE INDEX IF NOT EXISTS jobs_created_at_idx ON jobs (created_at DESC);
`;

export async function ensureSchema(): Promise<void> {
  await pool.query(SCHEMA_SQL);
}
