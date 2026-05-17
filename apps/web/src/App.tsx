import { useEffect, useRef, useState } from "react";
import {
  createJob,
  deleteJob,
  getJob,
  search,
  stemDownloadUrl,
  stemUrl,
  type JobMode,
  type JobStatus,
  type JobView,
  type SearchResultItem,
  type StemFormat,
} from "./api.js";
import { StemPlayer } from "./StemPlayer.js";

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

const SPLIT_STEPS = ["Downloading", "Separating", "Preparing", "Done"] as const;
const ORIGINAL_STEPS = ["Downloading", "Preparing", "Done"] as const;

const STATUS_LABEL: Record<JobStatus, string> = {
  queued: "Downloading…",
  downloading: "Downloading…",
  separating: "Separating…",
  packaging: "Preparing…",
  ready: "Done",
  failed: "Failed",
};

function stepIndex(status: JobStatus, mode: JobMode): number {
  if (status === "failed") return -1;
  if (mode === "original") {
    switch (status) {
      case "queued":
      case "downloading":
        return 0;
      case "separating":
      case "packaging":
        return 1;
      case "ready":
        return 2;
    }
  }
  switch (status) {
    case "queued":
    case "downloading":
      return 0;
    case "separating":
      return 1;
    case "packaging":
      return 2;
    case "ready":
      return 3;
  }
  return -1;
}

interface SelectedSource {
  title: string;
  channel: string;
  thumbnailUrl: string;
}

export function App() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResultItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [format, setFormat] = useState<StemFormat>("mp3");
  const [mode, setMode] = useState<JobMode>("split");
  const [job, setJob] = useState<JobView | null>(null);
  const [selectedSource, setSelectedSource] = useState<SelectedSource | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<number | null>(null);

  useEffect(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    if (!query.trim()) {
      setResults([]);
      return;
    }
    debounceRef.current = window.setTimeout(async () => {
      setSearching(true);
      try {
        setResults(await search(query));
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setSearching(false);
      }
    }, 400);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [query]);

  useEffect(() => {
    if (!job || job.status === "ready" || job.status === "failed") return;
    const id = window.setInterval(async () => {
      try {
        const next = await getJob(job.id);
        setJob(next);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    }, 2000);
    return () => window.clearInterval(id);
  }, [job]);

  async function startJob(
    item: SearchResultItem,
    mode: JobMode,
  ): Promise<void> {
    setError(null);
    setJob(null);
    setSelectedSource({
      title: item.title,
      channel: item.channel,
      thumbnailUrl: item.thumbnailUrl,
    });
    try {
      const { jobId } = await createJob({
        videoId: item.youtubeVideoId,
        format,
        mode,
      });
      const first = await getJob(jobId);
      setJob(first);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSelectedSource(null);
    }
  }

  async function back(): Promise<void> {
    if (job && job.status === "ready") {
      await deleteJob(job.id).catch(() => void 0);
    }
    setJob(null);
    setSelectedSource(null);
    setError(null);
  }

  const steps = job?.mode === "original" ? ORIGINAL_STEPS : SPLIT_STEPS;
  const currentStep = job ? stepIndex(job.status, job.mode) : -1;
  const displayTitle =
    selectedSource?.title ?? job?.source.title ?? "Loading…";

  return (
    <div className="container">
      <h1>stem-splitter</h1>
      <p className="muted">
        Search YouTube, separate into vocals / drums / bass / other, or just
        download the original audio.
      </p>

      {!job && (
        <>
          <div className="row">
            <input
              className="search"
              type="text"
              placeholder="Search for a song…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoFocus
            />
            <div className="mode-toggle">
              <button
                className={mode === "split" ? "active" : ""}
                onClick={() => setMode("split")}
              >
                Split
              </button>
              <button
                className={mode === "original" ? "active" : ""}
                onClick={() => setMode("original")}
              >
                Download original
              </button>
            </div>
            <label className="format">
              Format:
              <select
                value={format}
                onChange={(e) => setFormat(e.target.value as StemFormat)}
              >
                <option value="mp3">mp3</option>
                <option value="wav">wav</option>
              </select>
            </label>
          </div>

          {searching && <p className="muted">Searching…</p>}
          {error && <p className="error">{error}</p>}

          <ul className="results">
            {results.slice(0, 10).map((r) => (
              <li
                key={r.youtubeVideoId}
                className="result"
                onClick={() => startJob(r, mode)}
              >
                <img src={r.thumbnailUrl} alt="" />
                <div className="meta">
                  <div className="title">{r.title}</div>
                  <div className="muted">
                    {r.channel} · {formatDuration(r.durationSeconds)}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      {job && (
        <div className="job">
          <div className="job-header">
            {selectedSource?.thumbnailUrl && (
              <img
                className="thumb"
                src={selectedSource.thumbnailUrl}
                alt=""
              />
            )}
            <div className="job-meta">
              <h2>{displayTitle}</h2>
              {selectedSource?.channel && (
                <div className="muted">{selectedSource.channel}</div>
              )}
            </div>
          </div>

          {job.status !== "failed" && (
            <ol className="stepper">
              {steps.map((label, i) => (
                <li
                  key={label}
                  className={
                    i < currentStep
                      ? "done"
                      : i === currentStep
                        ? "active"
                        : "pending"
                  }
                >
                  <span className="dot" />
                  <span>{label}</span>
                </li>
              ))}
            </ol>
          )}

          {job.status !== "ready" && job.status !== "failed" && (
            <div className="status">{STATUS_LABEL[job.status]}</div>
          )}

          {job.status === "failed" && (
            <>
              <div className="status error">Failed</div>
              {job.error && <p className="error">{job.error}</p>}
            </>
          )}

          {job.status === "ready" && job.mode === "split" && (
            <StemPlayer jobId={job.id} />
          )}

          {job.status === "ready" && job.mode === "original" && (
            <div className="original-player">
              <audio controls src={stemUrl(job.id, "original")} />
              <a
                className="download-btn"
                href={stemDownloadUrl(job.id, "original")}
              >
                ⬇ Download {job.format.toUpperCase()}
              </a>
            </div>
          )}

          <button className="back" onClick={back}>
            Back to search
          </button>
        </div>
      )}
    </div>
  );
}
