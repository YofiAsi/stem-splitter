import { useState } from "react";
import type { JobMode, SearchResultItem, StemFormat } from "./api.js";

export interface DownloadOptions {
  mode: JobMode;
  format: StemFormat;
  trimStartSeconds?: number;
  trimEndSeconds?: number;
}

/** Parse "m:ss", "h:mm:ss", or a bare seconds count into seconds. */
export function parseTimestamp(input: string): number | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const parts = trimmed.split(":").map((p) => p.trim());
  if (parts.some((p) => p === "" || !/^\d+$/.test(p))) return null;
  const nums = parts.map(Number);
  if (nums.length > 3) return null;
  let seconds = 0;
  for (const n of nums) seconds = seconds * 60 + n;
  return seconds;
}

interface Props {
  item: SearchResultItem;
  onCancel: () => void;
  onStart: (opts: DownloadOptions) => void;
}

export function DownloadOptionsModal({ item, onCancel, onStart }: Props) {
  const [mode, setMode] = useState<JobMode>("split");
  const [format, setFormat] = useState<StemFormat>("mp3");
  const [trimEnabled, setTrimEnabled] = useState(false);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handleStart(): void {
    let trimStartSeconds: number | undefined;
    let trimEndSeconds: number | undefined;

    if (trimEnabled) {
      const startSec = parseTimestamp(start);
      if (startSec === null) {
        setError("Enter a valid start time (e.g. 0:30).");
        return;
      }
      trimStartSeconds = startSec;

      if (end.trim()) {
        const endSec = parseTimestamp(end);
        if (endSec === null) {
          setError("Enter a valid end time (e.g. 1:45).");
          return;
        }
        if (endSec <= startSec) {
          setError("End time must be after start time.");
          return;
        }
        trimEndSeconds = endSec;
      }
    }

    onStart({ mode, format, trimStartSeconds, trimEndSeconds });
  }

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3 className="modal-title">{item.title}</h3>

        <div className="modal-field">
          <span className="modal-label">Type</span>
          <div className="mode-toggle">
            <button
              type="button"
              className={mode === "split" ? "active" : ""}
              onClick={() => setMode("split")}
            >
              Split
            </button>
            <button
              type="button"
              className={mode === "original" ? "active" : ""}
              onClick={() => setMode("original")}
            >
              Original
            </button>
          </div>
        </div>

        <div className="modal-field">
          <span className="modal-label">Format</span>
          <select
            value={format}
            onChange={(e) => setFormat(e.target.value as StemFormat)}
          >
            <option value="mp3">mp3</option>
            <option value="wav">wav</option>
          </select>
        </div>

        <div className="modal-field">
          <label className="modal-check">
            <input
              type="checkbox"
              checked={trimEnabled}
              onChange={(e) => {
                setTrimEnabled(e.target.checked);
                setError(null);
              }}
            />
            Trim — download only part of the video
          </label>
        </div>

        {trimEnabled && (
          <div className="trim-row">
            <label>
              Start
              <input
                type="text"
                inputMode="numeric"
                placeholder="0:30"
                value={start}
                onChange={(e) => setStart(e.target.value)}
              />
            </label>
            <label>
              End <span className="muted">(optional)</span>
              <input
                type="text"
                inputMode="numeric"
                placeholder="1:45"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
              />
            </label>
          </div>
        )}

        {error && <p className="error">{error}</p>}

        <div className="modal-actions">
          <button type="button" className="secondary" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="primary" onClick={handleStart}>
            Start ▶
          </button>
        </div>
      </div>
    </div>
  );
}
