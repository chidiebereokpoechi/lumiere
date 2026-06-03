-- Client gallery navigation style: 'tabs' (default) or 'collections'.

ALTER TABLE galleries ADD COLUMN nav_style TEXT DEFAULT 'tabs';
