-- Track the S3 multipart uploadId while a direct-to-storage upload is in
-- flight, so the server can complete/abort and a reaper can clean orphans.
ALTER TABLE files ADD COLUMN s3_upload_id TEXT;
