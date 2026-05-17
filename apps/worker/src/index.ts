import { run } from "graphile-worker";
import { env } from "./env.js";
import { processSplit } from "./tasks/processSplit.js";

async function main(): Promise<void> {
  const runner = await run({
    connectionString: env.DATABASE_URL,
    concurrency: 1,
    noHandleSignals: false,
    pollInterval: 1_000,
    taskList: {
      process_split: processSplit,
    },
  });

  console.log(
    JSON.stringify({
      msg: "worker started",
      concurrency: 1,
      model: env.DEMUCS_MODEL,
      device: env.DEMUCS_DEVICE,
    }),
  );

  await runner.promise;
}

main().catch((err) => {
  console.error("worker crashed", err);
  process.exit(1);
});
