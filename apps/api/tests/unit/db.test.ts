import { describe, it, expect, beforeEach } from "vitest";
import {
  db,
  ensureSchema,
  insertJob,
  setJobStatus,
  getJob,
  reconcileOrphans,
} from "../../src/db.js";

function seed(id: string, status?: string, error?: string): void {
  insertJob({
    id,
    format: "mp3",
    mode: "split",
    source_video_id: "v",
    source_title: null,
  });
  if (status) setJobStatus(id, status, error ?? null);
}

describe("reconcileOrphans", () => {
  beforeEach(() => {
    ensureSchema();
    db.exec("DELETE FROM jobs");
  });

  it("fails non-terminal jobs and leaves terminal ones untouched", () => {
    seed("queued"); // status defaults to 'queued'
    seed("separating", "separating");
    seed("ready", "ready");
    seed("failed", "failed", "original error");

    const changed = reconcileOrphans();

    expect(changed).toBe(2);
    expect(getJob("queued")!.status).toBe("failed");
    expect(getJob("queued")!.error).toBe("interrupted by restart");
    expect(getJob("separating")!.status).toBe("failed");
    expect(getJob("ready")!.status).toBe("ready");
    expect(getJob("failed")!.status).toBe("failed");
    expect(getJob("failed")!.error).toBe("original error");
  });
});
