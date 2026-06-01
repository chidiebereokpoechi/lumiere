# Lumière — repo guide for Claude

Self-hosted gallery delivery platform (Pixieset alternative). Bun + Elysia API serving private galleries to photography clients, with S3-compatible object storage. Next.js 16 + React 19 frontend on top.

## Authoritative planning docs

- [lumiere-implementation-v1.2.md](lumiere-implementation-v1.2.md) — backend spec (architecture, schema, security, phase plan). Source of truth when in doubt.
- [lumiere-frontend-plan-v1.md](lumiere-frontend-plan-v1.md) — Next.js 16 frontend plan; not yet implemented.

## Layout (monorepo, Bun workspaces)

```
apps/api/                     # Bun + Elysia backend
  src/
    db/         schema.ts, migrations/, migrate.ts (raw SQL runner), seed.ts
    lib/        config.ts, logger.ts, ids.ts, mime.ts, user-agent.ts, validation.ts
    middleware/ auth.ts, csrf.ts, client-ip.ts, rate-limit.ts, gallery-session.ts
    services/   storage.ts, auth.ts, csrf.ts, slug.ts, queue.ts, events.ts,
                image-processor.ts, watermark.ts, watermark-job.ts,
                gallery-session.ts, zip-builder.ts, email.ts, email-job.ts,
                notify.ts
    routes/     health.ts, images.ts, events.ts, api/{auth,galleries,photos,
                gallery,favorites,downloads,analytics,watermark-presets,
                comments,attachments}.ts
    index.ts    entrypoint: runs migrations, starts worker + reaper, mounts routes
  emails/       Handlebars templates (gallery_viewed, download, favorites_received)
apps/web/                     # Next.js 16 frontend (foundation only so far)
  app/          layout.tsx, page.tsx (smoke test), globals.css
  components/   theme-toggle.tsx
  lib/          api-client.ts (apiServer + apiClient + apiClientMutation),
                image-loader.ts (passthrough — Elysia handles), theme.ts
  proxy.ts      Next 16 proxy (renamed from middleware) — /admin gate
  public/fonts/ satoshi-variable[-italic].woff2 (self-hosted, ~85KB)
  next.config.ts dev rewrites /api/* /events/* /img/* /health → :3200 (Bun API)
packages/types/               # shared Zod schemas (auth, gallery, favorite,
                              # comment, attachment, watermark, health)
docker-compose.yml            # app + litestream
apps/api/Dockerfile           # Bun multi-stage build
litestream.yml                # off-host SQLite replication target
```

## Stack

**Backend** ([apps/api/](apps/api/))
- Bun 1.3 (runtime), TypeScript strict, Elysia for HTTP
- SQLite via `bun:sqlite` + Drizzle for typed queries
- Migrations are **hand-written SQL** under `src/db/migrations/` (drizzle-kit not used for generation — too brittle around the photos/galleries circular FK)
- Sharp for image processing, jose for JWT, @node-rs/argon2 for passwords
- @aws-sdk/client-s3 + s3-request-presigner (two clients: internal LAN endpoint for put/delete/list, public endpoint for presign — SigV4 binds to Host)
- @aws-sdk/lib-storage for streaming multipart attachment uploads
- Nodemailer + Handlebars for email (jsonTransport fallback when SMTP isn't set)

**Frontend** ([apps/web/](apps/web/))
- Next.js 16 (App Router, Turbopack dev), React 19
- Tailwind CSS v4 with `@theme inline` tokens that alias CSS vars in [app/globals.css](apps/web/app/globals.css)
- Self-hosted Satoshi (Fontshare, variable axis 300–900 in two ~42KB WOFF2s under [apps/web/public/fonts/](apps/web/public/fonts/))
- Design system is **Apple-soft**: cool off-white surfaces with a subtle blue undertone, generous rounded corners (16–28px), soft layered shadows, **no borders** — separation comes from bg tone + shadow. B/W monotone chrome with a peach accent (#FFB088 light / #FFC2A0 dark; dark ink reads on top of peach in both modes).
- Theme: auto via `prefers-color-scheme` + manual override via `data-theme` attribute + localStorage. Pre-paint init script in [lib/theme.ts](apps/web/lib/theme.ts) prevents the flash. `ThemeToggle` cycles system → light → dark.
- Dev: Next at `:3300`, Bun API at `:3200`. Next rewrites `/api/* /events/* /img/* /health` → `:3200` so the browser sees one origin (cookies/CSRF work without CORS).
- Custom `next/image` loader in [lib/image-loader.ts](apps/web/lib/image-loader.ts) — passthrough; Elysia already serves presigned 302s, never let Next re-encode.
- Admin gate: [proxy.ts](apps/web/proxy.ts) (Next 16 renamed `middleware.ts` to `proxy.ts`) — bounces missing JWT to `/admin/login`. First gate, not the security boundary.

## Running locally

```sh
bun install
set -a && source .env && set +a
bun run apps/api/src/db/migrate.ts                     # idempotent
bun run apps/api/src/db/seed.ts                        # creates admin from ADMIN_EMAIL/PASSWORD

# Backend (port 3200 per .env)
bun run apps/api/src/index.ts
# OR via workspace filter
bun run --filter @lumiere/api start

# Frontend (port 3300, separate terminal)
bun run --filter @lumiere/web dev
```

The repo-root `.env` is gitignored. Required envs are in [.env.example](.env.example).

- Health: `curl localhost:3200/health` → `{ status, db, s3 }`
- Frontend root: `http://localhost:3300/` (smoke test page — Satoshi typography, theme toggle, /health card, color swatches)
- Anything under `/api`, `/events`, `/img`, `/health` on `:3300` proxies to `:3200` via Next rewrites.

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
- Watermarks: `GET/POST/GET/PATCH/DELETE /api/watermark-presets[/:id]` admin CRUD with discriminated-union Zod (`text` / `image`). Image presets use `POST /api/watermark-presets/logo` (multipart, 5MB cap, magic-byte MIME check) to upload a logo to `logos/{photographerId}/{nanoid}.{ext}`, then the caller embeds the returned `s3Key` in the preset's `config`. `services/watermark.ts` composites text via SVG (no Pango font dep) or image via S3 fetch + Sharp resize + composite. `process_photo` builds `watermarked/{gid}/{pid}.webp` on initial upload; for existing photos, changing `gallery.watermarkPresetId` enqueues `apply_watermark` jobs that read the existing preview from S3 (not the original) so reprocessing is cheap. Setting `watermarkPresetId` to null deletes the derivatives and clears the column. `downloadMode='watermarked'` serves the watermarked key via the fallback in `routes/api/downloads.ts`.
- Email notifications: Nodemailer + Handlebars templates in [apps/api/emails/](apps/api/emails/), `send_email` is a queue job (handler in `services/email-job.ts`) so requests never block on SMTP. The `notifyPhotographer(galleryId, template, data)` helper wraps "insert notification row + enqueue job" with sensible defaults (galleryTitle/Url injected). Three hook points: `track-view` (gated by `notify_on_view`, rate-limited 1/4h per gallery+IP), single+ZIP `download` (skipped for admin owner, rate-limited 1/h), and `favorite` (rate-limited 1/h per gallery — clients click in clusters). With SMTP unset, `nodemailer.jsonTransport` runs so the pipeline is testable without a real server.
- Comments + moderation: `POST /api/gallery/:slug/comments` (client; gated by `allowComments`, rate-limited 5/15min per gallery+IP, optional `photoId` for per-photo threads) lands `is_approved=0`. `GET /api/gallery/:slug/comments[?photoId=…]` shows only approved. Admin: `GET /api/galleries/:galleryId/comments` (all incl. pending), `PATCH /:commentId { isApproved }`, `DELETE /:commentId`.
- Generic file attachments (extension to v1.2 — not in original spec): `attachments` table for non-image files (PDFs, contracts, ZIPs). Admin: `GET/POST/PATCH/DELETE /api/galleries/:galleryId/attachments[/:attachmentId]` — POST is multipart, streamed to S3 via `@aws-sdk/lib-storage` (`uploadStream` in `storage.ts`, 8 MiB parts) so multi-GB files don't sit in memory; cap is `MAX_ATTACHMENT_SIZE_MB` (default 500). Stored at `attachments/{gid}/{aid}.{ext}`. Client: `GET /api/gallery/:slug/attachments` (public shape, no `s3Key` leaked) and `GET /api/gallery/:slug/attachments/:id/download` (302 → presigned with attachment Content-Disposition; fires `download` notification). Gallery ZIP includes attachments under `files/`; photos go under `photos/`. Gallery delete cascades the `attachments/{gid}/` prefix.
- `/health` reports `{ db, s3 }`

Not built (next):
- Real frontend pages on top of the foundation: admin login, dashboard home, gallery editor, photo manager, analytics, watermark preset UI, comments moderation; client gallery (cover/grid/lightbox, password gate, favorites drawer, download modal, attachments section). Currently only the foundation + smoke test page exists.
