-- Public-facing creator links surfaced on the client gallery landing
-- (Contact / Website / Instagram). Stored per-photographer.
ALTER TABLE photographers ADD COLUMN website TEXT;
ALTER TABLE photographers ADD COLUMN instagram TEXT;
