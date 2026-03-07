# Caption Generation Improvements — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make caption generation ephemeral with Keep buttons, add role selection, and enforce role at the DB level.

**Architecture:** DB migration adds NOT NULL + CHECK on `caption.role`. Edge function's generate mode stops persisting and returns ephemeral results. Frontend reuses existing suggestion/keep pattern for generated captions.

**Tech Stack:** PostgreSQL (Supabase), Deno (Edge Functions), vanilla JS (SPA)

---

### Task 1: DB Migration — enforce caption role

**Files:**
- Create: `supabase/migrations/00014_caption_role_not_null.sql`

**Step 1: Write the migration**

```sql
-- Enforce caption.role: backfill NULLs, add NOT NULL + CHECK

UPDATE marketing.caption SET role = 'headline' WHERE role IS NULL;

ALTER TABLE marketing.caption ALTER COLUMN role SET NOT NULL;

ALTER TABLE marketing.caption ADD CONSTRAINT caption_role_check
  CHECK (role IN ('headline', 'subline', 'cta', 'tagline'));
```

**Step 2: Apply the migration**

Run: `supabase db push --linked`
Expected: Migration applies successfully, no errors.

**Step 3: Verify**

Run: `deno task cli captions list 2>/dev/null | python3 -c "import sys,json; caps=json.load(sys.stdin); null_roles=[c for c in caps if not c.get('role')]; print(f'NULL roles: {len(null_roles)}')"`
Expected: `NULL roles: 0`

**Step 4: Commit**

```bash
git add supabase/migrations/00014_caption_role_not_null.sql
git commit -m "Migration: enforce NOT NULL + CHECK on caption.role"
```

---

### Task 2: Edge Function — make generate mode ephemeral with role param

**Files:**
- Modify: `supabase/functions/generate-captions/index.ts` (the `handleGenerate` function, lines 35-85)

**Step 1: Rewrite handleGenerate**

Replace the entire `handleGenerate` function. The new version:
- Accepts `role` from request body (required)
- Does NOT insert into DB
- Returns `{ suggestions: [...] }` (same shape as suggest mode) with `text` and `role` on each item
- Tailors the Gemini prompt per role

```typescript
async function handleGenerate(body: any) {
  const { prompt, brief, segment_hint, role } = body
  if (!prompt) return jsonResponse({ error: 'prompt is required' }, 400)
  if (!role) return jsonResponse({ error: 'role is required' }, 400)

  const validRoles = ['headline', 'subline', 'cta', 'tagline']
  if (!validRoles.includes(role)) {
    return jsonResponse({ error: `role must be one of: ${validRoles.join(', ')}` }, 400)
  }

  const roleInstructions: Record<string, string> = {
    headline: 'Generate 5 short, punchy headlines (5-8 words each). Bold, attention-grabbing.',
    subline: 'Generate 5 supporting sublines (8-12 words each). Expand on the hook, add context.',
    cta: 'Generate 5 calls to action (3-5 words each). Direct, action-oriented.',
    tagline: 'Generate 5 brand taglines (5-8 words each). Warm, honest, memorable.',
  }

  const geminiPrompt = [
    brief ? `Context — creative brief:\n${brief}\n\n---\n\n` : '',
    segment_hint ? `Segment style hint: ${segment_hint}\n\n` : '',
    `Ad copy request: ${prompt}\n\n`,
    roleInstructions[role] + '\n\n',
    'Keep copy warm, honest, direct. Not corporate. Not cringey.\n',
    'Output ONLY a JSON array of strings. No markdown fences, no explanation — just the array.',
  ].join('')

  console.log(`[generate-captions] generating ${role}s...`)
  let geminiOutput: string
  try {
    geminiOutput = await generateCaptions(geminiPrompt)
  } catch (err) {
    console.error('[generate-captions] Gemini failed:', (err as Error).message)
    return jsonResponse({ error: 'Caption generation failed', detail: (err as Error).message }, 500)
  }

  let captions: string[]
  try {
    const jsonMatch = geminiOutput.match(/\[[\s\S]*\]/)
    if (!jsonMatch) throw new Error('No JSON array found in output')
    captions = JSON.parse(jsonMatch[0])
    if (!Array.isArray(captions)) throw new Error('Parsed value is not an array')
    captions = captions.filter((c: unknown) => typeof c === 'string' && (c as string).trim().length > 0)
  } catch {
    console.error(`[generate-captions] Failed to parse. Output:\n${geminiOutput.slice(0, 500)}`)
    return jsonResponse({
      error: 'Failed to parse generated captions',
      geminiOutput: geminiOutput.slice(0, 500),
    }, 500)
  }

  const suggestions = captions.map(text => ({ text: text.trim(), role }))
  console.log(`[generate-captions] generated ${suggestions.length} ${role}s`)
  return jsonResponse({ suggestions })
}
```

**Step 2: Update handleGenerate call in the main handler**

The main handler currently passes `userClient` to `handleGenerate`. Since we no longer need it (no DB writes), change:

```typescript
// Line ~25: change from
return await handleGenerate(body, userClient)
// to
return await handleGenerate(body)
```

Also remove the auth check above it (lines 19-23) since generate mode no longer writes to DB. The whole try block becomes:

```typescript
try {
  const body = await req.json()
  const { mode } = body

  if (mode === 'suggest') {
    return await handleSuggest(body)
  }

  return await handleGenerate(body)
} catch (err) {
  console.error('generate-captions error:', err)
  return jsonResponse({ error: (err as Error).message }, 500)
}
```

**Step 3: Remove upsertGenerationPrompt**

Delete the `upsertGenerationPrompt` function (lines 130-149) and the `createUserClient` import (line 2) since neither is used anymore.

**Step 4: Deploy**

Run: `supabase functions deploy generate-captions`
Expected: Deployed successfully.

**Step 5: Commit**

```bash
git add supabase/functions/generate-captions/index.ts
git commit -m "Edge function: make caption generation ephemeral, accept role param"
```

---

### Task 3: Frontend — role selector and Keep buttons for generated captions

**Files:**
- Modify: `web-apps/creative-spa/index.html`

This task has several sub-steps in the same file.

**Step 1: Add role selector HTML**

After the mode select div (around line 1646), add a new role selector div that mirrors the ratio/mode select styling:

```html
<!-- Caption role selector (hidden until Caption type) -->
<div class="gen-role-select hidden" id="gen-role-row">
  <label>Type</label>
  <select id="gen-role-select">
    <option value="headline">Headline</option>
    <option value="subline">Subline</option>
    <option value="cta">CTA</option>
    <option value="tagline">Tagline</option>
  </select>
</div>
```

**Step 2: Add CSS for role selector**

Add to the CSS section (reuse existing `.gen-ratio-select` / `.gen-mode-select` styling pattern):

```css
.gen-role-select {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 16px;
  margin-bottom: 12px;
}
.gen-role-select label {
  font-size: 13px;
  color: var(--text-secondary);
  min-width: 40px;
}
.gen-role-select select {
  flex: 1;
  padding: 8px 12px;
  border-radius: var(--radius);
  border: 0.5px solid var(--separator);
  background: var(--surface);
  color: var(--text-primary);
  font-size: 14px;
  -webkit-appearance: none;
}
```

**Step 3: Wire up role selector in JS**

Add element ref near the other `$gen` refs (around line 1800):

```javascript
const $genRoleRow = document.getElementById('gen-role-row');
const $genRoleSelect = document.getElementById('gen-role-select');
```

**Step 4: Show/hide role selector in setGenerateType**

In the `setGenerateType` function (line 2102), add role row visibility toggle. After the line that hides caption picker (line 2116):

```javascript
// Show/hide role selector (caption only)
$genRoleRow.classList.toggle('hidden', type !== 'caption');
```

**Step 5: Update handleGenerate to use ephemeral caption flow**

In `handleGenerate` (line 2261), change the caption branch. The current code (around lines 2285-2335) sends to `generate-captions`, auto-assigns segments, and calls `renderCaptionResults`. Replace with:

1. Add `role` to the request body when `generateType === 'caption'`:

```javascript
const body = {
  brief: briefText || undefined,
  prompt: promptText,
  segment_hint: segmentHint,
  aspect_ratio: generateType === 'image' ? $genRatioSelect.value : undefined,
  role: generateType === 'caption' ? $genRoleSelect.value : undefined,
};
```

2. Change the caption result handler (the `else if` branch around line 2324) from:

```javascript
} else if (generateType === 'caption' && data && data.captions) {
  if (activeSegmentId) {
    for (const cap of data.captions) {
      await db().from('caption_segment').insert({
        caption_id: cap.id,
        segment_id: activeSegmentId,
      });
    }
  }
  renderCaptionResults(data.captions);
}
```

to:

```javascript
} else if (generateType === 'caption' && data && data.suggestions) {
  renderSuggestions(data.suggestions);
}
```

3. Remove the `await loadData()` call after caption generation (it's no longer needed since nothing was saved — loadData will happen when the user clicks Keep).

**Step 6: Delete renderCaptionResults**

Delete the `renderCaptionResults` function (line 2360, ~15 lines). It's fully replaced by `renderSuggestions`.

**Step 7: Test manually**

1. Open the creative SPA, go to Generate tab
2. Select "Caption" type — role dropdown should appear, ratio/mode should hide
3. Select "Image" type — role dropdown should hide, ratio/mode should appear
4. Select a role (e.g. "Headline"), enter a prompt, click Generate
5. Results should appear as suggestion cards with Keep buttons
6. Click Keep on one — should save to DB with the correct role
7. Check Library > Captions — the kept caption should appear with role badge
8. Switch to Image type, generate an image — suggest captions should still work as before

**Step 8: Commit**

```bash
git add web-apps/creative-spa/index.html
git commit -m "Creative SPA: role selector + Keep buttons for generated captions"
```
