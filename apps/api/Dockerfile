FROM oven/bun:1 AS builder
WORKDIR /app
COPY package.json bun.lock* ./
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
COPY packages/types/package.json ./packages/types/
RUN bun install --frozen-lockfile
COPY . .
RUN bun run --filter @lumiere/api typecheck

FROM oven/bun:1-slim AS runner
WORKDIR /app
# Fonts for SVG text watermarks — librsvg (via sharp) needs a system font, or
# text renders as tofu boxes. DejaVu covers Latin + symbols; fontconfig resolves it.
RUN apt-get update \
  && apt-get install -y --no-install-recommends fontconfig fonts-dejavu-core ffmpeg \
  && fc-cache -f \
  && rm -rf /var/lib/apt/lists/*
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/api ./apps/api
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/package.json ./
RUN mkdir -p /app/data
EXPOSE 3000
CMD ["bun", "run", "apps/api/src/index.ts"]
