import { spawn } from "node:child_process";
import { env } from "./env.js";

export interface YtDlpSearchEntry {
  id: string;
  title: string;
  channel?: string;
  uploader?: string;
  duration?: number;
  is_live?: boolean;
  thumbnails?: Array<{ url: string; width?: number; height?: number }>;
  thumbnail?: string;
}

export async function ytdlpSearch(query: string, count = 10): Promise<YtDlpSearchEntry[]> {
  const { stdout } = await runYtdlp([
    "--dump-single-json",
    "--flat-playlist",
    "--no-warnings",
    `ytsearch${count}:${query}`,
  ]);
  const parsed = JSON.parse(stdout) as { entries?: YtDlpSearchEntry[] };
  return parsed.entries ?? [];
}

export async function ytdlpInfo(videoId: string): Promise<YtDlpSearchEntry> {
  const { stdout } = await runYtdlp([
    "--dump-single-json",
    "--no-warnings",
    "--no-playlist",
    `https://youtu.be/${videoId}`,
  ]);
  return JSON.parse(stdout) as YtDlpSearchEntry;
}

export function isYtVideoUnavailableMessage(message: string): boolean {
  const s = message.toLowerCase();
  return (
    s.includes("video unavailable") ||
    s.includes("private video") ||
    s.includes("members only") ||
    s.includes("members-only") ||
    s.includes("this video is not available")
  );
}

// Age-restricted / bot-check videos need YouTube login cookies, which we don't
// have. Surface a clear, actionable message instead of a generic failure.
export function isYtAuthRequiredMessage(message: string): boolean {
  const s = message.toLowerCase();
  return (
    s.includes("sign in to confirm your age") ||
    s.includes("confirm you're not a bot") ||
    s.includes("confirm you are not a bot") ||
    s.includes("use --cookies")
  );
}

function runYtdlp(args: string[]): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(env.YTDLP_BIN, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (c: Buffer) => (stdout += c.toString()));
    child.stderr.on("data", (c: Buffer) => (stderr += c.toString()));

    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`yt-dlp timed out after ${env.YTDLP_TIMEOUT_MS}ms`));
    }, env.YTDLP_TIMEOUT_MS);

    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("exit", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`yt-dlp exited ${code}: ${stderr}`));
    });
  });
}
