-- Add aspect_ratio column with temporary default for backfill
ALTER TABLE marketing.base_image
  ADD COLUMN aspect_ratio text NOT NULL DEFAULT '1:1';

-- Remove default so future inserts must specify
ALTER TABLE marketing.base_image
  ALTER COLUMN aspect_ratio DROP DEFAULT;
