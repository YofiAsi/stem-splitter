import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import type { FastifyInstance } from "fastify";

vi.mock("../../src/db.js", () => ({
  pool: { query: vi.fn() },
  ensureSchema: vi.fn(),
}));

vi.mock("../../src/ytdlp.js", () => ({
  ytdlpSearch: vi.fn(),
  ytdlpInfo: vi.fn(),
  isYtVideoUnavailableMessage: vi.fn((msg: string) =>
    msg.toLowerCase().includes("video unavailable") ||
    msg.toLowerCase().includes("private video") ||
    msg.toLowerCase().includes("members only") ||
    msg.toLowerCase().includes("members-only") ||
    msg.toLowerCase().includes("this video is not available"),
  ),
}));

vi.mock("../../src/jobs/enqueueSplit.js", () => ({
  enqueueSplit: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return { ...actual, rm: vi.fn().mockResolvedValue(undefined) };
});

import { build } from "../../src/index.js";
import { pool } from "../../src/db.js";
import { ytdlpSearch, isYtVideoUnavailableMessage } from "../../src/ytdlp.js";
import { enqueueSplit } from "../../src/jobs/enqueueSplit.js";

const TEST_UUID = "550e8400-e29b-41d4-a716-446655440000";

function jobRow(overrides = {}) {
  return {
    id: TEST_UUID,
    status: "queued",
    format: "mp3",
    mode: "split",
    source_video_id: "dQw4w9WgXcW",
    source_title: "Test Song",
    error: null,
    created_at: new Date("2024-01-01T00:00:00Z"),
    ...overrides,
  };
}

describe("Job routes", () => {
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
    vi.mocked(pool.query).mockResolvedValue({ rows: [], rowCount: 1 } as any);
    vi.mocked(enqueueSplit).mockResolvedValue(undefined);
  });

  describe("POST /api/jobs", () => {
    it("creates job with videoId", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/jobs",
        payload: { videoId: "dQw4w9WgXcW" },
      });
      expect(res.statusCode).toBe(201);
      expect(res.json()).toHaveProperty("jobId");
      expect(typeof res.json().jobId).toBe("string");
    });

    it("creates job with full youtube.com URL", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/jobs",
        payload: { url: "https://www.youtube.com/watch?v=dQw4w9WgXcW" },
      });
      expect(res.statusCode).toBe(201);
      expect(res.json()).toHaveProperty("jobId");
    });

    it("creates job with youtu.be short URL", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/jobs",
        payload: { url: "https://youtu.be/dQw4w9WgXcW" },
      });
      expect(res.statusCode).toBe(201);
    });

    it("creates job with name (search fallback)", async () => {
      vi.mocked(ytdlpSearch).mockResolvedValueOnce([
        { id: "dQw4w9WgXcW", title: "Never Gonna Give You Up", duration: 213, is_live: false },
      ]);
      const res = await app.inject({
        method: "POST",
        url: "/api/jobs",
        payload: { name: "never gonna give you up" },
      });
      expect(res.statusCode).toBe(201);
    });

    it("defaults format to mp3 and mode to split", async () => {
      await app.inject({
        method: "POST",
        url: "/api/jobs",
        payload: { videoId: "dQw4w9WgXcW" },
      });
      const queryCall = vi.mocked(pool.query).mock.calls[0];
      expect(queryCall[1]).toContain("mp3");
      expect(queryCall[1]).toContain("split");
    });

    it("returns 400 when name yields no playable result", async () => {
      vi.mocked(ytdlpSearch).mockResolvedValueOnce([
        { id: "live1111111", title: "Live Stream", duration: 0, is_live: true },
      ]);
      const res = await app.inject({
        method: "POST",
        url: "/api/jobs",
        payload: { name: "some live stream" },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error).toMatch(/no playable result/);
    });

    it("returns 422 when name search gets unavailable video", async () => {
      vi.mocked(ytdlpSearch).mockRejectedValueOnce(new Error("Video unavailable"));
      vi.mocked(isYtVideoUnavailableMessage).mockReturnValueOnce(true);
      const res = await app.inject({
        method: "POST",
        url: "/api/jobs",
        payload: { name: "blocked video" },
      });
      expect(res.statusCode).toBe(422);
      expect(res.json()).toEqual({ error: "video_unavailable" });
    });

    it("returns 400 when url cannot be parsed", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/jobs",
        payload: { url: "https://youtube.com/watch?v=BADID" },
      });
      expect(res.statusCode).toBe(400);
    });

    it("returns 400 when no source field provided", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/jobs",
        payload: { format: "mp3" },
      });
      expect(res.statusCode).toBe(400);
    });

    it("returns 400 when two source fields provided", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/jobs",
        payload: { videoId: "dQw4w9WgXcW", name: "some song" },
      });
      expect(res.statusCode).toBe(400);
    });

    it("returns 400 for invalid format", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/jobs",
        payload: { videoId: "dQw4w9WgXcW", format: "flac" },
      });
      expect(res.statusCode).toBe(400);
    });
  });

  describe("GET /api/jobs/:id", () => {
    it("returns job view for existing job", async () => {
      vi.mocked(pool.query).mockResolvedValueOnce({ rows: [jobRow()], rowCount: 1 } as any);
      const res = await app.inject({ method: "GET", url: `/api/jobs/${TEST_UUID}` });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.id).toBe(TEST_UUID);
      expect(body.status).toBe("queued");
      expect(body.format).toBe("mp3");
      expect(body.mode).toBe("split");
      expect(body.source.videoId).toBe("dQw4w9WgXcW");
      expect(body.source.title).toBe("Test Song");
      expect(body.error).toBeNull();
      expect(typeof body.createdAt).toBe("string");
    });

    it("returns 404 when job not found", async () => {
      vi.mocked(pool.query).mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);
      const res = await app.inject({ method: "GET", url: `/api/jobs/${TEST_UUID}` });
      expect(res.statusCode).toBe(404);
      expect(res.json()).toEqual({ error: "not_found" });
    });

    it("returns 400 for invalid UUID", async () => {
      const res = await app.inject({ method: "GET", url: "/api/jobs/not-a-uuid" });
      expect(res.statusCode).toBe(400);
    });

    it("includes error field when job has failed", async () => {
      vi.mocked(pool.query).mockResolvedValueOnce({
        rows: [jobRow({ status: "failed", error: "download_timeout" })],
        rowCount: 1,
      } as any);
      const res = await app.inject({ method: "GET", url: `/api/jobs/${TEST_UUID}` });
      expect(res.statusCode).toBe(200);
      expect(res.json().error).toBe("download_timeout");
    });

    it("returns null title when source_title is null", async () => {
      vi.mocked(pool.query).mockResolvedValueOnce({
        rows: [jobRow({ source_title: null })],
        rowCount: 1,
      } as any);
      const res = await app.inject({ method: "GET", url: `/api/jobs/${TEST_UUID}` });
      expect(res.json().source.title).toBeNull();
    });
  });

  describe("DELETE /api/jobs/:id", () => {
    it("deletes job and returns 204", async () => {
      const res = await app.inject({ method: "DELETE", url: `/api/jobs/${TEST_UUID}` });
      expect(res.statusCode).toBe(204);
    });

    it("returns 400 for invalid UUID", async () => {
      const res = await app.inject({ method: "DELETE", url: "/api/jobs/bad-id" });
      expect(res.statusCode).toBe(400);
    });

    it("is idempotent when job does not exist", async () => {
      vi.mocked(pool.query).mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);
      const res = await app.inject({ method: "DELETE", url: `/api/jobs/${TEST_UUID}` });
      expect(res.statusCode).toBe(204);
    });
  });
});
