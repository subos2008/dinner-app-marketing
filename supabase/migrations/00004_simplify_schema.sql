-- Simplify schema: replace segment-centric model with
-- base images + captions + body copy + ads (mirrors Meta hierarchy)

-- 1. New tables

CREATE TABLE marketing.tag (
  id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE
);

CREATE TABLE marketing.base_image (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  filename     text NOT NULL,
  storage_path text NOT NULL UNIQUE,
  prompt       text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE marketing.caption (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  text       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE marketing.body_copy (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  text       text NOT NULL,
  headline   text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE marketing.ad_set (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  status     text NOT NULL DEFAULT 'paused',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE marketing.ad (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ad_set_id             uuid REFERENCES marketing.ad_set(id) ON DELETE SET NULL,
  base_image_id         uuid NOT NULL REFERENCES marketing.base_image(id),
  caption_id            uuid REFERENCES marketing.caption(id) ON DELETE SET NULL,
  body_copy_id          uuid REFERENCES marketing.body_copy(id) ON DELETE SET NULL,
  composited_image_path text,
  generation_prompt     text,
  desired_status        text NOT NULL DEFAULT 'draft',
  meta_status           text,
  meta_ad_id            text,
  feedback              text,
  created_at            timestamptz NOT NULL DEFAULT now()
);

-- Join tables for tagging
CREATE TABLE marketing.base_image_tag (
  base_image_id uuid NOT NULL REFERENCES marketing.base_image(id) ON DELETE CASCADE,
  tag_id        uuid NOT NULL REFERENCES marketing.tag(id) ON DELETE CASCADE,
  PRIMARY KEY (base_image_id, tag_id)
);

CREATE TABLE marketing.caption_tag (
  caption_id uuid NOT NULL REFERENCES marketing.caption(id) ON DELETE CASCADE,
  tag_id     uuid NOT NULL REFERENCES marketing.tag(id) ON DELETE CASCADE,
  PRIMARY KEY (caption_id, tag_id)
);

CREATE TABLE marketing.body_copy_tag (
  body_copy_id uuid NOT NULL REFERENCES marketing.body_copy(id) ON DELETE CASCADE,
  tag_id       uuid NOT NULL REFERENCES marketing.tag(id) ON DELETE CASCADE,
  PRIMARY KEY (body_copy_id, tag_id)
);

-- 2. RLS

ALTER TABLE marketing.tag ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing.base_image ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing.caption ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing.body_copy ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing.ad_set ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing.ad ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing.base_image_tag ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing.caption_tag ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing.body_copy_tag ENABLE ROW LEVEL SECURITY;

-- Authenticated full access on all tables
CREATE POLICY "auth_all" ON marketing.tag FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all" ON marketing.base_image FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all" ON marketing.caption FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all" ON marketing.body_copy FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all" ON marketing.ad_set FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all" ON marketing.ad FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all" ON marketing.base_image_tag FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all" ON marketing.caption_tag FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all" ON marketing.body_copy_tag FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 3. Migrate data

-- Images: carry over non-composited images
INSERT INTO marketing.base_image (id, filename, storage_path, prompt, created_at)
SELECT id, filename, storage_path, prompt, COALESCE(created_at, now())
FROM marketing.creative_image
WHERE type IS NULL OR type = 'base';

-- Tags: create from existing segment slugs
INSERT INTO marketing.tag (name)
SELECT DISTINCT segment_slug FROM marketing.creative_image
WHERE segment_slug IS NOT NULL
ON CONFLICT (name) DO NOTHING;

-- Tag the migrated images with their segment
INSERT INTO marketing.base_image_tag (base_image_id, tag_id)
SELECT bi.id, t.id
FROM marketing.base_image bi
JOIN marketing.creative_image ci ON ci.id = bi.id
JOIN marketing.tag t ON t.name = ci.segment_slug
WHERE ci.segment_slug IS NOT NULL;

-- 4. Realtime on ad table
ALTER PUBLICATION supabase_realtime ADD TABLE marketing.ad;

-- 5. Drop old tables (CASCADE handles FK deps)
DROP TABLE IF EXISTS marketing.image_review CASCADE;
DROP TABLE IF EXISTS marketing.ad_campaign_status CASCADE;
DROP TABLE IF EXISTS marketing.creative_image CASCADE;
DROP TABLE IF EXISTS marketing.segment CASCADE;
