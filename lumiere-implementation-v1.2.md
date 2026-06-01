# Lumière — Self-Hosted Gallery Delivery Platform
## Implementation Document v1.2

---

## 1. Overview

Lumière is a self-hosted, full-featured photography gallery delivery platform built on **Bun**, designed to replace services like Pixieset for photographers who want full control over their client experience, data, and costs. It runs as a Docker Compose stack on a home server, with traffic proxied through an existing nginx reverse proxy on a VPS that handles TLS termination. Object storage is provided by a **MinIO instance running on a NAS**, reached over the LAN via the S3 API.

### Design Goals

- Feature parity with Pixieset's gallery delivery and client experience
- Meaningful UX improvements over Pixieset (see §13)
- S3-compatible object storage as the sole storage backend; default deployment is **MinIO running on the NAS against local NAS storage** (a ZFS dataset or equivalent), reached over the LAN. Backend remains swappable to Backblaze B2, Cloudflare R2, or AWS S3 via configuration only.
- Runs as a Docker Compose stack; all app state in volumes, no host dependencies
- Scales comfortably to hundreds of galleries and tens of thousands of images on modest home hardware
- First-class mobile experience for clients
- Minimal operational overhead for the photographer

### Storage Decision (important)

MinIO runs **on the NAS** and writes to a **local filesystem on that box** (e.g. a ZFS dataset on TrueNAS, or an ext4/xfs/btrfs volume on Synology/QNAP/Unraid). The app talks to it over the LAN via the S3 API, exactly as it would talk to AWS S3.

> **Do not** run MinIO on the home server with its data directory pointed at an NFS mount of the NAS. MinIO is unsupported on network filesystems (NFS/GlusterFS/GPFS): it relies on POSIX locking, atomic rename, and `fsync` semantics that NFS does not honor reliably, and the failure mode is silent `xl.meta` corruption rather than a clean error. Putting the network boundary at the **S3 API layer** (app → MinIO over HTTP) is correct; putting it **underneath** MinIO (MinIO → NFS) is not. The setup in this document does the former.

---

## 2. Technology Stack

| Layer | Choice | Rationale |
|---|---|---|
| Runtime | Bun 1.x | Native HTTP server, built-in SQLite, fast file I/O, TypeScript out of the box |
| HTTP Framework | Elysia.js | Bun-native, typed, fast, excellent plugin ecosystem |
| Database | SQLite via `bun:sqlite` | Zero-dependency, file-based, plenty for this workload (WAL mode, see §5) |
| ORM/Query Builder | Drizzle ORM | Lightweight, fully typed SQL, works with `bun:sqlite` |
| Frontend | React 19 + Vite (SPA) | Familiar, good ecosystem, fast builds. SPA, not SSR — see §11 note |
| Styling | Tailwind CSS v4 | Utility-first, small output bundle |
| Image Processing | Sharp | Industry-standard EXIF/resize/WebP. Verified to load under Bun in CI; processing is concurrency-bounded (see §9) |
| Job Queue | In-process queue backed by a SQLite `jobs` table | Survives restarts, supports retry + a reaper for stuck rows; no external broker |
| Object Storage | MinIO on NAS (S3-compatible) | Local-disk-backed MinIO reached over LAN; swappable to B2/R2/S3 via env |
| S3 Client | `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner` | Two-client split for internal vs presign endpoints (see §3, §4) |
| Auth | Custom JWT (jose) + Argon2id (`@node-rs/argon2`) | No external auth dependency |
| Email | Nodemailer + SMTP relay | Works with any SMTP provider |
| Reverse Proxy | nginx on VPS (existing) | TLS termination, proxies to home server + NAS MinIO over the tunnel |
| VPS ↔ home/NAS link | WireGuard/Tailscale tunnel (already in place) | All VPS↔LAN traffic is encrypted; no plaintext hops |
| Containerisation | Docker Compose | Self-contained app stack, portable, easy updates |

---

## 3. System Architecture

MinIO now lives on the NAS, **outside** the app's Docker Compose stack. The VPS reaches both the home server (app) and the NAS (MinIO) over the existing encrypted tunnel.

```
        VPS                         Home Server (Docker Compose)            NAS
┌───────────────────────┐   ┌────────────────────────────────────┐   ┌──────────────────────┐
│                       │   │                                    │   │                      │
│ nginx (TLS)           │   │  ┌─────────────┐  ┌─────────────┐  │   │  ┌────────────────┐  │
│                       │   │  │ lumiere-app │  │  lumiere-   │  │   │  │     MinIO      │  │
│ photos.../  ──tunnel──┼───┼─►│ Bun/Elysia  │  │   db (WAL)  │  │   │  │  (S3, LAN)     │  │
│  → home:3000          │   │  │             │  │  + jobs     │  │   │  │  local ZFS ds  │  │
│                       │   │  └──────┬──────┘  └─────────────┘  │   │  └───────┬────────┘  │
│ s3.photos.../ ─tunnel─┼───┼─────────┼───────► (S3 API, LAN) ───┼───┼─────────►│           │
│  → nas:9000           │   │  ┌──────▼──────┐                   │   │          │           │
│  (presign redirects)  │   │  │ litestream  │ → off-host backup │   │  ZFS snap + replicate│
└───────────────────────┘   │  └─────────────┘                  │   └──────────────────────┘
                            └────────────────────────────────────┘

App → MinIO put/delete/list:  http://<nas-lan-ip>:9000        (internal LAN, fast)
Browser → MinIO image GET:    https://s3.photos.yourdomain.com (presigned, via VPS tunnel)
```

### Request Flow

```
Client Request
    │
    ▼
nginx on VPS (TLS termination, gzip, security headers)
    ├─ photos.yourdomain.com  → tunnel → home server :3000 (app)
    └─ s3.photos.yourdomain.com → tunnel → NAS :9000 (MinIO; presigned GETs only)
         │
         ▼
Elysia Router (app)
    ├─► /api/*         → API handlers (JSON)
    ├─► /admin/*       → Admin SPA (photographer dashboard)
    ├─► /g/:slug/*     → Client gallery SPA
    ├─► /events/*      → SSE (upload/job progress)
    └─► /img/*         → Image proxy handler (auth check → presigned S3 redirect)
```

### Image Serving Strategy (revised)

Images are never proxied through the Bun process at runtime. After validating the request, the server issues a short-lived **S3 presigned URL** and returns a `302` redirect; the browser fetches the bytes directly from MinIO.

The presigned URL must resolve to a **publicly reachable host**, and SigV4 binds the signature to the `Host` header. So the app keeps **two S3 clients**:

- **Internal client** — `endpoint = http://<nas-lan-ip>:9000`. Used for `PutObject`, `DeleteObject`, `ListObjects`. Fast LAN path, never exposed.
- **Presign client** — `endpoint = https://s3.photos.yourdomain.com`. Used **only** to sign GET URLs handed to browsers. nginx proxies this host to the NAS over the tunnel and **must preserve the `Host` header** or every signature fails.

The bucket stays fully private; only valid presigned URLs resolve.

```
GET /img/:galleryId/:photoId/preview
    │
    ├─ Validate gallery session / admin JWT
    ├─ Verify photo belongs to gallery (ownership, not just "a valid session")
    ├─ Look up S3 key for the requested derivative
    ├─ Sign GetObject against https://s3.photos.yourdomain.com (TTL per §17)
    └─ 302 → https://s3.photos.yourdomain.com/lumiere/previews/{gid}/{pid}.webp?X-Amz-...
                  │  (browser → VPS nginx → tunnel → NAS MinIO; Host preserved)
                  ▼
            MinIO verifies SigV4 against the received Host → 200
```

> **Bandwidth note:** because MinIO is on the NAS behind your home connection, all client image bytes (and ZIP downloads) leave over your **residential upload link**, regardless of the redirect. The redirect keeps bytes off the Bun process but not off the home uplink. This is the dominant real-world performance limiter; if it bites, the same `storage.ts` abstraction lets you move derivatives (or everything) to Cloudflare R2 for CDN-fronted, zero-egress serving without code changes.

---

## 4. S3 Storage Layout

Single private bucket (configurable). Key structure:

```
{bucket}/
├── originals/{galleryId}/{photoId}.{ext}        # Full-res, never public
├── previews/{galleryId}/{photoId}.webp           # 2400px WebP
├── thumbnails/{galleryId}/{photoId}.webp         # 600px WebP
├── watermarked/{galleryId}/{photoId}.webp        # Watermarked preview (optional)
└── logos/{photographerId}/{filename}             # Photographer branding assets
```

### Bucket Policy & Credentials

- Bucket is **private** — no public/anonymous access policy.
- All access is via presigned URLs generated server-side.
- The app authenticates to MinIO with a **scoped service account** limited to the `lumiere` bucket — **not** the MinIO root user. The root user is used only for one-time bootstrap (bucket + service-account creation).
- Originals: presigned URLs only issued to authenticated admin sessions.
- Previews/thumbnails: presigned URLs issued after a valid gallery session + photo→gallery ownership check.

### S3 Client Abstraction (two clients)

```typescript
// src/server/services/storage.ts
import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand,
         ListObjectsV2Command } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const base = {
  region: process.env.S3_REGION ?? 'us-east-1',
  forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true', // true for MinIO
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY!,        // scoped svcacct, NOT root
    secretAccessKey: process.env.S3_SECRET_KEY!,
  },
};

// Internal: container → NAS over LAN. Used for put/delete/list.
const s3 = new S3Client({ ...base, endpoint: process.env.S3_ENDPOINT_INTERNAL });   // http://<nas-lan-ip>:9000

// Presign-only: produces browser-facing URLs. Signs against the PUBLIC host.
const s3Public = new S3Client({ ...base, endpoint: process.env.S3_ENDPOINT_PUBLIC }); // https://s3.photos.yourdomain.com

export async function uploadObject(key: string, body: Buffer, contentType: string) {
  await s3.send(new PutObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key, Body: body, ContentType: contentType }));
}
export async function deleteObject(key: string) {
  await s3.send(new DeleteObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key }));
}
export async function deletePrefix(prefix: string) { /* list (s3) + batched delete (s3) */ }

export function presignGet(key: string, expiresIn = Number(process.env.PRESIGN_TTL_SECONDS ?? 60)) {
  return getSignedUrl(s3Public, new GetObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key }), { expiresIn });
}

export async function checkS3(): Promise<boolean> {  // used by /health
  try { await s3.send(new ListObjectsV2Command({ Bucket: process.env.S3_BUCKET, MaxKeys: 1 })); return true; }
  catch { return false; }
}
```

---

## 5. Database Schema

### Connection PRAGMAs (required)

SQLite does **not** enforce foreign keys by default, and the schema relies on `ON DELETE CASCADE`. Set these on every connection at startup, before any query:

```typescript
// src/server/db/index.ts
import { Database } from 'bun:sqlite';
const db = new Database(process.env.DATABASE_PATH);
db.run('PRAGMA journal_mode = WAL;');      // required for litestream + concurrency
db.run('PRAGMA foreign_keys = ON;');       // or cascades silently no-op
db.run('PRAGMA busy_timeout = 5000;');     // avoid SQLITE_BUSY under concurrent writes
db.run('PRAGMA synchronous = NORMAL;');    // safe with WAL, much faster
```

### Schema

```sql
-- Photographers (single or multi-user)
CREATE TABLE photographers (
  id            TEXT PRIMARY KEY,
  email         TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,                      -- Argon2id
  name          TEXT NOT NULL,
  brand_name    TEXT,
  logo_s3_key   TEXT,
  settings      TEXT DEFAULT '{}',                  -- JSON blob
  created_at    INTEGER NOT NULL
);

-- Galleries
CREATE TABLE galleries (
  id                  TEXT PRIMARY KEY,
  photographer_id     TEXT NOT NULL REFERENCES photographers(id) ON DELETE CASCADE,
  slug                TEXT UNIQUE NOT NULL,
  title               TEXT NOT NULL,
  subtitle            TEXT,
  cover_photo_id      TEXT REFERENCES photos(id) ON DELETE SET NULL,
  password_hash       TEXT,                          -- NULL = public
  status              TEXT DEFAULT 'active',         -- active | archived | draft
  download_mode       TEXT DEFAULT 'watermarked',    -- none | watermarked | full | selected
  expires_at          INTEGER,
  grace_period_days   INTEGER DEFAULT 0,
  allow_favorites     INTEGER DEFAULT 1,
  allow_comments      INTEGER DEFAULT 0,
  allow_download      INTEGER DEFAULT 1,
  client_name         TEXT,
  client_email        TEXT,
  event_date          INTEGER,
  event_type          TEXT,
  layout              TEXT DEFAULT 'grid',           -- grid | masonry | slideshow
  color_theme         TEXT DEFAULT 'light',          -- light | dark | custom
  custom_css          TEXT,                          -- sanitised + served under CSP, see §14
  watermark_preset_id TEXT,
  sort_order          TEXT DEFAULT 'manual',
  notify_on_view      INTEGER DEFAULT 1,
  view_count          INTEGER DEFAULT 0,
  created_at          INTEGER NOT NULL,
  updated_at          INTEGER NOT NULL
);

-- Folders within a gallery
CREATE TABLE gallery_folders (
  id             TEXT PRIMARY KEY,
  gallery_id     TEXT NOT NULL REFERENCES galleries(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  position       INTEGER DEFAULT 0,
  cover_photo_id TEXT REFERENCES photos(id) ON DELETE SET NULL
);

-- Photos
CREATE TABLE photos (
  id                 TEXT PRIMARY KEY,
  gallery_id         TEXT NOT NULL REFERENCES galleries(id) ON DELETE CASCADE,
  folder_id          TEXT REFERENCES gallery_folders(id) ON DELETE SET NULL,
  filename_original  TEXT NOT NULL,
  s3_key_original    TEXT,
  s3_key_preview     TEXT,
  s3_key_thumbnail   TEXT,
  s3_key_watermarked TEXT,
  width              INTEGER,
  height             INTEGER,
  file_size          INTEGER,
  mime_type          TEXT,
  exif_data          TEXT,                           -- JSON; GPS stripped before store, see §9/§14
  color_palette      TEXT,                           -- JSON: dominant colors (from Sharp, see §9)
  position           INTEGER DEFAULT 0,
  upload_status      TEXT DEFAULT 'processing',      -- processing | ready | error
  error_message      TEXT,
  created_at         INTEGER NOT NULL
);

-- Background jobs (upload processing, etc.) — survives restarts
CREATE TABLE jobs (
  id           TEXT PRIMARY KEY,
  type         TEXT NOT NULL,                        -- process_photo | build_zip | send_email
  gallery_id   TEXT REFERENCES galleries(id) ON DELETE CASCADE,
  payload      TEXT NOT NULL,                        -- JSON
  status       TEXT DEFAULT 'queued',               -- queued | running | done | error
  attempts     INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 3,
  locked_at    INTEGER,                              -- reaper re-queues rows stale past a TTL
  last_error   TEXT,
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL
);

-- Client gallery sessions
CREATE TABLE gallery_sessions (
  token       TEXT PRIMARY KEY,
  gallery_id  TEXT NOT NULL REFERENCES galleries(id) ON DELETE CASCADE,
  client_ip   TEXT,
  created_at  INTEGER NOT NULL,
  expires_at  INTEGER NOT NULL                        -- pruned by a periodic sweep
);

-- Client favorites
CREATE TABLE favorites (
  id            TEXT PRIMARY KEY,
  gallery_id    TEXT NOT NULL REFERENCES galleries(id) ON DELETE CASCADE,
  photo_id      TEXT NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
  session_token TEXT,
  client_email  TEXT,
  note          TEXT,
  created_at    INTEGER NOT NULL,
  UNIQUE(gallery_id, photo_id, session_token)
);

-- Download tracking
CREATE TABLE downloads (
  id           TEXT PRIMARY KEY,
  gallery_id   TEXT NOT NULL REFERENCES galleries(id) ON DELETE CASCADE,
  photo_id     TEXT REFERENCES photos(id) ON DELETE SET NULL,  -- NULL = full gallery download
  client_ip    TEXT,
  client_email TEXT,
  created_at   INTEGER NOT NULL
);

-- Gallery view events
CREATE TABLE gallery_views (
  id         TEXT PRIMARY KEY,
  gallery_id TEXT NOT NULL REFERENCES galleries(id) ON DELETE CASCADE,
  client_ip  TEXT,
  user_agent TEXT,
  referrer   TEXT,
  created_at INTEGER NOT NULL
);

-- Notification log
CREATE TABLE notifications (
  id         TEXT PRIMARY KEY,
  gallery_id TEXT REFERENCES galleries(id) ON DELETE CASCADE,
  type       TEXT NOT NULL,   -- gallery_viewed | download | favorites_received
  recipient  TEXT NOT NULL,
  sent_at    INTEGER,
  status     TEXT DEFAULT 'pending'
);

-- Watermark presets
CREATE TABLE watermark_presets (
  id              TEXT PRIMARY KEY,
  photographer_id TEXT NOT NULL REFERENCES photographers(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  type            TEXT NOT NULL,   -- text | image
  config          TEXT NOT NULL    -- JSON: position, opacity, size, content, s3_key
);

-- Client comments (optional, per gallery)
CREATE TABLE comments (
  id           TEXT PRIMARY KEY,
  gallery_id   TEXT NOT NULL REFERENCES galleries(id) ON DELETE CASCADE,
  photo_id     TEXT REFERENCES photos(id) ON DELETE CASCADE,
  client_name  TEXT,
  client_email TEXT,
  body         TEXT NOT NULL,
  is_approved  INTEGER DEFAULT 0,
  created_at   INTEGER NOT NULL
);
```

> Changes from v1.1: every `galleries(id)` reference now carries an explicit `ON DELETE` rule so deleting a gallery cascades cleanly; `cover_photo_id` is now a real FK with `ON DELETE SET NULL` (no dangling references); added the `jobs` table; added `grace_period_days`.

---

## 6. Directory Structure

```
lumiere/
├── src/
│   ├── server/
│   │   ├── index.ts
│   │   ├── routes/
│   │   │   ├── api/
│   │   │   │   ├── auth.ts
│   │   │   │   ├── galleries.ts
│   │   │   │   ├── photos.ts
│   │   │   │   ├── favorites.ts
│   │   │   │   ├── downloads.ts
│   │   │   │   └── analytics.ts
│   │   │   ├── gallery.ts
│   │   │   ├── images.ts           # Auth check → presigned redirect (presign client)
│   │   │   └── events.ts           # SSE for upload/job progress
│   │   ├── middleware/
│   │   │   ├── auth.ts
│   │   │   ├── gallery-access.ts
│   │   │   ├── csrf.ts             # CSRF token check for cookie-auth mutations
│   │   │   ├── client-ip.ts        # trusted-proxy XFF parsing
│   │   │   └── rate-limit.ts
│   │   ├── services/
│   │   │   ├── storage.ts          # Two-client S3 abstraction
│   │   │   ├── queue.ts            # SQLite-backed job queue + worker + reaper
│   │   │   ├── image-processor.ts  # Sharp pipeline (concurrency-bounded)
│   │   │   ├── zip-builder.ts      # Stream objects from S3, pipe into ZIP (store, no deflate)
│   │   │   ├── watermark.ts
│   │   │   ├── email.ts
│   │   │   └── slug.ts
│   │   ├── db/
│   │   │   ├── index.ts            # opens DB + sets PRAGMAs
│   │   │   ├── schema.ts
│   │   │   └── migrations/
│   │   └── lib/
│   │       ├── config.ts
│   │       └── logger.ts
│   └── client/
│       ├── gallery/                # Client-facing gallery SPA
│       └── admin/                  # Photographer dashboard SPA
├── emails/                         # Handlebars templates
├── public/
├── docker-compose.yml
├── docker-compose.override.yml
├── Dockerfile
├── litestream.yml
├── .env.example
├── package.json
└── bun.lock                        # text lockfile (Bun 1.2+); see §19
```

---

## 7. Docker Compose

MinIO is **not** in this stack anymore — it runs on the NAS (see §7.1). The app stack is the Bun app, the SQLite volume, and litestream. The app must **tolerate MinIO being briefly unreachable** at startup (retry with backoff) rather than hard-depending on it, and surfaces S3 reachability via `/health`.

```yaml
# docker-compose.yml  (home server)
services:

  app:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: lumiere-app
    restart: unless-stopped
    ports:
      - "3000:3000"                 # reachable from VPS over the tunnel only
    environment:
      NODE_ENV: production
    env_file:
      - .env
    volumes:
      - db-data:/app/data           # SQLite database only
    healthcheck:
      # bun:slim has no curl — use Bun to hit /health
      test: ["CMD", "bun", "-e", "fetch('http://localhost:3000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
      interval: 30s
      timeout: 5s
      retries: 3

  litestream:
    image: litestream/litestream:latest
    container_name: lumiere-litestream
    restart: unless-stopped
    volumes:
      - db-data:/app/data
      - ./litestream.yml:/etc/litestream.yml:ro
    command: replicate
    env_file:
      - .env

volumes:
  db-data:
```

```dockerfile
# Dockerfile
FROM oven/bun:1 AS builder
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build                  # Vite builds client SPA assets

FROM oven/bun:1-slim AS runner
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/src/server ./src/server
COPY --from=builder /app/emails ./emails
COPY --from=builder /app/public ./public
COPY package.json .
RUN mkdir -p /app/data
EXPOSE 3000
CMD ["bun", "run", "src/server/index.ts"]
```

> Verify in CI that Sharp's prebuilt binary loads under `oven/bun:1-slim` (glibc Debian base — generally fine, but Sharp + Bun is worth an explicit smoke test in the build).

```yaml
# docker-compose.override.yml  (local dev)
services:
  app:
    command: bun run --hot src/server/index.ts
    volumes:
      - ./src:/app/src
      - ./emails:/app/emails
      - db-data:/app/data
    ports:
      - "3000:3000"
      - "5173:5173"                 # Vite dev server
# For local dev without a NAS, run a throwaway MinIO here and point
# S3_ENDPOINT_INTERNAL / S3_ENDPOINT_PUBLIC at it.
```

### 7.1 MinIO on the NAS

Runs on the NAS (TrueNAS app, Synology/QNAP Container Manager, Unraid, or plain Docker on the NAS). The data volume is a **local NAS dataset**, never a remote mount. Pin a specific release tag — MinIO's community edition is in maintenance mode and recent builds have trimmed the console, so `:latest` is a moving target.

```yaml
# docker-compose.yml on the NAS (or native app)
services:
  minio:
    image: quay.io/minio/minio:RELEASE.2025-XX-XXTXX-XX-XXZ   # pin a known-good tag
    container_name: lumiere-minio
    restart: unless-stopped
    command: server /data --console-address ":9001"
    ports:
      - "9000:9000"                 # S3 API, LAN only (firewall to LAN + tunnel)
      - "127.0.0.1:9001:9001"       # console, local-only
    environment:
      MINIO_ROOT_USER: ${MINIO_ROOT_USER}
      MINIO_ROOT_PASSWORD: ${MINIO_ROOT_PASSWORD}
    volumes:
      - /mnt/tank/lumiere:/data     # LOCAL ZFS dataset on the NAS — NOT an NFS mount
    healthcheck:
      test: ["CMD-SHELL", "mc ready local || exit 1"]  # if mc absent in your tag, curl http://localhost:9000/minio/health/live
      interval: 10s
      timeout: 5s
      retries: 5
```

**One-time bootstrap** (bucket + scoped service account; run once, e.g. via an `mc` container or on the NAS):

```sh
mc alias set local http://localhost:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD"
mc mb --ignore-existing local/lumiere
mc anonymous set none local/lumiere
mc admin user svcacct add local "$MINIO_ROOT_USER" \
  --access-key "$S3_ACCESS_KEY" --secret-key "$S3_SECRET_KEY" \
  --policy - <<'JSON'
{ "Version":"2012-10-17",
  "Statement":[{ "Effect":"Allow",
    "Action":["s3:GetObject","s3:PutObject","s3:DeleteObject","s3:ListBucket"],
    "Resource":["arn:aws:s3:::lumiere","arn:aws:s3:::lumiere/*"] }] }
JSON
```

The app uses `S3_ACCESS_KEY`/`S3_SECRET_KEY` (the scoped key), never the root credentials.

---

## 8. nginx VPS Configuration

Two server blocks: the app and the MinIO presign host. Both proxy over the existing tunnel (TLS already managed on the VPS).

```nginx
# App
server {
    listen 443 ssl;
    server_name photos.yourdomain.com;

    client_max_body_size 250M;          # batched multipart uploads (per-file cap enforced in app)

    location / {
        proxy_pass http://<tunnel-home-addr>:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_buffering off;            # SSE
        proxy_cache off;
        proxy_read_timeout 300s;
    }

    # ZIP downloads can run long; relax timeout on the download path
    location /api/gallery/ {
        proxy_pass http://<tunnel-home-addr>:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_buffering off;
        proxy_read_timeout 1800s;       # large multi-GB ZIPs over residential uplink
    }

    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Content-Type-Options nosniff always;
    add_header X-Frame-Options DENY always;
    add_header Referrer-Policy strict-origin-when-cross-origin always;
    add_header Content-Security-Policy "default-src 'self'; img-src 'self' https://s3.photos.yourdomain.com; style-src 'self' 'unsafe-inline'" always;
}

# MinIO presign host — presigned GETs resolve here
server {
    listen 443 ssl;
    server_name s3.photos.yourdomain.com;

    client_max_body_size 1m;            # GETs only; app uploads go direct over LAN, not this host

    location / {
        proxy_pass http://<tunnel-nas-addr>:9000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;    # MUST preserve — SigV4 validates against it
        proxy_set_header X-Real-IP $remote_addr;
        proxy_buffering off;            # let MinIO stream / handle range requests
        proxy_request_buffering off;
    }
}
```

---

## 9. Image Processing Pipeline

Upload processing runs through the **job queue**, not inline in the request handler. The upload request stores the bytes, enqueues a `process_photo` job per file, returns a job/batch id, and the client subscribes to progress over a separate SSE connection. A reaper re-queues or fails jobs whose `locked_at` is stale (e.g. after a container restart), so photos never get stuck in `processing` forever.

```
Upload request:
  1. Receive multipart stream (Bun streaming multipart)
  2. Validate MIME type against magic bytes (not extension)
  3. Insert photo row (upload_status = 'processing'); enqueue process_photo job
  4. Return { batchId, photoIds }; client opens GET /events?batch=...

process_photo job (worker, concurrency-bounded — see below):
  1. Read EXIF (date, dimensions); STRIP GPS before persisting exif_data
  2. Auto-rotate to correct orientation
  3. Dominant color palette (5 colors) via Sharp .stats()/sampling → DB (no extra dep)
  4. Derivatives:
       ├─ thumbnail:  600px WebP q82,  metadata stripped → thumbnails/{gid}/{id}.webp
       ├─ preview:   2400px WebP q88,  metadata stripped → previews/{gid}/{id}.webp
       └─ original:  stored as-is                         → originals/{gid}/{id}.{ext}
     If a watermark preset is configured:
       └─ watermarked: preview + watermark composited      → watermarked/{gid}/{id}.webp
  5. PutObject each derivative (internal S3 client)
  6. Update photo row with s3_key_* and upload_status = 'ready'
  7. Emit SSE: { photoId, status: 'ready', thumbnail: '/img/...' }
```

**Concurrency & memory:** a decoded high-MP image is hundreds of MB in memory, and derivatives are generated per photo. The worker processes a bounded number of photos at once (e.g. `IMAGE_CONCURRENCY=2–4` on a modest server) and generates that photo's derivatives sequentially or in a small pool — never an unbounded `Promise.all` across a 500-photo batch. Tune `IMAGE_CONCURRENCY` to available RAM.

### Upload / Job SSE Events (`GET /events?batch=...`)

```typescript
{ type: 'queued',     photoId, filename }
{ type: 'processing', photoId, filename }
{ type: 'ready',      photoId, filename, thumbnailUrl: '/img/...' }
{ type: 'error',      photoId, filename, reason: 'invalid_mime' | 'too_large' | 'corrupt' | 'storage_error' }
{ type: 'done',       uploaded: 12, failed: 1 }
```

### ZIP Downloads

Streamed straight from S3 to the client, no full-archive buffering. Use **store (level 0)** — the inputs are already-compressed JPEG/WebP, so deflate wastes CPU for ~0% gain.

```
GET /api/gallery/:slug/download
    ├─ Validate session + download permissions; resolve photo set (all | folder | favorites)
    ├─ Headers: Content-Type: application/zip
    │           Content-Disposition: attachment; filename="gallery-title.zip"
    │           Transfer-Encoding: chunked
    └─ For each photo: fetch S3 object stream → archiver entry (store) → HTTP response
```

---

## 10. API Routes

### Authentication
```
POST   /api/auth/login
POST   /api/auth/logout
GET    /api/auth/me
POST   /api/auth/refresh
GET    /api/auth/csrf            # issue CSRF token for cookie-auth mutations
```

### Galleries (admin)
```
GET    /api/galleries
POST   /api/galleries
GET    /api/galleries/:id
PATCH  /api/galleries/:id
DELETE /api/galleries/:id
POST   /api/galleries/:id/duplicate
```

### Photos (admin)
```
POST   /api/galleries/:id/photos            # multipart upload → enqueues jobs, returns { batchId, photoIds }
GET    /api/galleries/:id/photos
PATCH  /api/galleries/:id/photos/reorder
DELETE /api/galleries/:id/photos/:photoId
PATCH  /api/galleries/:id/cover/:photoId
```

### Client-facing
```
POST   /api/gallery/:slug/unlock
GET    /api/gallery/:slug/photos
POST   /api/gallery/:slug/favorite
GET    /api/gallery/:slug/favorites
GET    /api/gallery/:slug/download          # streaming ZIP
GET    /api/gallery/:slug/download/:photoId # single photo
POST   /api/gallery/:slug/track-view
```

### Progress (SSE)
```
GET    /events?batch=:batchId               # upload/processing progress
```

### Image proxy (presigned redirect)
```
GET    /img/:galleryId/:photoId/thumb       # → 302 presigned (thumbnail)
GET    /img/:galleryId/:photoId/preview     # → 302 presigned (preview)
GET    /img/:galleryId/:photoId/original    # → 302 presigned (admin only)
```

### System
```
GET    /health                              # { status, db: 'ok'|'error', s3: 'ok'|'error' }
```

---

## 11. Client Gallery Experience

> **SPA, not SSR.** Galleries are password-gated, so SSR's SEO benefit is moot and its first-paint benefit is already covered by color-accurate placeholders. The client is a React SPA with a fast skeleton — simpler than hand-rolling SSR on Bun/Elysia/Vite. (If a public marketing/cover page is wanted later, SSR can be scoped to just that.)

### URL Structure
```
https://photos.yourdomain.com/g/:slug
https://photos.yourdomain.com/g/:slug/:folderId
```

### Gallery Page Flow
```
Visit /g/smith-wedding
    ├─ Expired (past expires_at + grace_period_days)? → Expiry screen
    ├─ Password set? → Branded full-screen password gate
    │     └─ Correct → set gallery session cookie (httpOnly, SameSite=Lax, 72h), reload
    └─ Load gallery → SPA fetches metadata, then /img/* presigned URLs lazily per viewport
```

### Page Sections
- **Hero / Cover** — full-bleed cover, title, subtitle, event date, branding, download CTA, favorites badge.
- **Photo Grid** — grid / masonry / cinematic slideshow; lazy thumbnails with palette-derived CSS placeholders (zero layout shift); keyboard navigable; infinite scroll or paginated; folder tabs when sub-folders exist.
- **Lightbox** — full-screen, momentum swipe on mobile, arrow keys on desktop, adjacent preload, favorite toggle, single-photo download, share (link with photo anchor).
- **Favorites Panel** — side drawer, per-photo notes, shareable favorites link, submit-notifies-photographer.
- **Download Modal** — scope selector (all / folder / favorites), estimated size before confirm, optional email gate.

---

## 12. Photographer Admin Dashboard

- **Dashboard Home** — gallery cards (cover, title, status, views, last accessed), storage usage (from S3), activity feed.
- **Gallery Editor** — title, slug, client info, event date, status, expiry + grace period, layout, theme, cover, password, download mode, watermark preset, notification toggles, QR code, email-to-client, custom CSS.
- **Photo Manager** — drag-reorder (dnd-kit), multi-select, bulk delete, folders, replace photo, upload widget with per-file SSE progress.
- **Analytics** — per-gallery views over time, downloads log, favorites by photo, device split.

---

## 13. UX Improvements Over Pixieset

| Area | Pixieset | Lumière |
|---|---|---|
| Upload feedback | Batch progress bar | Per-file SSE progress + per-file error detail |
| Password gate | Basic form | Branded full-screen cover with password overlay |
| Favorites | Heart on hover | Persistent drawer, per-photo notes, shareable link |
| Gallery loading | Progressive load | Palette CSS placeholders, zero layout shift |
| Download | One ZIP | Scope selector (all / folder / favorites), size estimate |
| Mobile lightbox | Laggy swipe | Momentum swipe, adjacent preload |
| Gallery sharing | Link only | QR code PNG, one-click copy, direct email from dashboard |
| Notifications | Email only | Per-gallery toggles: view, download, favorites |
| Analytics | Page view count | Timeline, download log, per-photo favorites |
| Branding | Logo + color | Per-gallery custom CSS |
| Gallery list | Flat list | Event-type tags, search, sort by date/views/status |
| Expiry | Date-based | Date + grace period; client countdown badge |
| Comments | Not available | Optional per-photo with moderation queue |
| Photo notes | Not available | Private photographer notes (admin-only) |

---

## 14. Security

### Authentication
- Photographer sessions: short-lived JWT (1h) + refresh token (30d) in httpOnly cookies, `SameSite=Strict`.
- Gallery client sessions: 32-byte hex opaque token in httpOnly cookie, `SameSite=Lax`, 72h TTL, scoped to gallery ID.
- Passwords: Argon2id via `@node-rs/argon2`.

### CSRF
- All cookie-authenticated mutations (admin `POST/PATCH/DELETE`, client `favorite`/`download`) require a CSRF token (double-submit or header token via `GET /api/auth/csrf`). `SameSite` is defense-in-depth, not the sole protection.

### Image Access Control
- Bucket fully private; no anonymous policy.
- Image URLs are short-lived presigned URLs (TTL per §17), issued only after session validation **and** a photo→gallery ownership check (prevents IDOR across galleries).
- Originals presigned only for authenticated admin sessions.
- MinIO S3 API reachable on the LAN + tunnel only; never exposed to the open internet except via the `s3.photos.yourdomain.com` presign vhost.

### Client IP / Rate Limiting
- `client_ip` is derived via a **trusted-proxy parse** — take the correct hop given exactly the known proxies (VPS tunnel), not the leftmost client-supplied `X-Forwarded-For` value (spoofable). Otherwise IP-keyed limits are bypassable.
- Password attempts: 5 per IP per gallery per 15 min (SQLite sliding window).
- Download: 3 ZIP initiations per IP per hour per gallery.
- API: 300 req/min unauthenticated, 1000/min authenticated.
- Upload: nginx body-size limit + per-file cap enforced in app.

### Input Validation & Content
- All API inputs validated via Elysia TypeBox schemas; parameterised queries only (Drizzle).
- File uploads: MIME validated against magic bytes.
- EXIF GPS stripped from both output derivatives **and** the stored `exif_data`.
- `custom_css` is photographer-controlled but still injected markup: sanitise it, scope it to the gallery container, and serve under the CSP in §8.

### Credentials
- App authenticates to MinIO with a scoped service account (bucket-limited), not the root user.
- Secrets via `.env` / Docker secrets; litestream uses env-expanded credentials.

---

## 15. Environment Variables

```bash
# App
PORT=3000
NODE_ENV=production
BASE_URL=https://photos.yourdomain.com
JWT_SECRET=<64-byte random hex>
ADMIN_EMAIL=photographer@example.com

# Database
DATABASE_PATH=/app/data/lumiere.db

# S3 Storage (MinIO on NAS)
S3_ENDPOINT_INTERNAL=http://<nas-lan-ip>:9000        # put/delete/list (LAN)
S3_ENDPOINT_PUBLIC=https://s3.photos.yourdomain.com  # presign signing host (browser-facing)
S3_REGION=us-east-1                                  # any value for MinIO
S3_BUCKET=lumiere
S3_ACCESS_KEY=<scoped-svcacct-key>                   # NOT the MinIO root user
S3_SECRET_KEY=<scoped-svcacct-secret>
S3_FORCE_PATH_STYLE=true                             # true for MinIO

# MinIO bootstrap (used on the NAS only)
MINIO_ROOT_USER=lumiere-admin
MINIO_ROOT_PASSWORD=<strong-password>

# SMTP
SMTP_HOST=smtp.postmarkapp.com
SMTP_PORT=587
SMTP_USER=<api-key>
SMTP_PASS=<api-key>
FROM_EMAIL=noreply@yourdomain.com

# Limits / tuning
MAX_UPLOAD_SIZE_MB=80                  # per-file cap (nginx allows 250M per request batch)
IMAGE_CONCURRENCY=3                    # photos processed in parallel by the worker
RATE_LIMIT_WINDOW_MS=60000
DOWNLOAD_RATE_LIMIT=3
PRESIGN_TTL_SECONDS=60                 # see §17 for thumbnail/public overrides

# Backups (litestream → off-host target)
LITESTREAM_S3_ENDPOINT=https://s3.us-west-002.backblazeb2.com
LITESTREAM_S3_BUCKET=lumiere-db-backups
LITESTREAM_S3_ACCESS_KEY=<b2-key-id>
LITESTREAM_S3_SECRET_KEY=<b2-app-key>

# Optional
WATERMARK_DEFAULT_OPACITY=0.4
```

---

## 16. Backup Strategy

There are two independent data stores: the SQLite DB (home server) and the photo objects (NAS). Back up **off-host** so a single disk failure can't take primary and backup together.

**Database (SQLite)** — litestream replicates the WAL continuously to an **external** S3 target (Backblaze B2 / R2), not to the same MinIO:

```yaml
# litestream.yml
dbs:
  - path: /app/data/lumiere.db
    replicas:
      - type: s3
        endpoint: ${LITESTREAM_S3_ENDPOINT}
        bucket: ${LITESTREAM_S3_BUCKET}
        path: db
        access-key-id: ${LITESTREAM_S3_ACCESS_KEY}
        secret-access-key: ${LITESTREAM_S3_SECRET_KEY}
```

**Object Storage (photos, on the NAS)**
- ZFS snapshots of the `/mnt/tank/lumiere` dataset on a schedule (hourly/daily), with `zfs send` replication to a second pool or another box if available.
- And/or off-site copy of objects to B2/R2:

```sh
# scheduled on the NAS
mc mirror --overwrite local/lumiere b2/my-backup-bucket/lumiere
```

Test a restore (DB + a sample of objects) periodically — an untested backup is a guess.

---

## 17. Performance Targets

| Metric | Target |
|---|---|
| Gallery page load (cold, 100 photos) | < 1.2s LCP on 4G |
| Thumbnail grid first paint | < 800ms |
| Presigned URL generation latency | < 5ms (SQLite lookup + sign) |
| Image fetch after redirect | bound by home **upload** bandwidth (see note) |
| ZIP first-byte latency (500 photos) | < 2s; streams progressively |
| SQLite query p99 | < 5ms |

**Bandwidth reality:** all client image/ZIP bytes leave over the home upload link. A multi-GB wedding download will be slow on residential upload regardless of architecture — this is inherent to serving from the NAS at home. If it becomes a problem, move derivatives (or all objects) to R2 with a custom domain for CDN-fronted, zero-egress delivery; the two-client `storage.ts` makes this a config change.

**Presigned-URL caching:** with a 60s TTL, re-entering a thumbnail into the viewport regenerates a new signed query string → browser cache miss → re-fetch. To avoid re-pulling the grid on every scroll:
- Use a **longer TTL for thumbnails** (e.g. 1h) — they're low-value and high-volume.
- For **public (passwordless) galleries**, use long TTLs (e.g. 3600s) since there's no session to expire.
- If/when on R2 with a custom domain, set `Cache-Control: public, max-age=3600` on derivative objects at upload for edge caching.

---

## 18. Phase Plan

### Phase 1 — Core (MVP)
- App Docker Compose stack (app + litestream); MinIO provisioned on the NAS with scoped svcacct
- Bun/Elysia server; SQLite/Drizzle schema + PRAGMAs + migrations
- Two-client S3 storage abstraction
- **Job queue + worker + reaper** (upload processing runs through it from day one)
- Photographer auth (JWT + CSRF) + trusted-proxy IP parsing
- Gallery CRUD; photo upload pipeline (Sharp → S3), concurrency-bounded
- Client gallery SPA (grid, lightbox, presigned image URLs)
- Password-protected gallery sessions
- Full-gallery streaming ZIP download
- Admin dashboard: gallery list, photo manager, settings
- `/health` reporting db + s3 reachability

### Phase 2 — Client Experience
- Masonry + slideshow layouts; favorites; folders
- Gallery expiry + grace period + countdown badge
- Palette placeholder system

### Phase 3 — Polish & Power Features
- Watermark presets; analytics dashboard; email notifications (all templates)
- Gallery QR codes; per-photo download + download-mode controls
- Comments with moderation; per-gallery custom CSS (sanitised + CSP)

### Phase 4 — Resilience & Ops
- Rate-limit hardening; audit log; multi-photographer support
- Dark mode for client galleries; bulk gallery ops (archive, duplicate, export)
- Documented backend migration (MinIO → B2/R2/S3)

---

## 19. Dependencies Summary

```json
{
  "dependencies": {
    "elysia": "latest",
    "@elysiajs/static": "latest",
    "@elysiajs/cors": "latest",
    "drizzle-orm": "latest",
    "sharp": "latest",
    "archiver": "latest",
    "nodemailer": "latest",
    "handlebars": "latest",
    "jose": "latest",
    "@node-rs/argon2": "latest",
    "@aws-sdk/client-s3": "latest",
    "@aws-sdk/s3-request-presigner": "latest",
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "vite": "latest",
    "@vitejs/plugin-react": "latest",
    "tailwindcss": "^4.0.0",
    "drizzle-kit": "latest",
    "typescript": "latest",
    "bun-types": "latest"
  }
}
```

> Changes from v1.1: dropped `color-thief-node` (dominant color comes from Sharp's `.stats()` — one fewer native dependency and Bun-compat risk). Cookie handling uses Elysia core rather than a separate plugin. Lockfile is `bun.lock` (text) on Bun 1.2+; if your Bun emits `bun.lockb`, adjust the `COPY` line in the Dockerfile to match.

---

*Document version 1.2 — MinIO hosted on the NAS (local-disk-backed, reached over LAN/S3 API), two-endpoint presigning, SQLite hardening, job-queue upload pipeline, security hardening. Implementation begins at Phase 1.*
