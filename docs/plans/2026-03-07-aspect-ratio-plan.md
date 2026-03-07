# Aspect Ratio Support Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Support 4:5 (feed), 9:16 (story/reels), and 2:3 (Grindr) aspect ratios for image generation and compositing.

**Architecture:** Add `aspect_ratio` column to `base_image`, pass it through the generation and compositing pipelines to Gemini's `imageConfig.aspectRatio`, add ratio picker UI to both SPAs, and add an "Image + Text" mode for baked-in text generation.

**Tech Stack:** Supabase (Postgres, Edge Functions, Storage), Gemini API (`@google/genai`), vanilla JS SPAs

---

### Task 1: Migration — add aspect_ratio to base_image

**Files:**
- Create: `supabase/migrations/00013_aspect_ratio.sql`

**Step 1: Write the migration**

```sql
-- Add aspect_ratio column with temporary default for backfill
ALTER TABLE marketing.base_image
  ADD COLUMN aspect_ratio text NOT NULL DEFAULT '1:1';

-- Remove default so future inserts must specify
ALTER TABLE marketing.base_image
  ALTER COLUMN aspect_ratio DROP DEFAULT;
```

**Step 2: Apply the migration**

Run: `supabase db push --linked`
Expected: Migration applied successfully

**Step 3: Commit**

```
git add supabase/migrations/00013_aspect_ratio.sql
git commit -m "Add aspect_ratio column to base_image"
```

---

### Task 2: Gemini module — pass aspect ratio

**Files:**
- Modify: `supabase/functions/_shared/gemini.ts`

**Step 1: Update generateImage signature and config**

Change `generateImage` (line 31) to accept an optional `aspectRatio` parameter and pass it via `config.imageConfig`:

```typescript
export async function generateImage(prompt: string, aspectRatio?: string): Promise<ImageResult> {
  const client = getClient()
  const response = await client.models.generateContent({
    model: MODEL,
    contents: prompt,
    config: aspectRatio ? { imageConfig: { aspectRatio } } : undefined,
  })
  return extractImage(response)
}
```

**Step 2: Update editImage signature and config**

Change `editImage` (line 41) to accept an optional `aspectRatio` parameter:

```typescript
export async function editImage(
  imageData: Uint8Array,
  mimeType: string,
  prompt: string,
  aspectRatio?: string
): Promise<ImageResult> {
  const client = getClient()
  const response = await client.models.generateContent({
    model: MODEL,
    contents: [
      {
        parts: [
          {
            inlineData: {
              data: base64Encode(imageData),
              mimeType,
            },
          },
          { text: prompt },
        ],
      },
    ],
    config: aspectRatio ? { imageConfig: { aspectRatio } } : undefined,
  })
  return extractImage(response)
}
```

**Step 3: Deploy and verify**

Run: `supabase functions deploy generate-image && supabase functions deploy composite`

**Step 4: Commit**

```
git add supabase/functions/_shared/gemini.ts
git commit -m "Pass aspect ratio to Gemini generateImage and editImage"
```

---

### Task 3: generate-image Edge Function — accept and store aspect_ratio

**Files:**
- Modify: `supabase/functions/generate-image/index.ts`

**Step 1: Accept aspect_ratio from request body**

Change line 17 to destructure `aspect_ratio`:

```typescript
const { prompt, brief, segment_hint, aspect_ratio } = await req.json()
if (!prompt) return jsonResponse({ error: 'prompt is required' }, 400)
if (!aspect_ratio) return jsonResponse({ error: 'aspect_ratio is required' }, 400)
```

**Step 2: Pass aspect_ratio to generateImage**

Change line 35:

```typescript
const result = await generateImage(geminiPrompt, aspect_ratio)
```

**Step 3: Store aspect_ratio on the base_image row**

Change the insert on line 63 to include `aspect_ratio`:

```typescript
.insert({ filename, storage_path: storagePath, prompt, generation_prompt_id: genPromptId, aspect_ratio })
```

**Step 4: Deploy**

Run: `supabase functions deploy generate-image`

**Step 5: Commit**

```
git add supabase/functions/generate-image/index.ts
git commit -m "Accept and store aspect_ratio in generate-image Edge Function"
```

---

### Task 4: composite Edge Function — pass base image aspect_ratio to editImage

**Files:**
- Modify: `supabase/functions/composite/index.ts`

**Step 1: Read aspect_ratio from the base image**

After line 29 (`const ad = ads[0]`), the `ad.base_image` already has all columns including the new `aspect_ratio`. Extract it:

```typescript
const aspectRatio = ad.base_image.aspect_ratio || undefined
```

**Step 2: Pass aspect_ratio to editImage**

Change line 71:

```typescript
const result = await editImage(imgBuffer, mimeType, prompt, aspectRatio)
```

**Step 3: Deploy**

Run: `supabase functions deploy composite`

**Step 4: Commit**

```
git add supabase/functions/composite/index.ts
git commit -m "Pass base image aspect_ratio to editImage in composite"
```

---

### Task 5: Desktop SPA — aspect ratio dropdown + Image+Text mode

**Files:**
- Modify: `web-apps/desktop-spa/index.html`

**Step 1: Add aspect ratio dropdown to Generate tab**

In `renderGenerate()` (line 2356), after the type toggle HTML (line 2377), add an aspect ratio dropdown that is visible only when `generateType === 'image'`:

```javascript
// After the type toggle, before the prompt textarea
html += '<div class="generate-ratio-row" id="generate-ratio-row">'
  + '<label>Aspect Ratio</label>'
  + '<select id="generate-ratio-select">'
  + '<option value="4:5">Feed (4:5)</option>'
  + '<option value="9:16">Story / Reels (9:16)</option>'
  + '<option value="2:3">Grindr Interstitial (2:3)</option>'
  + '</select>'
  + '</div>';
```

Add CSS for `.generate-ratio-row`:

```css
.generate-ratio-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}

.generate-ratio-row label {
  font-size: 12px;
  font-weight: 600;
  color: var(--warm-gray);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.generate-ratio-row select {
  font-family: var(--font-body);
  font-size: 13px;
  padding: 4px 8px;
  border: 1px solid var(--light-gray);
  border-radius: var(--radius);
  background: #fff;
  color: var(--charcoal);
}
```

**Step 2: Add Image+Text mode toggle**

After the ratio dropdown, add a mode toggle (visible only when type is 'image'):

```javascript
html += '<div class="generate-mode-row" id="generate-mode-row">'
  + '<label>Mode</label>'
  + '<select id="generate-mode-select">'
  + '<option value="image-only">Image only</option>'
  + '<option value="image-text">Image + Text</option>'
  + '</select>'
  + '</div>';
```

**Step 3: Show caption selector when Image+Text mode is active**

When mode is `image-text`, show a list of available captions with checkboxes so the user can pick which text to bake in. Use the existing `STATE.captions` data. Build a `selectedBakeInCaptions` array.

**Step 4: Pass aspect_ratio to Edge Function**

In the generate button click handler (line 2450), add `aspect_ratio` to the body when `generateType === 'image'`:

```javascript
const body = {
  brief: $brief.value || '',
  prompt,
  segment_hint: segmentHint || undefined,
  aspect_ratio: generateType === 'image' ? $ratioSelect.value : undefined,
};
```

**Step 5: For Image+Text mode, append caption text to the prompt**

When mode is `image-text`, modify the prompt to include selected caption text before sending:

```javascript
if (generateMode === 'image-text' && selectedBakeInCaptions.length > 0) {
  // Remove the "do NOT include text" instruction and add captions instead
  body.include_text = selectedBakeInCaptions.map(c => ({
    text: c.text,
    role: c.role
  }));
}
```

The Edge Function will need to handle `include_text` — see Task 7.

**Step 6: Hide ratio/mode rows when type is 'caption'**

In the type toggle click handler, show/hide the ratio and mode rows:

```javascript
document.getElementById('generate-ratio-row').style.display =
  generateType === 'image' ? '' : 'none';
document.getElementById('generate-mode-row').style.display =
  generateType === 'image' ? '' : 'none';
```

**Step 7: Update image grid CSS to use natural aspect ratios**

Change the `.image-card img` rule (line 468) from `aspect-ratio: 1` to remove the forced square:

```css
.image-card img {
  width: 100%;
  display: block;
}
```

**Step 8: Add ratio filter to Images tab**

Add a small dropdown at the top of the images panel in `renderImages()`:

```javascript
let html = '<div style="display:flex;gap:8px;align-items:center;margin-bottom:12px">'
  + '<select id="image-ratio-filter" style="...">'
  + '<option value="all">All ratios</option>'
  + '<option value="4:5">Feed (4:5)</option>'
  + '<option value="9:16">Story (9:16)</option>'
  + '<option value="2:3">Grindr (2:3)</option>'
  + '<option value="1:1">Square (1:1)</option>'
  + '</select>'
  + '<span class="count">...</span>'
  + '</div>';
```

Filter `STATE.images` by `aspect_ratio` when rendering.

**Step 9: Commit**

```
git add web-apps/desktop-spa/index.html
git commit -m "Desktop SPA: aspect ratio dropdown, Image+Text mode, ratio filter"
```

---

### Task 6: Mobile SPA — aspect ratio dropdown + caption picker for Image+Text

**Files:**
- Modify: `web-apps/mobile-spa/index.html`

**Step 1: Add aspect ratio dropdown to Generate tab**

Add a dropdown above the prompt textarea (similar to desktop). Three options: Feed (4:5), Story/Reels (9:16), Grindr Interstitial (2:3). Only visible when `generateType === 'image'`.

**Step 2: Add Image+Text mode toggle**

Add a mode dropdown (Image only / Image + Text). Only visible when `generateType === 'image'`.

**Step 3: Caption picker for Image+Text mode**

When mode is `image-text`, show a scrollable list of existing captions (from `STATE.captions`) with tap-to-select. Selected captions are highlighted. Use the existing caption card styling.

**Step 4: Pass aspect_ratio and include_text to Edge Function**

In `handleGenerate()` (line 1888), add `aspect_ratio` and `include_text` to the request body:

```javascript
const body = {
  brief: briefText || undefined,
  prompt: promptText,
  segment_hint: segmentHint,
  aspect_ratio: generateType === 'image' ? $ratioSelect.value : undefined,
  include_text: generateMode === 'image-text' ? selectedCaptions : undefined,
};
```

**Step 5: Update image display to natural aspect ratio**

Change the `.library-image img` CSS from `aspect-ratio: 1` (line 889) to remove forced square.

**Step 6: Commit**

```
git add web-apps/mobile-spa/index.html
git commit -m "Mobile SPA: aspect ratio dropdown, Image+Text mode with caption picker"
```

---

### Task 7: generate-image Edge Function — handle include_text for baked-in mode

**Files:**
- Modify: `supabase/functions/generate-image/index.ts`

**Step 1: Accept include_text parameter**

```typescript
const { prompt, brief, segment_hint, aspect_ratio, include_text } = await req.json()
```

**Step 2: Modify prompt for baked-in text mode**

When `include_text` is provided (array of `{text, role}`), modify the Gemini prompt to include the text and remove the "do NOT include text" instruction:

```typescript
let geminiPrompt: string
if (include_text && include_text.length > 0) {
  const roleHints: Record<string, string> = {
    headline: 'large, bold, upper area',
    subline: 'medium, below headline',
    cta: 'button style, lower area, accent color',
    tagline: 'small, bottom edge',
  }
  const textLines = include_text.map((t: { text: string; role?: string }) => {
    const hint = t.role && roleHints[t.role] ? ` (${roleHints[t.role]})` : ''
    return `- ${(t.role || 'text').toUpperCase()}${hint}: "${t.text}"`
  }).join('\n')

  geminiPrompt = [
    brief ? `Context — creative brief:\n${brief}\n\n---\n\n` : '',
    segment_hint ? `Segment style hint: ${segment_hint}\n\n` : '',
    `Generate an ad image based on this request: ${prompt}\n\n`,
    'Make the image suitable for a social media ad (Instagram/Facebook).\n\n',
    `Include the following text overlays, integrated beautifully into the design:\n${textLines}\n`,
    'Make the text readable with appropriate contrast. Be creative with typography and placement.',
  ].join('')
} else {
  geminiPrompt = [
    brief ? `Context — creative brief:\n${brief}\n\n---\n\n` : '',
    segment_hint ? `Segment style hint: ${segment_hint}\n\n` : '',
    `Generate an ad image based on this request: ${prompt}\n\n`,
    'Make the image suitable for a social media ad (Instagram/Facebook). ',
    'Do NOT include any text, words, letters, captions, headlines, or watermarks in the image.',
  ].join('')
}
```

**Step 3: Deploy**

Run: `supabase functions deploy generate-image`

**Step 4: Commit**

```
git add supabase/functions/generate-image/index.ts
git commit -m "Support baked-in text mode in generate-image Edge Function"
```

---

### Task 8: Update loadData queries to include aspect_ratio

**Files:**
- Modify: `web-apps/desktop-spa/index.html`
- Modify: `web-apps/mobile-spa/index.html`

The `base_image` select already uses `*` so `aspect_ratio` is included automatically. No query changes needed.

**Step 1: Verify aspect_ratio is available in STATE.images**

Check the browser console after loading — each image in `STATE.images` should have an `aspect_ratio` field.

**Step 2: Commit (if any changes needed)**

This task may be a no-op since `select('*')` already includes all columns.

---

### Task 9: Deploy all Edge Functions and verify end-to-end

**Step 1: Deploy**

```bash
supabase functions deploy generate-image
supabase functions deploy composite
```

**Step 2: Test image generation with aspect ratio**

Use the desktop app Generate tab:
1. Select "Story / Reels (9:16)"
2. Enter a prompt and generate
3. Verify the image is tall (9:16) not square
4. Check the `base_image` row has `aspect_ratio = '9:16'`

**Step 3: Test compositing preserves ratio**

1. Create an ad from a 9:16 image with captions
2. Hit Generate/Re-generate
3. Verify the composited image is still 9:16

**Step 4: Test Image+Text mode**

1. Select "Image + Text" mode
2. Pick captions to bake in
3. Generate — verify text is part of the image

**Step 5: Commit any fixes**

---

## Implementation Order

1. Migration (schema)
2. Gemini module (shared dependency)
3. generate-image Edge Function (accepts ratio + include_text)
4. composite Edge Function (passes ratio)
5. Desktop SPA (ratio dropdown, Image+Text, ratio filter)
6. Mobile SPA (ratio dropdown, Image+Text with caption picker)
7. Deploy and verify end-to-end
