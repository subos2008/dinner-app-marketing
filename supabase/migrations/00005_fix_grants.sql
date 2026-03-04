-- Fix: grant full CRUD to authenticated role on tables created in 00004.
-- The default privileges from 00002 only granted SELECT to authenticated.

GRANT ALL ON marketing.tag TO authenticated;
GRANT ALL ON marketing.base_image TO authenticated;
GRANT ALL ON marketing.caption TO authenticated;
GRANT ALL ON marketing.body_copy TO authenticated;
GRANT ALL ON marketing.ad_set TO authenticated;
GRANT ALL ON marketing.ad TO authenticated;
GRANT ALL ON marketing.base_image_tag TO authenticated;
GRANT ALL ON marketing.caption_tag TO authenticated;
GRANT ALL ON marketing.body_copy_tag TO authenticated;

-- Fix default privileges so future tables get full access too
ALTER DEFAULT PRIVILEGES IN SCHEMA marketing GRANT ALL ON TABLES TO authenticated;
