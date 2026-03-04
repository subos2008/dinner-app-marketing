-- Replace segment_slug + filename on image_review with FK to creative_image
-- This ensures reviews always point at a valid image row.

-- 1. Add the FK column
ALTER TABLE marketing.image_review
  ADD COLUMN creative_image_id uuid REFERENCES marketing.creative_image(id);

-- 2. Backfill from existing rows
UPDATE marketing.image_review r
SET creative_image_id = ci.id
FROM marketing.creative_image ci
WHERE ci.segment_slug = r.segment_slug
  AND ci.filename = r.filename;

-- 3. Delete any orphaned reviews that didn't match
DELETE FROM marketing.image_review
WHERE creative_image_id IS NULL;

-- 4. Make it NOT NULL now that orphans are gone
ALTER TABLE marketing.image_review
  ALTER COLUMN creative_image_id SET NOT NULL;

-- 5. Drop old columns and their unique constraint
ALTER TABLE marketing.image_review
  DROP CONSTRAINT image_review_segment_slug_filename_key;

ALTER TABLE marketing.image_review
  DROP COLUMN segment_slug,
  DROP COLUMN filename;

-- 6. Add new unique constraint (one review per image)
ALTER TABLE marketing.image_review
  ADD CONSTRAINT image_review_creative_image_id_key UNIQUE (creative_image_id);
