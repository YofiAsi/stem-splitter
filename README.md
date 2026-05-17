# stem-splitter

**YouTube → 4 stems** — search, separate with Demucs (`htdemucs`) on GPU, download a ZIP (`vocals`, `drums`, `bass`, `other`, `original`). Ephemeral: files and job rows are removed after download.

## Stack

| Service | Role | Port |
|---------|------|------|
| **web** | Vite + React UI (nginx) | 3000 |
| **api** | Fastify — search, jobs, download | 4000 |
| **worker** | `yt-dlp` → Demucs (CUDA) → `ffmpeg` → ZIP | — |
| **postgres** | [graphile-worker] queue + job metadata | — |

API and worker share `stems_data` → `/var/stems`.

[graphile-worker]: https://github.com/graphile/worker

## Quick start

```bash
cp .env.example .env
docker compose up --build
```

| | URL |
|---|-----|
| UI | http://localhost:3000 |
| API | http://localhost:4000 |

Requires [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/install-guide.html) (worker uses one GPU).

## API

| Method | Path | Notes |
|--------|------|-------|
| `GET` | `/api/search?q=` | Up to 6 YouTube hits (no livestreams / >10 min) |
| `POST` | `/api/jobs` | Body: one of `url`, `videoId`, `name`; optional `format` (`mp3` \| `wav`) |
| `GET` | `/api/jobs/:id` | `status`: `queued` → `downloading` → `separating` → `packaging` → `ready` (or `failed`) |
| `GET` | `/api/jobs/:id/download` | ZIP when `ready`; then job is deleted |

```bash
curl -X POST http://localhost:4000/api/jobs \
  -H 'content-type: application/json' \
  -d '{"name":"bohemian rhapsody","format":"mp3"}'
```

## Local dev

Postgres, Node 22, pnpm 9, Python 3.10+, `yt-dlp`, `ffmpeg`, PyTorch + CUDA.

```bash
pnpm install && pnpm --filter @stem-splitter/shared build

DATABASE_URL=postgres://localhost/stemsplit pnpm --filter api dev
DATABASE_URL=postgres://localhost/stemsplit STEMS_DIR=$PWD/stems_data \
  SEPARATE_PY_PATH=$PWD/apps/worker/python/separate.py pnpm --filter worker dev
pnpm --filter web dev
```
