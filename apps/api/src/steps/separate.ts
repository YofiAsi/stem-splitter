import { mkdir } from "node:fs/promises";
import path from "node:path";
import { env } from "../env.js";
import { runProcess } from "../proc.js";

export interface SeparateResult {
  stems: { vocals: string; drums: string; bass: string; other: string };
  wallMs: number;
}

export async function separateStems(
  inputAudio: string,
  jobDir: string,
): Promise<SeparateResult> {
  const outputDir = path.join(jobDir, "stems");
  await mkdir(outputDir, { recursive: true });

  const started = Date.now();
  const result = await runProcess(
    env.PYTHON_BIN,
    [
      env.SEPARATE_PY_PATH,
      "--input",
      inputAudio,
      "--output-dir",
      outputDir,
      "--model",
      env.DEMUCS_MODEL,
      "--device",
      env.DEMUCS_DEVICE,
    ],
    { timeoutMs: env.SEPARATE_TIMEOUT_MS },
  );
  const wallMs = Date.now() - started;

  const lastLine = result.stdout.trim().split(/\r?\n/).pop() ?? "";
  let parsed: { stems?: { vocals?: string; drums?: string; bass?: string; other?: string } };
  try {
    parsed = JSON.parse(lastLine);
  } catch {
    throw new Error(
      `separate.py did not emit JSON on last stdout line. last="${lastLine}" stderr=${result.stderr}`,
    );
  }
  const s = parsed.stems ?? {};
  if (!s.vocals || !s.drums || !s.bass || !s.other) {
    throw new Error(`separate.py missing one of vocals/drums/bass/other: ${lastLine}`);
  }
  return {
    stems: { vocals: s.vocals, drums: s.drums, bass: s.bass, other: s.other },
    wallMs,
  };
}
