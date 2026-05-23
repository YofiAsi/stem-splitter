import { enqueue } from "./queue.js";

export async function enqueueSplit(jobId: string): Promise<void> {
  enqueue(jobId);
}
