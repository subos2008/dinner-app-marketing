-- Enforce caption.role: backfill NULLs, add NOT NULL + CHECK

UPDATE marketing.caption SET role = 'headline' WHERE role IS NULL;

ALTER TABLE marketing.caption ALTER COLUMN role SET NOT NULL;

ALTER TABLE marketing.caption ADD CONSTRAINT caption_role_check
  CHECK (role IN ('headline', 'subline', 'cta', 'tagline'));
