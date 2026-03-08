-- Allow 'video' as a generation_prompt type
ALTER TABLE marketing.generation_prompt
  DROP CONSTRAINT generation_prompt_type_check;

ALTER TABLE marketing.generation_prompt
  ADD CONSTRAINT generation_prompt_type_check CHECK (type IN ('image', 'caption', 'video'));
