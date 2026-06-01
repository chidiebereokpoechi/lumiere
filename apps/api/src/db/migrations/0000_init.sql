-- Lumière v1 initial schema (v1.2 §5 verbatim + refresh_tokens extension)
-- FKs require `PRAGMA foreign_keys = ON;` to be set on the connection (see src/db/index.ts).

CREATE TABLE photographers (
  id            TEXT PRIMARY KEY,
  email         TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name          TEXT NOT NULL,
  brand_name    TEXT,
  logo_s3_key   TEXT,
  settings      TEXT DEFAULT '{}',
  created_at    INTEGER NOT NULL
);

CREATE TABLE galleries (
  id                  TEXT PRIMARY KEY,
  photographer_id     TEXT NOT NULL REFERENCES photographers(id) ON DELETE CASCADE,
  slug                TEXT UNIQUE NOT NULL,
  title               TEXT NOT NULL,
  subtitle            TEXT,
  cover_photo_id      TEXT REFERENCES photos(id) ON DELETE SET NULL,
  password_hash       TEXT,
  status              TEXT DEFAULT 'active',
  download_mode       TEXT DEFAULT 'watermarked',
  expires_at          INTEGER,
  grace_period_days   INTEGER DEFAULT 0,
  allow_favorites     INTEGER DEFAULT 1,
  allow_comments      INTEGER DEFAULT 0,
  allow_download      INTEGER DEFAULT 1,
  client_name         TEXT,
  client_email        TEXT,
  event_date          INTEGER,
  event_type          TEXT,
  layout              TEXT DEFAULT 'grid',
  color_theme         TEXT DEFAULT 'light',
  custom_css          TEXT,
  watermark_preset_id TEXT,
  sort_order          TEXT DEFAULT 'manual',
  notify_on_view      INTEGER DEFAULT 1,
  view_count          INTEGER DEFAULT 0,
  created_at          INTEGER NOT NULL,
  updated_at          INTEGER NOT NULL
);

CREATE TABLE gallery_folders (
  id             TEXT PRIMARY KEY,
  gallery_id     TEXT NOT NULL REFERENCES galleries(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  position       INTEGER DEFAULT 0,
  cover_photo_id TEXT REFERENCES photos(id) ON DELETE SET NULL
);

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
  exif_data          TEXT,
  color_palette      TEXT,
  position           INTEGER DEFAULT 0,
  upload_status      TEXT DEFAULT 'processing',
  error_message      TEXT,
  created_at         INTEGER NOT NULL
);

CREATE INDEX idx_photos_gallery ON photos(gallery_id);
CREATE INDEX idx_photos_folder ON photos(folder_id);

CREATE TABLE jobs (
  id           TEXT PRIMARY KEY,
  type         TEXT NOT NULL,
  gallery_id   TEXT REFERENCES galleries(id) ON DELETE CASCADE,
  payload      TEXT NOT NULL,
  status       TEXT DEFAULT 'queued',
  attempts     INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 3,
  locked_at    INTEGER,
  last_error   TEXT,
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL
);

CREATE INDEX idx_jobs_status ON jobs(status);
CREATE INDEX idx_jobs_locked_at ON jobs(locked_at);

CREATE TABLE gallery_sessions (
  token       TEXT PRIMARY KEY,
  gallery_id  TEXT NOT NULL REFERENCES galleries(id) ON DELETE CASCADE,
  client_ip   TEXT,
  created_at  INTEGER NOT NULL,
  expires_at  INTEGER NOT NULL
);

CREATE INDEX idx_gallery_sessions_expires ON gallery_sessions(expires_at);

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

CREATE TABLE downloads (
  id           TEXT PRIMARY KEY,
  gallery_id   TEXT NOT NULL REFERENCES galleries(id) ON DELETE CASCADE,
  photo_id     TEXT REFERENCES photos(id) ON DELETE SET NULL,
  client_ip    TEXT,
  client_email TEXT,
  created_at   INTEGER NOT NULL
);

CREATE TABLE gallery_views (
  id         TEXT PRIMARY KEY,
  gallery_id TEXT NOT NULL REFERENCES galleries(id) ON DELETE CASCADE,
  client_ip  TEXT,
  user_agent TEXT,
  referrer   TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE notifications (
  id         TEXT PRIMARY KEY,
  gallery_id TEXT REFERENCES galleries(id) ON DELETE CASCADE,
  type       TEXT NOT NULL,
  recipient  TEXT NOT NULL,
  sent_at    INTEGER,
  status     TEXT DEFAULT 'pending'
);

CREATE TABLE watermark_presets (
  id              TEXT PRIMARY KEY,
  photographer_id TEXT NOT NULL REFERENCES photographers(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  type            TEXT NOT NULL,
  config          TEXT NOT NULL
);

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

-- Extension: rotating refresh tokens (hashed at rest).
CREATE TABLE refresh_tokens (
  id              TEXT PRIMARY KEY,
  photographer_id TEXT NOT NULL REFERENCES photographers(id) ON DELETE CASCADE,
  token_hash      TEXT NOT NULL,
  expires_at      INTEGER NOT NULL,
  revoked_at      INTEGER,
  created_at      INTEGER NOT NULL
);

CREATE INDEX idx_refresh_tokens_photographer ON refresh_tokens(photographer_id);

-- Rate-limit ledger (SQLite sliding window).
CREATE TABLE rate_limit_events (
  bucket     TEXT NOT NULL,
  key        TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX idx_rate_limit ON rate_limit_events(bucket, key, created_at);
-- Note: the _migrations ledger table is created by src/db/migrate.ts before
-- this file runs, so we don't recreate it here.

