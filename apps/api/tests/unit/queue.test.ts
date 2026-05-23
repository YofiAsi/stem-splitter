import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../../src/jobs/processSplit.js", () => ({
  processSplit: vi.fn(),
}));

import { enqueue } from "../../src/jobs/queue.js";
import { processSplit } from "../../src/jobs/processSplit.js";

async function drain(ms = 80): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

describe("in-process queue", () => {
  beforeEach(() => {
    vi.mocked(processSplit).mockReset();
  });

  it("runs jobs one at a time in FIFO order", async () => {
    const order: string[] = [];
    let active = 0;
    let maxActive = 0;
    vi.mocked(processSplit).mockImplementation(async (jobId: string) => {
      active++;
      maxActive = Math.max(maxActive, active);
      await new Promise((r) => setTimeout(r, 10));
      order.push(jobId);
      active--;
    });

    enqueue("a");
    enqueue("b");
    enqueue("c");
    await drain();

    expect(order).toEqual(["a", "b", "c"]);
    expect(maxActive).toBe(1);
  });

  it("keeps draining after a job throws", async () => {
    const done: string[] = [];
    vi.mocked(processSplit).mockImplementation(async (jobId: string) => {
      if (jobId === "boom") throw new Error("failed");
      done.push(jobId);
    });

    enqueue("boom");
    enqueue("after");
    await drain();

    expect(done).toEqual(["after"]);
  });
});
