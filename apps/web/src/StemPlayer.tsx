import { useEffect, useRef, useState } from "react";
import Multitrack from "wavesurfer-multitrack";
import { stemDownloadUrl, stemUrl } from "./api.js";

const STEMS = ["vocals", "drums", "bass", "other"] as const;
type StemName = (typeof STEMS)[number];

const COLORS: Record<StemName, { wave: string; progress: string }> = {
  vocals: { wave: "#f59e0b", progress: "#b45309" },
  drums: { wave: "#ef4444", progress: "#991b1b" },
  bass: { wave: "#3b82f6", progress: "#1d4ed8" },
  other: { wave: "#10b981", progress: "#047857" },
};

interface Props {
  jobId: string;
}

export function StemPlayer({ jobId }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mtRef = useRef<Multitrack | null>(null);
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [state, setState] = useState<
    Record<StemName, { muted: boolean; soloed: boolean }>
  >({
    vocals: { muted: false, soloed: false },
    drums: { muted: false, soloed: false },
    bass: { muted: false, soloed: false },
    other: { muted: false, soloed: false },
  });

  useEffect(() => {
    if (!containerRef.current) return;
    const mt = Multitrack.create(
      STEMS.map((name) => ({
        id: name,
        url: stemUrl(jobId, name),
        startPosition: 0,
        volume: 1,
        draggable: false,
        options: {
          waveColor: COLORS[name].wave,
          progressColor: COLORS[name].progress,
          height: 60,
        },
      })),
      {
        container: containerRef.current,
        minPxPerSec: 10,
        rightButtonDrag: false,
        cursorColor: "#111",
        cursorWidth: 2,
        trackBackground: "#0b0b0b",
        trackBorderColor: "#1a1a1a",
      },
    );
    mtRef.current = mt;
    const onReady = (): void => setReady(true);
    mt.once("canplay", onReady);
    return () => {
      mt.destroy();
      mtRef.current = null;
    };
  }, [jobId]);

  useEffect(() => {
    const mt = mtRef.current;
    if (!mt || !ready) return;
    const anySoloed = STEMS.some((n) => state[n].soloed);
    STEMS.forEach((n, i) => {
      const s = state[n];
      const audible = anySoloed ? s.soloed && !s.muted : !s.muted;
      mt.setTrackVolume(i, audible ? 1 : 0);
    });
  }, [state, ready]);

  function toggle(name: StemName, key: "muted" | "soloed"): void {
    setState((prev) => ({
      ...prev,
      [name]: { ...prev[name], [key]: !prev[name][key] },
    }));
  }

  function togglePlay(): void {
    const mt = mtRef.current;
    if (!mt) return;
    if (mt.isPlaying()) {
      mt.pause();
      setPlaying(false);
    } else {
      mt.play();
      setPlaying(true);
    }
  }

  return (
    <div className="player">
      <div className="player-controls">
        <button onClick={togglePlay} disabled={!ready} className="play-btn">
          {playing ? "Pause" : "Play"}
        </button>
        {!ready && <span className="muted">Loading audio…</span>}
      </div>

      <div className="stem-rows">
        {STEMS.map((name) => {
          const s = state[name];
          return (
            <div key={name} className="stem-row">
              <span className="stem-name" style={{ color: COLORS[name].wave }}>
                {name}
              </span>
              <button
                className={`pill ${s.muted ? "on" : ""}`}
                onClick={() => toggle(name, "muted")}
                disabled={!ready}
              >
                Mute
              </button>
              <button
                className={`pill ${s.soloed ? "on" : ""}`}
                onClick={() => toggle(name, "soloed")}
                disabled={!ready}
              >
                Solo
              </button>
              <a
                className="download-icon"
                href={stemDownloadUrl(jobId, name)}
                title={`Download ${name}`}
                aria-label={`Download ${name}`}
              >
                ⬇
              </a>
            </div>
          );
        })}
      </div>

      <div ref={containerRef} className="waveform" />
    </div>
  );
}
