FROM oven/bun:1 AS builder
WORKDIR /app
COPY package.json bun.lock* ./
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
COPY packages/types/package.json ./packages/types/
RUN bun install --frozen-lockfile
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# INTERNAL_API_URL is read at request time (RSC fetch), not baked in here.
RUN bun run --filter @lumiere/web build

FROM oven/bun:1-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/web ./apps/web
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/package.json ./
WORKDIR /app/apps/web
EXPOSE 3400
# Runs `next start --port 3400`.
CMD ["bun", "run", "start"]
