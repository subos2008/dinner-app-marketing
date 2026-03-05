-- Deduplicate existing generation_prompts: keep the oldest row per (type, prompt),
-- reassign FKs from duplicates to the kept row, then delete duplicates.
WITH kept AS (
  SELECT DISTINCT ON (type, prompt) id, type, prompt
  FROM marketing.generation_prompt
  ORDER BY type, prompt, created_at ASC
),
dupes AS (
  SELECT gp.id AS dupe_id, k.id AS keep_id
  FROM marketing.generation_prompt gp
  JOIN kept k ON k.type = gp.type AND k.prompt = gp.prompt
  WHERE gp.id != k.id
)
UPDATE marketing.base_image bi
SET generation_prompt_id = d.keep_id
FROM dupes d
WHERE bi.generation_prompt_id = d.dupe_id;

WITH kept AS (
  SELECT DISTINCT ON (type, prompt) id, type, prompt
  FROM marketing.generation_prompt
  ORDER BY type, prompt, created_at ASC
),
dupes AS (
  SELECT gp.id AS dupe_id, k.id AS keep_id
  FROM marketing.generation_prompt gp
  JOIN kept k ON k.type = gp.type AND k.prompt = gp.prompt
  WHERE gp.id != k.id
)
UPDATE marketing.caption c
SET generation_prompt_id = d.keep_id
FROM dupes d
WHERE c.generation_prompt_id = d.dupe_id;

WITH kept AS (
  SELECT DISTINCT ON (type, prompt) id, type, prompt
  FROM marketing.generation_prompt
  ORDER BY type, prompt, created_at ASC
),
dupes AS (
  SELECT gp.id AS dupe_id
  FROM marketing.generation_prompt gp
  JOIN kept k ON k.type = gp.type AND k.prompt = gp.prompt
  WHERE gp.id != k.id
)
DELETE FROM marketing.generation_prompt
WHERE id IN (SELECT dupe_id FROM dupes);

-- Now safe to add the unique constraint
ALTER TABLE marketing.generation_prompt
  ADD CONSTRAINT generation_prompt_type_prompt_key UNIQUE (type, prompt);
