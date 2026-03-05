-- Multi-layer text overlays: add role to captions, M2M ad_caption join table

-- 1. Add role column to caption
ALTER TABLE marketing.caption ADD COLUMN role text;

-- 2. Create ad_caption M2M join table
CREATE TABLE marketing.ad_caption (
  ad_id      uuid NOT NULL REFERENCES marketing.ad(id) ON DELETE CASCADE,
  caption_id uuid NOT NULL REFERENCES marketing.caption(id) ON DELETE CASCADE,
  PRIMARY KEY (ad_id, caption_id)
);

-- 3. Migrate existing ad→caption relationships
INSERT INTO marketing.ad_caption (ad_id, caption_id)
SELECT id, caption_id FROM marketing.ad WHERE caption_id IS NOT NULL;

-- 4. Drop caption_id FK from ad
ALTER TABLE marketing.ad DROP COLUMN caption_id;

-- 5. RLS + grants (matches existing pattern)
ALTER TABLE marketing.ad_caption ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all" ON marketing.ad_caption FOR ALL TO authenticated USING (true) WITH CHECK (true);
GRANT ALL ON marketing.ad_caption TO authenticated;
