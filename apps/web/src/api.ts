export interface SearchResultItem {
  youtubeVideoId: string;
  title: string;
  channel: string;
  durationSeconds: number;
  thumbnailUrl: string;
}

export type StemFormat = "mp3" | "wav";
export type JobMode = "split" | "original";

export type JobStatus =
  | "queued"
  | "downloading"
  | "separating"
  | "packaging"
  | "ready"
  | "failed";

export interface JobView {
  id: string;
  status: JobStatus;
  format: StemFormat;
  mode: JobMode;
  source: { videoId: string; title: string | null };
  error: string | null;
  createdAt: string;
}

const API = "/api";

export async function search(q: string): Promise<SearchResultItem[]> {
  const res = await fetch(`${API}/search?q=${encodeURIComponent(q)}`);
  if (!res.ok) throw new Error(`search failed: ${res.status}`);
  return (await res.json()) as SearchResultItem[];
}

export async function createJob(
  body: {
    videoId?: string;
    url?: string;
    name?: string;
    format: StemFormat;
    mode?: JobMode;
  },
): Promise<{ jobId: string }> {
  const res = await fetch(`${API}/jobs`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? `create job failed: ${res.status}`);
  }
  return (await res.json()) as { jobId: string };
}

export async function getJob(id: string): Promise<JobView> {
  const res = await fetch(`${API}/jobs/${id}`);
  if (!res.ok) throw new Error(`get job failed: ${res.status}`);
  return (await res.json()) as JobView;
}

export async function deleteJob(id: string): Promise<void> {
  await fetch(`${API}/jobs/${id}`, { method: "DELETE" });
}

export function stemUrl(jobId: string, name: string): string {
  return `${API}/jobs/${jobId}/stems/${name}`;
}

export function stemDownloadUrl(jobId: string, name: string): string {
  return `${API}/jobs/${jobId}/stems/${name}?download=1`;
}
