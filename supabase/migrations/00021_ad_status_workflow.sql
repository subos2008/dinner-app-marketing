-- Prevent returning to draft after an ad has been synced to Meta
ALTER TABLE marketing.ad ADD CONSTRAINT ad_no_draft_after_sync
  CHECK (meta_ad_id IS NULL OR desired_status != 'draft');
