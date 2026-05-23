import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
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

import { build } from "../../src/index.js";
import { ytdlpSearch, isYtVideoUnavailableMessage } from "../../src/ytdlp.js";
import type { YtDlpSearchEntry } from "../../src/ytdlp.js";

function makeEntry(overrides: Partial<YtDlpSearchEntry> = {}): YtDlpSearchEntry {
  return {
    id: "dQw4w9WgXcW",
    title: "Test Video",
    channel: "Test Channel",
    duration: 200,
    is_live: false,
    thumbnail: "https://example.com/thumb.jpg",
    ...overrides,
  };
}

describe("GET /api/search", () => {
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
  });

  it("returns filtered results (up to 6, no livestreams)", async () => {
    const entries: YtDlpSearchEntry[] = [
      makeEntry({ id: "vid0000001", duration: 100 }),
      makeEntry({ id: "vid0000002", duration: 200, is_live: true }),
      makeEntry({ id: "vid0000003", duration: 300 }),
      makeEntry({ id: "vid0000004", duration: 400 }),
      makeEntry({ id: "vid0000005", duration: 500 }),
      makeEntry({ id: "vid0000006", duration: 100 }),
      makeEntry({ id: "vid0000007", duration: 200 }),
      makeEntry({ id: "vid0000008", duration: 300 }),
    ];
    vi.mocked(ytdlpSearch).mockResolvedValueOnce(entries);

    const res = await app.inject({ method: "GET", url: "/api/search?q=test" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toHaveLength(6);
    expect(body.every((r: { youtubeVideoId: string }) => r.youtubeVideoId !== "vid0000002")).toBe(true);
  });

  it("filters out duration === 600", async () => {
    vi.mocked(ytdlpSearch).mockResolvedValueOnce([
      makeEntry({ id: "vid0000001", duration: 600 }),
      makeEntry({ id: "vid0000002", duration: 599 }),
    ]);
    const res = await app.inject({ method: "GET", url: "/api/search?q=test" });
    const body = res.json();
    expect(body).toHaveLength(1);
    expect(body[0].youtubeVideoId).toBe("vid0000002");
  });

  it("includes duration 599", async () => {
    vi.mocked(ytdlpSearch).mockResolvedValueOnce([makeEntry({ duration: 599 })]);
    const res = await app.inject({ method: "GET", url: "/api/search?q=test" });
    expect(res.json()).toHaveLength(1);
  });

  it("returns empty array when no results", async () => {
    vi.mocked(ytdlpSearch).mockResolvedValueOnce([]);
    const res = await app.inject({ method: "GET", url: "/api/search?q=test" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([]);
  });

  it("uses mqdefault.jpg when no thumbnail info", async () => {
    vi.mocked(ytdlpSearch).mockResolvedValueOnce([
      makeEntry({ id: "abc11111111", thumbnail: undefined, thumbnails: undefined }),
    ]);
    const res = await app.inject({ method: "GET", url: "/api/search?q=test" });
    const body = res.json();
    expect(body[0].thumbnailUrl).toContain("abc11111111");
    expect(body[0].thumbnailUrl).toContain("mqdefault.jpg");
  });

  it("picks highest-resolution thumbnail from thumbnails array", async () => {
    vi.mocked(ytdlpSearch).mockResolvedValueOnce([
      makeEntry({
        thumbnail: undefined,
        thumbnails: [
          { url: "https://small.jpg", width: 120, height: 90 },
          { url: "https://large.jpg", width: 640, height: 480 },
          { url: "https://medium.jpg", width: 320, height: 240 },
        ],
      }),
    ]);
    const res = await app.inject({ method: "GET", url: "/api/search?q=test" });
    expect(res.json()[0].thumbnailUrl).toBe("https://large.jpg");
  });

  it("falls back to channel/uploader and returns 'Unknown' when missing", async () => {
    vi.mocked(ytdlpSearch).mockResolvedValueOnce([
      makeEntry({ channel: undefined, uploader: undefined }),
    ]);
    const res = await app.inject({ method: "GET", url: "/api/search?q=test" });
    expect(res.json()[0].channel).toBe("Unknown");
  });

  it("returns 422 when yt-dlp says video unavailable", async () => {
    vi.mocked(ytdlpSearch).mockRejectedValueOnce(new Error("Video unavailable"));
    vi.mocked(isYtVideoUnavailableMessage).mockReturnValueOnce(true);
    const res = await app.inject({ method: "GET", url: "/api/search?q=test" });
    expect(res.statusCode).toBe(422);
    expect(res.json()).toEqual({ error: "video_unavailable" });
  });

  it("returns 502 on generic yt-dlp failure", async () => {
    vi.mocked(ytdlpSearch).mockRejectedValueOnce(new Error("network timeout"));
    vi.mocked(isYtVideoUnavailableMessage).mockReturnValueOnce(false);
    const res = await app.inject({ method: "GET", url: "/api/search?q=test" });
    expect(res.statusCode).toBe(502);
    expect(res.json()).toEqual({ error: "search_failed" });
  });

  it("returns 400 when q param is missing", async () => {
    const res = await app.inject({ method: "GET", url: "/api/search" });
    expect(res.statusCode).toBe(400);
  });

  it("returns 400 when q is empty", async () => {
    const res = await app.inject({ method: "GET", url: "/api/search?q=" });
    expect(res.statusCode).toBe(400);
  });

  it("returns 400 when q exceeds 200 chars", async () => {
    const q = "a".repeat(201);
    const res = await app.inject({ method: "GET", url: `/api/search?q=${q}` });
    expect(res.statusCode).toBe(400);
  });
});
