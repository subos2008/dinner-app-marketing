-- Prevent deleting captions that are still used by ads.
-- Change ON DELETE CASCADE to ON DELETE RESTRICT on ad_caption.caption_id.

ALTER TABLE marketing.ad_caption
  DROP CONSTRAINT ad_caption_caption_id_fkey,
  ADD CONSTRAINT ad_caption_caption_id_fkey
    FOREIGN KEY (caption_id) REFERENCES marketing.caption(id) ON DELETE RESTRICT;
