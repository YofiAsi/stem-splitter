import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { Readable } from "node:stream";
import type { FastifyInstance } from "fastify";

vi.mock("../../src/db.js", () => ({
  ensureSchema: vi.fn(),
  reconcileOrphans: vi.fn(() => 0),
  insertJob: vi.fn(),
  getJob: vi.fn(),
  deleteJob: vi.fn(),
  loadJob: vi.fn(),
  setJobStatus: vi.fn(),
}));

vi.mock("../../src/ytdlp.js", () => ({
  ytdlpSearch: vi.fn(),
  ytdlpInfo: vi.fn(),
  isYtVideoUnavailableMessage: vi.fn(() => false),
}));

vi.mock("../../src/jobs/enqueueSplit.js", () => ({
  enqueueSplit: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return { ...actual, stat: vi.fn(), rm: vi.fn().mockResolvedValue(undefined) };
});

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return { ...actual, createReadStream: vi.fn() };
});

import { build } from "../../src/index.js";
import { getJob } from "../../src/db.js";
import { stat } from "node:fs/promises";
import { createReadStream } from "node:fs";

const TEST_UUID = "550e8400-e29b-41d4-a716-446655440001";
const FILE_SIZE = 5000;

function readyJob(overrides = {}) {
  return {
    status: "ready",
    format: "mp3",
    mode: "split",
    source_title: "My Song",
    source_video_id: "dQw4w9WgXcW",
    ...overrides,
  };
}

describe("GET /api/jobs/:id/stems/:name", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await build();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getJob).mockReturnValue(readyJob() as any);
    vi.mocked(stat).mockResolvedValue({ size: FILE_SIZE } as any);
    vi.mocked(createReadStream).mockReturnValue(Readable.from(Buffer.alloc(64)) as any);
  });

  it("returns 200 with correct content-type for mp3", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/jobs/${TEST_UUID}/stems/vocals`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toMatch(/audio\/mpeg/);
    expect(res.headers["content-length"]).toBe(String(FILE_SIZE));
  });

  it("returns audio/wav content-type for wav format", async () => {
    vi.mocked(getJob).mockReturnValue(readyJob({ format: "wav" }) as any);
    const res = await app.inject({
      method: "GET",
      url: `/api/jobs/${TEST_UUID}/stems/vocals`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toMatch(/audio\/wav/);
  });

  it("handles range request and returns 206", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/jobs/${TEST_UUID}/stems/vocals`,
      headers: { range: "bytes=0-999" },
    });
    expect(res.statusCode).toBe(206);
    expect(res.headers["content-range"]).toBe(`bytes 0-999/${FILE_SIZE}`);
    expect(res.headers["content-length"]).toBe("1000");
  });

  it("handles open-end range request", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/jobs/${TEST_UUID}/stems/vocals`,
      headers: { range: "bytes=4000-" },
    });
    expect(res.statusCode).toBe(206);
    expect(res.headers["content-range"]).toBe(`bytes 4000-4999/${FILE_SIZE}`);
    expect(res.headers["content-length"]).toBe("1000");
  });

  it("returns 416 when range start exceeds file size", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/jobs/${TEST_UUID}/stems/vocals`,
      headers: { range: "bytes=5000-5099" },
    });
    expect(res.statusCode).toBe(416);
  });

  it("returns 416 when range start > end", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/jobs/${TEST_UUID}/stems/vocals`,
      headers: { range: "bytes=200-100" },
    });
    expect(res.statusCode).toBe(416);
  });

  it("returns 404 for unknown stem name", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/jobs/${TEST_UUID}/stems/piano`,
    });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: "unknown_stem" });
  });

  it("returns 404 when job not found", async () => {
    vi.mocked(getJob).mockReturnValue(undefined);
    const res = await app.inject({
      method: "GET",
      url: `/api/jobs/${TEST_UUID}/stems/vocals`,
    });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: "not_found" });
  });

  it("returns 409 when job is not ready", async () => {
    vi.mocked(getJob).mockReturnValue(readyJob({ status: "downloading" }) as any);
    const res = await app.inject({
      method: "GET",
      url: `/api/jobs/${TEST_UUID}/stems/vocals`,
    });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual({ error: "not_ready", status: "downloading" });
  });

  it("returns 404 when requesting stem on original-mode job", async () => {
    vi.mocked(getJob).mockReturnValue(readyJob({ mode: "original" }) as any);
    const res = await app.inject({
      method: "GET",
      url: `/api/jobs/${TEST_UUID}/stems/vocals`,
    });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: "stem_not_available" });
  });

  it("allows 'original' stem on original-mode job", async () => {
    vi.mocked(getJob).mockReturnValue(readyJob({ mode: "original" }) as any);
    const res = await app.inject({
      method: "GET",
      url: `/api/jobs/${TEST_UUID}/stems/original`,
    });
    expect(res.statusCode).toBe(200);
  });

  it("returns 410 when file is missing on disk", async () => {
    const err = Object.assign(new Error("ENOENT"), { code: "ENOENT" });
    vi.mocked(stat).mockRejectedValue(err);
    const res = await app.inject({
      method: "GET",
      url: `/api/jobs/${TEST_UUID}/stems/vocals`,
    });
    expect(res.statusCode).toBe(410);
    expect(res.json()).toEqual({ error: "files_missing" });
  });

  it("sets Content-Disposition when download param is present", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/jobs/${TEST_UUID}/stems/vocals?download=1`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-disposition"]).toMatch(/attachment/);
    expect(res.headers["content-disposition"]).toMatch(/My Song/);
    expect(res.headers["content-disposition"]).toMatch(/_vocals\.mp3/);
  });

  it("uses source_video_id in filename when title is null", async () => {
    vi.mocked(getJob).mockReturnValue(readyJob({ source_title: null }) as any);
    const res = await app.inject({
      method: "GET",
      url: `/api/jobs/${TEST_UUID}/stems/vocals?download=1`,
    });
    expect(res.headers["content-disposition"]).toMatch(/dQw4w9WgXcW/);
  });

  it("returns 400 for invalid UUID", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/jobs/not-a-uuid/stems/vocals",
    });
    expect(res.statusCode).toBe(400);
  });

  it("has Accept-Ranges header", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/jobs/${TEST_UUID}/stems/drums`,
    });
    expect(res.headers["accept-ranges"]).toBe("bytes");
  });
});
