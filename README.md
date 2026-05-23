# stem-splitter

**YouTube → 4 stems** — search, separate with Demucs (`htdemucs`) on GPU, download a ZIP (`vocals`, `drums`, `bass`, `other`, `original`). Ephemeral: files and job rows are removed after download.

Runs as a **single container, single Node process** designed to sit idle cheaply on a personal PC: no database server, no polling worker, ~0 idle CPU, and ~0 GPU memory until a job runs. The Demucs model is loaded per-job in a Python subprocess and freed when it exits.

## Stack (one process)

| Concern | How |
|---------|-----|
| UI | Vite + React, served as static files by Fastify |
| API | Fastify — search, jobs, download |
| Jobs | in-process FIFO queue (concurrency 1) → `yt-dlp` → Demucs (CUDA) → `ffmpeg` → ZIP |
| State | SQLite (`better-sqlite3`) + files under `STEMS_DIR` |

## Quick start

```bash
cp .env.example .env
docker compose up --build
```

UI + API: http://localhost:4000

Requires [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/install-guide.html) (uses one GPU). Set `DEMUCS_DEVICE=cpu` to run without a GPU (much slower).

## API

| Method | Path | Notes |
|--------|------|-------|
| `GET` | `/api/search?q=` | Up to 6 YouTube hits (no livestreams / >10 min) |
| `POST` | `/api/jobs` | Body: one of `url`, `videoId`, `name`; optional `format` (`mp3` \| `wav`) |
| `GET` | `/api/jobs/:id` | `status`: `queued` → `downloading` → `separating` → `packaging` → `ready` (or `failed`) |
| `GET` | `/api/jobs/:id/stems/:name` | Stem file when `ready` (supports range requests) |

```bash
curl -X POST http://localhost:4000/api/jobs \
  -H 'content-type: application/json' \
  -d '{"name":"bohemian rhapsody","format":"mp3"}'
```

## Local dev

Node 22, pnpm 9, Python 3.10+, `yt-dlp`, `ffmpeg`, PyTorch + CUDA (or CPU).

State uses the built-in `node:sqlite`, which is stable on Node 24+. On Node 22 export `NODE_OPTIONS=--experimental-sqlite` first (the container already passes this flag).

```bash
pnpm install && pnpm --filter @stem-splitter/shared build

# API + in-process worker (serves UI from WEB_DIR if it exists)
SQLITE_PATH=$PWD/stems_data/db.sqlite STEMS_DIR=$PWD/stems_data \
  SEPARATE_PY_PATH=$PWD/apps/api/python/separate.py \
  DEMUCS_DEVICE=cpu pnpm --filter api dev

# UI with hot reload (proxies /api to :4000)
pnpm --filter web dev
```

Tests: `pnpm --filter api test`
