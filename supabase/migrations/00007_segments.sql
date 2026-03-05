-- Segments: first-class audience niches (separate from freeform tags)

CREATE TABLE marketing.segment (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE marketing.base_image_segment (
  base_image_id uuid NOT NULL REFERENCES marketing.base_image(id) ON DELETE CASCADE,
  segment_id    uuid NOT NULL REFERENCES marketing.segment(id) ON DELETE CASCADE,
  PRIMARY KEY (base_image_id, segment_id)
);

CREATE TABLE marketing.caption_segment (
  caption_id uuid NOT NULL REFERENCES marketing.caption(id) ON DELETE CASCADE,
  segment_id uuid NOT NULL REFERENCES marketing.segment(id) ON DELETE CASCADE,
  PRIMARY KEY (caption_id, segment_id)
);

CREATE TABLE marketing.body_copy_segment (
  body_copy_id uuid NOT NULL REFERENCES marketing.body_copy(id) ON DELETE CASCADE,
  segment_id   uuid NOT NULL REFERENCES marketing.segment(id) ON DELETE CASCADE,
  PRIMARY KEY (body_copy_id, segment_id)
);

CREATE TABLE marketing.ad_segment (
  ad_id      uuid NOT NULL REFERENCES marketing.ad(id) ON DELETE CASCADE,
  segment_id uuid NOT NULL REFERENCES marketing.segment(id) ON DELETE CASCADE,
  PRIMARY KEY (ad_id, segment_id)
);

-- RLS: same pattern as other tables (authenticated full access)
ALTER TABLE marketing.segment ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing.base_image_segment ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing.caption_segment ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing.body_copy_segment ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing.ad_segment ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_all" ON marketing.segment FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all" ON marketing.base_image_segment FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all" ON marketing.caption_segment FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all" ON marketing.body_copy_segment FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all" ON marketing.ad_segment FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Grants (matches existing pattern in 00005_fix_grants.sql)
GRANT ALL ON marketing.segment TO authenticated;
GRANT ALL ON marketing.base_image_segment TO authenticated;
GRANT ALL ON marketing.caption_segment TO authenticated;
GRANT ALL ON marketing.body_copy_segment TO authenticated;
GRANT ALL ON marketing.ad_segment TO authenticated;

-- Seed starting segments
INSERT INTO marketing.segment (name) VALUES
  ('Digital Nomad'),
  ('Vegans'),
  ('Sober People');
