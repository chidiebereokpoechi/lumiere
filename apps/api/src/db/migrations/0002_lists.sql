-- Folder visibility, client email on session, and client-made lists.

ALTER TABLE gallery_folders ADD COLUMN hidden INTEGER DEFAULT 0;
ALTER TABLE gallery_sessions ADD COLUMN client_email TEXT;

CREATE TABLE lists (
  id TEXT PRIMARY KEY,
  gallery_id TEXT NOT NULL REFERENCES galleries(id) ON DELETE CASCADE,
  session_token TEXT,
  client_email TEXT,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_lists_gallery ON lists(gallery_id);
CREATE INDEX idx_lists_session ON lists(session_token);

CREATE TABLE list_items (
  id TEXT PRIMARY KEY,
  list_id TEXT NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
  file_id TEXT NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX uniq_list_item ON list_items(list_id, file_id);
