import { processSplit, type Logger } from "./processSplit.js";

// Single-concurrency in-process queue: jobs run one at a time by chaining onto
// a tail promise. Replaces the Postgres-backed graphile-worker so the service
// has no polling loop and no separate worker process when idle.
let tail: Promise<void> = Promise.resolve();
let logger: Logger = console;

export function setQueueLogger(log: Logger): void {
  logger = log;
}

export function enqueue(jobId: string): void {
  tail = tail
    .then(() => processSplit(jobId, logger))
    // processSplit already records failure on the job row; swallow here so one
    // failed job doesn't break the chain for subsequent jobs.
    .catch(() => void 0);
}
