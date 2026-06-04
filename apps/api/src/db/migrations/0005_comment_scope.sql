-- Comment scope: 'set' (public, approval) vs 'list'/'favorites' (private note).

ALTER TABLE comments ADD COLUMN scope TEXT NOT NULL DEFAULT 'set';
ALTER TABLE comments ADD COLUMN list_id TEXT;
