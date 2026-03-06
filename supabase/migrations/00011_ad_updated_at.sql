ALTER TABLE marketing.ad
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();

CREATE OR REPLACE FUNCTION marketing.set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ad_set_updated_at
  BEFORE UPDATE ON marketing.ad
  FOR EACH ROW
  EXECUTE FUNCTION marketing.set_updated_at();
