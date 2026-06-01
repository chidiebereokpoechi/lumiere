-- Non-image gallery attachments (PDFs, contracts, ZIPs of raws, etc).
-- Separate table from `photos` so the photo pipeline stays single-purpose.

CREATE TABLE attachments (
  id                 TEXT PRIMARY KEY,
  gallery_id         TEXT NOT NULL REFERENCES galleries(id) ON DELETE CASCADE,
  folder_id          TEXT REFERENCES gallery_folders(id) ON DELETE SET NULL,
  filename_original  TEXT NOT NULL,
  display_name       TEXT,
  s3_key             TEXT NOT NULL,
  mime_type          TEXT,
  file_size          INTEGER,
  description        TEXT,
  position           INTEGER DEFAULT 0,
  created_at         INTEGER NOT NULL
);

CREATE INDEX idx_attachments_gallery ON attachments(gallery_id);
CREATE INDEX idx_attachments_folder ON attachments(folder_id);
