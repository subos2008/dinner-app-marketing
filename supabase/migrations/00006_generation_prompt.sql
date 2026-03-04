-- Track generation prompts and link generated images/captions back to them.

-- New table: stores each generation request
CREATE TABLE marketing.generation_prompt (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL CHECK (type IN ('image', 'caption')),
  prompt text NOT NULL,
  brief text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE marketing.generation_prompt ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated full access" ON marketing.generation_prompt
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Grant
GRANT ALL ON marketing.generation_prompt TO authenticated;

-- FK columns on existing tables (nullable — manually added items won't have a prompt)
ALTER TABLE marketing.base_image
  ADD COLUMN generation_prompt_id uuid REFERENCES marketing.generation_prompt(id);

ALTER TABLE marketing.caption
  ADD COLUMN generation_prompt_id uuid REFERENCES marketing.generation_prompt(id);
