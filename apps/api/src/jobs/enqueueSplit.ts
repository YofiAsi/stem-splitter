import { quickAddJob } from "graphile-worker";
import { env } from "../env.js";

export async function enqueueSplit(jobId: string): Promise<void> {
  await quickAddJob(
    { connectionString: env.DATABASE_URL },
    "process_split",
    { jobId },
  );
}
