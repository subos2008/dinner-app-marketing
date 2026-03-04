-- Marketing schema: stores creative review app state
-- Replaces JSON files (reviews.json, ad-status.json, manifest.json)
-- and enables remote deployment without filesystem access

CREATE SCHEMA IF NOT EXISTS marketing;

-- Segments (parsed markdown as JSONB)
CREATE TABLE marketing.segment (
  slug         text PRIMARY KEY,
  name         text NOT NULL,
  segment_type text,
  profile      jsonb,
  empathy      jsonb,
  concepts     jsonb,
  ad_copy      jsonb,
  review       jsonb,
  synced_at    timestamptz DEFAULT now()
);

-- Image metadata (replaces manifest.json)
CREATE TABLE marketing.creative_image (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  segment_slug  text NOT NULL REFERENCES marketing.segment(slug),
  filename      text NOT NULL,
  concept       text,
  ad_variant    text,
  format        text CHECK (format IN ('feed', 'story', 'stories')),
  aspect_ratio  text,
  type          text NOT NULL DEFAULT 'base' CHECK (type IN ('base', 'composited')),
  parent        text,
  prompt        text,
  style         text,
  visual_type   text,
  storage_path  text NOT NULL,
  created_at    timestamptz DEFAULT now(),
  UNIQUE (segment_slug, filename)
);

-- Image reviews (replaces reviews.json)
CREATE TABLE marketing.image_review (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  segment_slug  text NOT NULL,
  filename      text NOT NULL,
  status        text CHECK (status IN ('approved', 'rejected', 'flagged', 'liked')),
  note          text DEFAULT '',
  updated_at    timestamptz DEFAULT now(),
  UNIQUE (segment_slug, filename)
);

-- Ad campaign status (replaces ad-status.json)
CREATE TABLE marketing.ad_campaign_status (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  segment_slug  text NOT NULL REFERENCES marketing.segment(slug),
  ad_id         text NOT NULL,
  status        text NOT NULL DEFAULT 'unreviewed'
                CHECK (status IN ('unreviewed', 'feedback', 'approved', 'live')),
  feedback      text DEFAULT '',
  updated_at    timestamptz DEFAULT now(),
  UNIQUE (segment_slug, ad_id)
);

-- Storage bucket: creative (public, for serving images without auth)
INSERT INTO storage.buckets (id, name, public)
VALUES ('creative', 'creative', true)
ON CONFLICT (id) DO NOTHING;

-- RLS policies

-- Segments: anon can read, service role writes (via sync script)
ALTER TABLE marketing.segment ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon can read segments"
  ON marketing.segment FOR SELECT
  TO anon, authenticated
  USING (true);

-- Creative images: anon can read, service role writes
ALTER TABLE marketing.creative_image ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon can read creative images"
  ON marketing.creative_image FOR SELECT
  TO anon, authenticated
  USING (true);

-- Image reviews: anon can read + write (no auth required for review app)
ALTER TABLE marketing.image_review ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon can read image reviews"
  ON marketing.image_review FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "anon can insert image reviews"
  ON marketing.image_review FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "anon can update image reviews"
  ON marketing.image_review FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- Ad campaign status: anon can read + write
ALTER TABLE marketing.ad_campaign_status ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon can read ad campaign status"
  ON marketing.ad_campaign_status FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "anon can insert ad campaign status"
  ON marketing.ad_campaign_status FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "anon can update ad campaign status"
  ON marketing.ad_campaign_status FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- Storage policies for creative bucket
CREATE POLICY "public read creative"
  ON storage.objects FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'creative');

CREATE POLICY "service role write creative"
  ON storage.objects FOR INSERT
  TO service_role
  WITH CHECK (bucket_id = 'creative');

-- Enable realtime for review and status tables
ALTER PUBLICATION supabase_realtime ADD TABLE marketing.image_review;
ALTER PUBLICATION supabase_realtime ADD TABLE marketing.ad_campaign_status;
