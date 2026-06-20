import type { FastifyInstance } from "fastify";
import {
  SearchQuerySchema,
  extractYouTubeId,
  type SearchResultItem,
} from "@stem-splitter/shared";
import {
  ytdlpSearch,
  ytdlpInfo,
  isYtVideoUnavailableMessage,
  isYtAuthRequiredMessage,
  type YtDlpSearchEntry,
} from "../ytdlp.js";

function pickThumbnail(entry: YtDlpSearchEntry): string {
  if (entry.thumbnail) return entry.thumbnail;
  const list = entry.thumbnails ?? [];
  if (list.length === 0) return `https://i.ytimg.com/vi/${entry.id}/mqdefault.jpg`;
  const sorted = [...list].sort(
    (a, b) => (b.width ?? 0) * (b.height ?? 0) - (a.width ?? 0) * (a.height ?? 0),
  );
  return sorted[0].url;
}

function toResultItem(e: YtDlpSearchEntry): SearchResultItem {
  return {
    youtubeVideoId: e.id,
    title: e.title,
    channel: e.channel ?? e.uploader ?? "Unknown",
    durationSeconds: Math.round(e.duration ?? 0),
    thumbnailUrl: pickThumbnail(e),
  };
}

export async function registerSearchRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/search", {
    schema: { querystring: SearchQuerySchema },
    handler: async (req, reply) => {
      const { q } = req.query as { q: string };
      try {
        // A pasted YouTube URL or bare 11-char id resolves to that exact video.
        const directId = extractYouTubeId(q);
        if (directId) {
          const info = await ytdlpInfo(directId);
          return reply.send([toResultItem(info)]);
        }

        const entries = await ytdlpSearch(q, 10);
        const filtered: SearchResultItem[] = entries
          .filter(
            (e) =>
              !e.is_live &&
              typeof e.duration === "number" &&
              e.duration > 0,
          )
          .slice(0, 6)
          .map(toResultItem);
        return reply.send(filtered);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (isYtAuthRequiredMessage(msg)) {
          return reply.code(422).send({
            error:
              "This video is age-restricted or requires sign-in, so it can't be fetched.",
          });
        }
        if (isYtVideoUnavailableMessage(msg)) {
          return reply.code(422).send({ error: "video_unavailable" });
        }
        req.log.error({ err }, "yt-dlp search failed");
        return reply.code(502).send({ error: "search_failed" });
      }
    },
  });
}
