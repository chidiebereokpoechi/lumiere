-- Standalone gallery cover (uploaded, not a gallery photo) + focal point.

ALTER TABLE galleries ADD COLUMN cover_image_key TEXT;
ALTER TABLE galleries ADD COLUMN cover_focal_x INTEGER;
ALTER TABLE galleries ADD COLUMN cover_focal_y INTEGER;
