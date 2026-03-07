# Caption Generation Improvements

## Problem

1. Generate Captions auto-saves all results to DB — should have Keep buttons so you choose which to save
2. No role selector on the generate captions page — captions get created without a type
3. `caption.role` is nullable — captions without a role are orphaned (not useful in the ad builder)

## Changes

### DB Migration (00014)

- Set 5 existing NULL-role captions to `'headline'`
- Add `NOT NULL` constraint to `caption.role`
- Add `CHECK` constraint: role must be one of `headline`, `subline`, `cta`, `tagline`

### Edge Function (`generate-captions`)

- Generate mode becomes ephemeral — no DB insert, just return generated texts + role
- Accept `role` parameter in request body
- Tailor Gemini prompt per role (e.g. "5 punchy headlines" vs "5 calls to action")
- Remove `generation_prompt_id` upsert from generate mode (nothing to link)

### Frontend (`creative-spa/index.html`)

- Show role dropdown (headline/subline/cta/tagline) when Caption type is selected
- Reuse existing `renderSuggestions` / `keepSuggestion` pattern for generated caption results
- Pass selected role to edge function
- Remove `renderCaptionResults` (replaced by suggestion-style cards with Keep buttons)

### Unchanged

- Suggest captions after image gen (already has Keep buttons)
- Library tab caption management (already has role selector for manual adds)
- Ad builder caption picker
