-- Grant schema usage and table permissions to PostgREST roles
-- Authenticated only — no anon access

GRANT USAGE ON SCHEMA marketing TO authenticated, service_role;

-- Service role: full access (used by sync script)
GRANT ALL ON ALL TABLES IN SCHEMA marketing TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA marketing TO service_role;

-- Authenticated: read all, write reviews + ad status
GRANT SELECT ON ALL TABLES IN SCHEMA marketing TO authenticated;
GRANT INSERT, UPDATE ON marketing.image_review TO authenticated;
GRANT INSERT, UPDATE ON marketing.ad_campaign_status TO authenticated;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA marketing TO authenticated;

-- Future tables
ALTER DEFAULT PRIVILEGES IN SCHEMA marketing GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA marketing GRANT SELECT ON TABLES TO authenticated;

-- Fix RLS policies from 00001 that included anon — drop and recreate as authenticated-only

-- Segments
DROP POLICY IF EXISTS "anon can read segments" ON marketing.segment;
CREATE POLICY "authenticated can read segments"
  ON marketing.segment FOR SELECT
  TO authenticated
  USING (true);

-- Creative images
DROP POLICY IF EXISTS "anon can read creative images" ON marketing.creative_image;
CREATE POLICY "authenticated can read creative images"
  ON marketing.creative_image FOR SELECT
  TO authenticated
  USING (true);

-- Image reviews
DROP POLICY IF EXISTS "anon can read image reviews" ON marketing.image_review;
DROP POLICY IF EXISTS "anon can insert image reviews" ON marketing.image_review;
DROP POLICY IF EXISTS "anon can update image reviews" ON marketing.image_review;

CREATE POLICY "authenticated can read image reviews"
  ON marketing.image_review FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "authenticated can insert image reviews"
  ON marketing.image_review FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "authenticated can update image reviews"
  ON marketing.image_review FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Ad campaign status
DROP POLICY IF EXISTS "anon can read ad campaign status" ON marketing.ad_campaign_status;
DROP POLICY IF EXISTS "anon can insert ad campaign status" ON marketing.ad_campaign_status;
DROP POLICY IF EXISTS "anon can update ad campaign status" ON marketing.ad_campaign_status;

CREATE POLICY "authenticated can read ad campaign status"
  ON marketing.ad_campaign_status FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "authenticated can insert ad campaign status"
  ON marketing.ad_campaign_status FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "authenticated can update ad campaign status"
  ON marketing.ad_campaign_status FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Storage: keep public read (images need to load in <img> tags without auth headers)
-- but remove anon write — only service_role can upload
DROP POLICY IF EXISTS "public read creative" ON storage.objects;
CREATE POLICY "public read creative"
  ON storage.objects FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'creative');
