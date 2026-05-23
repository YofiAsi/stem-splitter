import { spawn } from "node:child_process";

export interface RunResult {
  stdout: string;
  stderr: string;
}

export function runProcess(
  cmd: string,
  args: string[],
  opts: { timeoutMs: number },
): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (c: Buffer) => (stdout += c.toString()));
    child.stderr.on("data", (c: Buffer) => (stderr += c.toString()));

    const killTimer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`${cmd} timed out after ${opts.timeoutMs}ms\nstderr: ${stderr}`));
    }, opts.timeoutMs);

    child.on("error", (err) => {
      clearTimeout(killTimer);
      reject(err);
    });
    child.on("exit", (code) => {
      clearTimeout(killTimer);
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${cmd} exited ${code}\nstderr: ${stderr}`));
    });
  });
}
