# Lumière — repo guide for Claude

Self-hosted gallery delivery platform (Pixieset alternative). Bun + Elysia API serving private galleries to photography clients, with S3-compatible object storage.

## Authoritative planning docs

- [lumiere-implementation-v1.2.md](lumiere-implementation-v1.2.md) — backend spec (architecture, schema, security, phase plan). Source of truth when in doubt.
- [lumiere-frontend-plan-v1.md](lumiere-frontend-plan-v1.md) — Next.js 16 frontend plan; not yet implemented.

## Layout (monorepo, Bun workspaces)

```
apps/api/                     # Bun + Elysia backend (only app for now)
  src/
    db/         schema.ts, migrations/, migrate.ts (raw SQL runner), seed.ts
    lib/        config.ts, logger.ts, ids.ts, mime.ts
    middleware/ auth.ts, csrf.ts, client-ip.ts, rate-limit.ts
    services/   storage.ts, auth.ts, csrf.ts, slug.ts, queue.ts,
                image-processor.ts, events.ts
    routes/     health.ts, images.ts, events.ts, api/{auth,galleries,photos}.ts
    index.ts    entrypoint: runs migrations, starts worker + reaper, mounts routes
packages/types/               # shared Zod schemas (for the future Next.js app)
docker-compose.yml            # app + litestream
apps/api/Dockerfile           # Bun multi-stage build
litestream.yml                # off-host SQLite replication target
```

## Stack

- Bun 1.3 (runtime), TypeScript strict, Elysia for HTTP
- SQLite via `bun:sqlite` + Drizzle for typed queries
- Migrations are **hand-written SQL** under `src/db/migrations/` (drizzle-kit not used for generation — too brittle around the photos/galleries circular FK)
- Sharp for image processing, jose for JWT, @node-rs/argon2 for passwords
- @aws-sdk/client-s3 + s3-request-presigner (two clients: internal LAN endpoint for put/delete/list, public endpoint for presign — SigV4 binds to Host)

## Running locally

```sh
bun install
set -a && source .env && set +a
bun run apps/api/src/db/migrate.ts     # idempotent
bun run apps/api/src/db/seed.ts        # creates admin from ADMIN_EMAIL/PASSWORD
bun run apps/api/src/index.ts          # listens on $PORT (default 3000; the user's box has node on 3000, so .env uses 3200)
```

The repo-root `.env` is gitignored. Required envs are in [.env.example](.env.example).

Health: `curl localhost:$PORT/health` → `{ status, db, s3 }`.

## Conventions

- **Commit style: small, one-line, progressive.** One file or tight group per commit, imperative subject like `implement gallery endpoint` or `add slug service`. Don't batch a session's work into one commit at the end. Include the standard `Co-Authored-By` trailer.
- **Auth surface:** photographer JWT in `lumiere_jwt` (httpOnly, SameSite=Strict), refresh in `lumiere_refresh` (rotated + revoked on use, stored hashed in `refresh_tokens`). CSRF is double-submit via `lumiere_csrf` + `X-CSRF-Token` header. Mutations from the admin must carry CSRF.
- **CSRF and auth are inline helpers (`checkCsrf(ctx)`, `requireAuth(ctx)`)**, not Elysia plugins. Elysia hooks default to `local` scope and don't propagate cleanly through `.use()` — using inline guards at the top of each mutating handler is the workable pattern here.
- **DB connection PRAGMAs are required on every open** ([db/index.ts](apps/api/src/db/index.ts)): `journal_mode=WAL`, `foreign_keys=ON`, `busy_timeout=5000`, `synchronous=NORMAL`. Without `foreign_keys=ON` the `ON DELETE CASCADE` rules silently no-op.
- **Image bytes never flow through Bun at runtime.** `/img/:gid/:pid/:size` validates the request and 302-redirects to a short-lived S3 presigned URL.
- **Job queue is the upload pipeline.** Multipart upload route stores the original to S3 inline, then enqueues a `process_photo` job. Worker (concurrency-bounded, `IMAGE_CONCURRENCY=3`) reads the original back, generates derivatives. Reaper re-queues `running` rows whose `locked_at` is older than 5 min.
- **SSE replay buffer:** the event bus keeps the last events per batch for 30s so a client that subscribes after the worker finished still sees `queued → processing → ready → done`.

## Project-specific gotchas

- **Storage backend is RustFS, not MinIO** (`192.168.1.3:30292`). The v1.2 doc spec'd MinIO; user picked RustFS. The `storage.ts` abstraction is generic so this is just a config detail, but MinIO-specific bootstrap (`mc admin user svcacct add`) doesn't apply.
- **DATABASE_PATH should be absolute in dev.** Running `bun run apps/api/src/index.ts` from the repo root vs. inside `apps/api/` resolves relative paths differently and silently creates two DB files. `.env` uses an absolute path.
- **Port 3000 is taken** on the user's machine by an unrelated node process. The dev `.env` uses `PORT=3200`.
- **Elysia router rejects route trees with conflicting param names** at the same depth (e.g. `/api/galleries/:id` vs `/api/galleries/:galleryId/...` clashes). All gallery-prefixed routes use `:galleryId`.
- **Login uses Argon2; the no-such-user branch hashes a decoy** to keep response timing constant. Don't refactor that out.
- **Rate limit is SQLite-backed** (`rate_limit_events` table); it persists across restarts. Wipe with `DELETE FROM rate_limit_events;` if you blow through it during dev.

## Status

Built so far (v1.2 Phase 1 backend core):
- Monorepo scaffold, Docker + Litestream, full DB schema + migration runner + bootstrap seed
- Two-client S3 storage abstraction (Put/Delete/List on internal + presign on public; `presignDownload` adds Content-Disposition; `getObjectStream` for the ZIP builder)
- Auth: login/logout/me/refresh/csrf, Argon2id, rotating refresh tokens, double-submit CSRF, trusted-proxy IP parsing, sliding-window rate limit
- Job queue + worker + reaper, Sharp image-processing pipeline (auto-rotate, EXIF strip, palette, 600px thumb + 2400px preview WebP)
- **Validation:** Zod schemas in `@lumiere/types` + `parseBody(ctx, schema)` helper that reads from Elysia's pre-parsed `ctx.body` (don't call `ctx.request.json()` — Elysia has already consumed the stream)
- Gallery CRUD admin routes (Zod-validated, strict on unknown keys)
- Photo upload (multipart → magic-byte MIME check → S3 → enqueue job)
- SSE `/events?batch=…` with replay buffer
- Client gallery surface: `/api/gallery/:slug/access|unlock|photos|track-view`, 72h `lumiere_gs` session cookie (HttpOnly, SameSite=Lax)
- Favorites: `GET/POST/DELETE /api/gallery/:slug/favorite[s]`, idempotent, auto-issues a guest session on first POST for public galleries
- Downloads: `GET /api/gallery/:slug/download/:photoId` (302 → presigned w/ Content-Disposition), `GET /api/gallery/:slug/download?scope=all|favorites` (streaming ZIP via archiver, store=level 0, filename dedupe). Rate-limit 3/hour/IP/gallery; admin bypasses.
- `/img/:gid/:pid/:size` presigned redirect — accepts admin JWT, gallery_session, or public-gallery anonymous (thumb/preview); original is admin-only
- Admin analytics: `GET /api/analytics/overview` (totals + activity feed), `GET /api/galleries/:galleryId/analytics` (views/downloads timelines, favorites-by-photo, device split). Crude UA bucketer in `lib/user-agent.ts` (no full UA parser dep).
- Watermarks: `GET/POST/GET/PATCH/DELETE /api/watermark-presets[/:id]` admin CRUD with discriminated-union Zod (`text` / `image`). `services/watermark.ts` composites text via SVG (no Pango font dep). `process_photo` builds `watermarked/{gid}/{pid}.webp` derivative when the gallery's `watermarkPresetId` is set; `downloadMode='watermarked'` then serves it via the existing fallback in `routes/api/downloads.ts`.
- `/health` reports `{ db, s3 }`

Not built (next):
- Email notifications (Nodemailer SMTP, templates for gallery_viewed / download / favorites_received)
- Comments + moderation queue
- Re-process existing photos when a watermark preset is attached to a gallery after upload (today only new uploads pick up the watermark)
- Image-watermark uploads endpoint (text watermarks work end-to-end; the image branch of `applyWatermark` is implemented but there's no upload flow for the logo asset yet)
- The whole Next.js frontend tier
