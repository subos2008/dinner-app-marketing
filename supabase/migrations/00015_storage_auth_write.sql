-- Add archived_at for soft-delete on images
-- (was 00014b, folded here so fresh deploys pick it up)
ALTER TABLE marketing.base_image ADD COLUMN IF NOT EXISTS archived_at timestamptz;

-- Allow authenticated users to write to the creative bucket
-- (needed for client-side brief save + backups)
CREATE POLICY "authenticated write creative"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'creative');

CREATE POLICY "authenticated update creative"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'creative')
  WITH CHECK (bucket_id = 'creative');
