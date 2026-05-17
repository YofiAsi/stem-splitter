FROM node:22-alpine AS base
RUN corepack enable && apk add --no-cache python3 py3-pip ffmpeg \
  && pip3 install --no-cache-dir --break-system-packages yt-dlp

FROM base AS builder
WORKDIR /app
COPY package.json pnpm-lock.yaml* pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/api/package.json apps/api/
COPY apps/worker/package.json apps/worker/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN pnpm install --no-frozen-lockfile
COPY . .
RUN pnpm --filter @stem-splitter/shared build
RUN pnpm --filter api build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app /app
EXPOSE 4000
WORKDIR /app/apps/api
CMD ["node", "dist/index.js"]
