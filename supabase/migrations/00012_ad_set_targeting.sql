-- Campaign table + ad_set targeting columns + sync log

-- Campaign: top of Meta's ad hierarchy
CREATE TABLE marketing.campaign (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name             text NOT NULL,
  objective        text NOT NULL DEFAULT 'OUTCOME_TRAFFIC',
  desired_status   text NOT NULL DEFAULT 'paused',
  meta_status      text,
  meta_campaign_id text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- Extend ad_set with targeting + desired/actual state
ALTER TABLE marketing.ad_set
  ADD COLUMN campaign_id        uuid REFERENCES marketing.campaign(id) ON DELETE SET NULL,
  ADD COLUMN daily_budget_cents  integer,
  ADD COLUMN currency           text DEFAULT 'GBP',
  ADD COLUMN start_date         date,
  ADD COLUMN end_date           date,
  ADD COLUMN age_min            integer,
  ADD COLUMN age_max            integer,
  ADD COLUMN genders            integer[],
  ADD COLUMN geo_locations      jsonb,
  ADD COLUMN targeting          jsonb,
  ADD COLUMN placements         jsonb,
  ADD COLUMN desired_status     text NOT NULL DEFAULT 'paused',
  ADD COLUMN meta_status        text,
  ADD COLUMN meta_ad_set_id     text,
  ADD COLUMN updated_at         timestamptz NOT NULL DEFAULT now();

-- Replace old status column with desired_status
ALTER TABLE marketing.ad_set DROP COLUMN IF EXISTS status;

-- Sync log: audit trail for all Meta API interactions
CREATE TABLE marketing.sync_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL,
  entity_id   uuid NOT NULL,
  action      text NOT NULL,
  status      text NOT NULL,
  meta_id     text,
  error       text,
  synced_at   timestamptz NOT NULL DEFAULT now()
);

-- Triggers: reuse existing set_updated_at() function from 00011
CREATE TRIGGER campaign_set_updated_at
  BEFORE UPDATE ON marketing.campaign
  FOR EACH ROW
  EXECUTE FUNCTION marketing.set_updated_at();

CREATE TRIGGER ad_set_set_updated_at
  BEFORE UPDATE ON marketing.ad_set
  FOR EACH ROW
  EXECUTE FUNCTION marketing.set_updated_at();

-- RLS
ALTER TABLE marketing.campaign ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing.sync_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_all" ON marketing.campaign FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all" ON marketing.sync_log FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Grants
GRANT ALL ON marketing.campaign TO authenticated;
GRANT ALL ON marketing.sync_log TO authenticated;

-- Realtime: add ad_set and campaign to publication
ALTER PUBLICATION supabase_realtime ADD TABLE marketing.ad_set;
ALTER PUBLICATION supabase_realtime ADD TABLE marketing.campaign;
