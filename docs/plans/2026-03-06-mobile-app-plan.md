# Mobile App Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a mobile-first content creation app for Come Join Us ad campaigns — generate images/captions and assemble ads from your phone.

**Architecture:** Single-file vanilla JS SPA (same pattern as desktop). All data via Supabase JS client. Generation via existing `generate` Edge Function (plus a new `suggest-captions` type). No build step, no framework.

**Tech Stack:** Vanilla JS, Supabase JS client (CDN), Supabase Edge Functions (Deno/TypeScript), Gemini API.

**Design doc:** `docs/plans/2026-03-06-mobile-app-design.md`

**Desktop spec (reference):** `docs/specs/desktop-app-spec.md`

---

## Context for the Implementer

This is a **single HTML file** SPA at `web-apps/mobile-spa/index.html`. All CSS is inlined in `<style>`, all JS is inlined in `<script>`. There is no build step, no test framework. Verification is manual: serve with `cd web-apps/mobile-spa && npx serve .` and check on your phone or in mobile dev tools.

The existing file has auth (magic link login) already working. You're building on top of that scaffold.

**Key reference:** The desktop app at `web-apps/desktop-spa/index.html` (2785 lines) uses the exact same Supabase config, auth, and data patterns. When in doubt about a query or data shape, check the desktop app.

**Visual design direction:** Fresh mobile aesthetic. NOT the same design tokens as desktop. Think native iOS app feel — clean, spacious, good typography. The implementer should use their design judgment. The design doc says "specific visual direction to be determined during implementation."

### Supabase Config (already in the file)

```javascript
const SUPABASE_URL = 'https://pqrhphvbyjqhntqjzljc.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_vJfmD1tuFO7X2tiKTmRe3Q_-Py5ObXh';
const storageBaseUrl = SUPABASE_URL + '/storage/v1/object/public/creative';
function db() { return supabaseClient.schema('marketing'); }
```

### Data Query Pattern (from desktop `loadData()`)

```javascript
async function loadData() {
  const [rawImages, rawCaptions, rawAds, rawSegments] = await Promise.all([
    db().from('base_image')
      .select('*, base_image_segment(segment_id, segment:segment_id(id, name)), generation_prompt:generation_prompt_id(id, type, prompt, created_at)')
      .order('created_at', { ascending: false }),
    db().from('caption')
      .select('*, caption_segment(segment_id, segment:segment_id(id, name)), generation_prompt:generation_prompt_id(id, type, prompt, created_at)')
      .order('created_at', { ascending: false }),
    db().from('ad')
      .select('*, base_image:base_image_id(*), ad_segment(segment_id, segment:segment_id(id, name)), ad_caption(caption_id, caption:caption_id(*))')
      .order('created_at', { ascending: false }),
    db().from('segment').select('*').order('name'),
  ]);
  // Flatten M2M joins — e.g.:
  // const images = (rawImages.data || []).map(row => {
  //   const segments = (row.base_image_segment || []).map(js => js.segment).filter(Boolean);
  //   const { base_image_segment, ...rest } = row;
  //   return { ...rest, segments };
  // });
}
```

Note: mobile app does NOT need body_copy, ad_sets, or tags. Keep queries lean.

### Generation Call Pattern

```javascript
const { data, error } = await supabaseClient.functions.invoke('generate', {
  body: { type, brief, prompt, segment_hint }
});
```

### Image URL Pattern

```javascript
const src = storageBaseUrl + '/' + image.storage_path;
// Composited images with cache-bust:
const cacheBust = ad.updated_at ? '?t=' + new Date(ad.updated_at).getTime() : '';
const src = storageBaseUrl + '/' + ad.composited_image_path + cacheBust;
```

### Segment Assignment Pattern

```javascript
// Assign image to segment:
await db().from('base_image_segment').insert({ base_image_id: id, segment_id: segmentId });
// Assign caption to segment:
await db().from('caption_segment').insert({ caption_id: id, segment_id: segmentId });
// Assign ad to segment:
await db().from('ad_segment').insert({ ad_id: id, segment_id: segmentId });
```

### Ad Creation Pattern

```javascript
const { data: ad, error } = await db().from('ad')
  .insert({ base_image_id: imageId })
  .select().single();
// Assign captions via join table:
for (const captionId of selectedCaptionIds) {
  await db().from('ad_caption').insert({ ad_id: ad.id, caption_id: captionId });
}
```

### Realtime Pattern

```javascript
supabaseClient
  .channel('marketing-changes')
  .on('postgres_changes', { event: '*', schema: 'marketing', table: 'ad' }, () => loadData())
  .subscribe();
```

---

## Task 1: App Shell — Bottom Tabs, Top Bar, Segment Picker, Data Loading

**Files:**
- Modify: `web-apps/mobile-spa/index.html`

**What to build:**

Replace the placeholder `<div class="main-content">` with the full app structure:

1. **Top bar** — redesign from the current desktop-style topbar. Should have:
   - Minimal brand mark (left)
   - Segment dropdown pill (center or right) — loads segments from DB, shows active segment name
   - "All" option in the dropdown (default)
   - Persist selected segment ID in `localStorage` key `mobile-active-segment`
   - Sign out button (small, subtle)

2. **Tab content area** — takes remaining vertical space between top bar and tab bar. Two panels:
   - `#tab-generate` (visible by default)
   - `#tab-library` (hidden by default)

3. **Bottom tab bar** — fixed at bottom, safe-area-aware (`padding-bottom: env(safe-area-inset-bottom)`):
   - Generate tab button (icon + label)
   - Library tab button (icon + label)
   - Active tab highlighted
   - Tab switching shows/hides the content panels

4. **Data loading** — on app init, call `loadData()` to fetch images, captions, ads, segments. Store in a `STATE` object. Filter helpers:
   - `filteredImages()` — filters by active segment (or all)
   - `filteredCaptions()` — same
   - `filteredAds()` — same

5. **Realtime** — subscribe to `ad` table changes, reload data on change.

**Step 1: Implement the HTML structure**

Add the top bar, tab content containers, and bottom tab bar HTML. Remove the existing placeholder `<div class="main-content">`.

**Step 2: Implement the CSS**

Fresh mobile aesthetic. Guidelines:
- Use system font stack for body: `-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`
- Choose a display font that works on mobile (could keep Playfair or try something else)
- Bottom tab bar: 56px height, glass-morphism or solid background, safe-area padding
- Top bar: 44-48px, segment dropdown prominent
- Content area: scrollable, full-bleed
- Design should feel like a native iOS app — clean, spacious, good use of whitespace

**Step 3: Implement the JavaScript**

- `STATE` object: `{ images: [], captions: [], ads: [], segments: [] }`
- `loadData()` — Promise.all query for 4 tables (images, captions, ads, segments), flatten M2M joins
- `setActiveSegment(id)` — update localStorage, re-render
- `filteredImages()`, `filteredCaptions()`, `filteredAds()` — filter STATE by active segment
- `switchTab(tabName)` — show/hide tab panels, update tab bar active state
- `connectRealtime()` — subscribe to ad table changes
- Wire segment dropdown to `setActiveSegment()`
- Wire tab buttons to `switchTab()`
- Call `loadData()` and `connectRealtime()` from `init()`

**Step 4: Verify**

```bash
cd web-apps/mobile-spa && npx serve .
```

Open in Chrome DevTools mobile view (iPhone 14 Pro size). Verify:
- Login works (magic link)
- Top bar shows with segment dropdown
- Segment dropdown populates with segments from DB
- Bottom tab bar visible with two tabs
- Tabs switch content areas
- No console errors

**Step 5: Commit**

```bash
git add web-apps/mobile-spa/index.html
git commit -m "Mobile app: app shell with tabs, segment picker, data loading"
```

---

## Task 2: Generate Tab — UI (Type Toggle, Prompt, Brief, Generate Button)

**Files:**
- Modify: `web-apps/mobile-spa/index.html`

**What to build:**

The Generate tab content, top to bottom:

1. **Type toggle** — two pill buttons: Image | Caption. Active state highlighted. Stores current type in variable.

2. **Segment prompt hint** — if active segment has a `prompt_hint`, show it as a subtle hint card below the toggle. Hide if no hint or "All" selected. Text comes from `STATE.segments.find(s => s.id === activeSegmentId)?.prompt_hint`.

3. **Creative brief** — collapsible section:
   - Header: "Creative Brief" with expand/collapse chevron
   - Collapsed by default
   - Content: textarea with the brief text
   - Load from Supabase Storage on first expand: `fetch(storageBaseUrl + '/creative-brief.md')`
   - Cache in localStorage key `mobile-generate-brief`
   - "Save" button to update Storage (use `supabaseClient.storage.from('creative').upload('creative-brief.md', blob, { upsert: true })`)

4. **Prompt textarea** — large, comfortable touch target. Placeholder text varies by type ("Describe the image you want..." / "Describe the captions you want..."). Persist per type in localStorage (`mobile-generate-prompt-image` / `mobile-generate-prompt-caption`).

5. **Generate button** — full-width, prominent. Disabled until prompt is non-empty. Text: "Generate Image" or "Generate Captions" based on type toggle.

6. **Results area** — empty div for now (`#generate-results`). Will be populated in Task 3.

**Step 1: Implement the HTML**

Add all elements inside `#tab-generate`.

**Step 2: Implement the CSS**

- Type toggle: pill-shaped buttons, smooth transition on active state
- Prompt hint: subtle card with segment colour or icon
- Brief section: collapsible with smooth height animation (or simple toggle)
- Textarea: minimum 3 lines, auto-grow on content, comfortable padding
- Generate button: bold, prominent, full-width. Clear disabled state.

**Step 3: Implement the JavaScript**

- `generateType` variable: `'image'` | `'caption'`
- Toggle buttons wire to set `generateType`, update button text, swap localStorage prompts
- Brief: lazy-load on first expand, save to Storage on button click
- Prompt: load/save localStorage per type
- Generate button: disabled state tied to prompt content
- `renderGenerateTab()` — called from `render()`, updates hint visibility based on active segment

**Step 4: Verify**

Serve and check in mobile dev tools:
- Type toggle switches between Image/Caption
- Prompt textarea persists text per type
- Creative brief expands/collapses, loads from Storage
- Segment prompt hint appears when a segment with a hint is selected
- Generate button enables/disables based on prompt content
- Generate button text changes with type toggle

**Step 5: Commit**

```bash
git add web-apps/mobile-spa/index.html
git commit -m "Mobile app: Generate tab UI with type toggle, prompt, brief"
```

---

## Task 3: Generate Tab — Wire Up Image + Caption Generation

**Files:**
- Modify: `web-apps/mobile-spa/index.html`

**What to build:**

Connect the Generate button to the Edge Function and display results.

### Image Generation Flow

1. User taps "Generate Image"
2. Button shows loading state ("Generating..." + disabled)
3. Call Edge Function:
   ```javascript
   const { data, error } = await supabaseClient.functions.invoke('generate', {
     body: {
       type: 'image',
       brief: briefText,
       prompt: promptText,
       segment_hint: activeSegmentHint || undefined
     }
   });
   ```
4. On success: `data.image` contains `{ id, filename, storage_path }`
5. Auto-assign to active segment if one is selected:
   ```javascript
   if (activeSegmentId) {
     await db().from('base_image_segment').insert({ base_image_id: data.image.id, segment_id: activeSegmentId });
   }
   ```
6. Show the generated image as a result card in `#generate-results`:
   - Image displayed at full width
   - Subtle card container
   - Image URL: `storageBaseUrl + '/' + data.image.storage_path`
7. Reload data (so Library tab updates)
8. Reset button state

### Caption Generation Flow

1. User taps "Generate Captions"
2. Button shows loading state
3. Call Edge Function with `type: 'caption'`
4. On success: `data.captions` contains array of `{ id, text, role }`
5. Auto-assign each to active segment
6. Show caption cards in `#generate-results`:
   - Each caption as a card with text and role badge
   - Role badge colour-coded (headline, subline, cta, tagline)
7. Reload data
8. Reset button state

### Error Handling

- If `error` or `data.error`: show error message in results area (red text)
- Clear previous results before showing new ones

**Step 1: Implement the generation handler**

```javascript
async function handleGenerate() {
  const prompt = $generatePrompt.value.trim();
  if (!prompt) return;
  // ... loading state, Edge Function call, result rendering
}
```

Wire to Generate button click.

**Step 2: Implement result rendering**

- `renderImageResult(image)` — image card with full-width display
- `renderCaptionResults(captions)` — list of caption cards with role badges

**Step 3: Implement segment auto-assignment**

After successful generation, insert join table rows for active segment.

**Step 4: Verify**

Serve and test (requires working Edge Function and Supabase connection):
- Generate an image: see it appear in results
- Generate captions: see them appear as cards
- Check Supabase dashboard: new rows created in base_image/caption tables
- Check segment assignment: join table rows created
- Error case: disconnect network, verify error message shows

**Step 5: Commit**

```bash
git add web-apps/mobile-spa/index.html
git commit -m "Mobile app: wire up image and caption generation"
```

---

## Task 4: Edge Function — Add `suggest-captions` Type

**Files:**
- Modify: `supabase/functions/generate/index.ts`

**What to build:**

Add a new handler for `type: 'suggest-captions'` to the existing generate Edge Function.

**Input:**
```json
{
  "type": "suggest-captions",
  "brief": "creative brief text",
  "segment_hint": "segment's prompt_hint",
  "image_prompt": "the prompt used to generate the image"
}
```

**Output:**
```json
{
  "suggestions": [
    { "text": "Wednesday nights used to look like this", "role": "headline" },
    { "text": "What if Wednesday had plans for you?", "role": "subline" },
    { "text": "Book your first dinner", "role": "cta" }
  ]
}
```

**Implementation:**

1. Add a new case in the type router (around line 30-40 in the Edge Function — look for the existing `if (type === 'image')` / `else if (type === 'caption')` / `else if (type === 'composite')` chain).

2. Create `handleSuggestCaptions(body)` function:
   ```typescript
   async function handleSuggestCaptions(body: any) {
     const { brief, segment_hint, image_prompt } = body;
     if (!image_prompt) return jsonResponse({ error: 'image_prompt is required' }, 400);

     const geminiPrompt = [
       brief ? `Context — creative brief:\n${brief}\n\n---\n\n` : '',
       segment_hint ? `Segment style hint: ${segment_hint}\n\n` : '',
       `An ad image was generated with this prompt: "${image_prompt}"\n\n`,
       `Generate 4 short ad caption suggestions for this image. Return a JSON array of objects with "text" and "role" fields.\n`,
       `Roles should be: 1 headline (punchy, 5-8 words), 1 subline (supporting, 8-12 words), 1 cta (call to action, 3-5 words), 1 tagline (brand voice, 5-8 words).\n`,
       `Keep copy warm, honest, direct. Not corporate. Not cringey.\n`,
       `Return ONLY the JSON array, no other text.`
     ].join('');

     const geminiOutput = await generateCaptions(geminiPrompt);  // Uses existing shared module

     // Parse JSON response
     let suggestions;
     try {
       const jsonMatch = geminiOutput.match(/\[[\s\S]*\]/);
       suggestions = JSON.parse(jsonMatch[0]);
     } catch {
       return jsonResponse({ error: 'Failed to parse caption suggestions' }, 500);
     }

     return jsonResponse({ suggestions });
   }
   ```

3. Key difference from `handleCaptionGeneration`: this does NOT save to the database. No `upsertGenerationPrompt`, no caption inserts. Just returns suggestions.

**Step 1: Read the current Edge Function**

Read `supabase/functions/generate/index.ts` to understand the exact routing structure and where to add the new type.

**Step 2: Add the type handler**

Add `else if (type === 'suggest-captions')` to the router, and the `handleSuggestCaptions` function.

**Step 3: Deploy**

```bash
supabase functions deploy generate
```

**Step 4: Verify**

Test via curl:
```bash
curl -X POST 'https://pqrhphvbyjqhntqjzljc.supabase.co/functions/v1/generate' \
  -H 'Authorization: Bearer <access_token>' \
  -H 'Content-Type: application/json' \
  -d '{"type": "suggest-captions", "brief": "Come Join Us matches groups of 6 strangers for dinner.", "image_prompt": "A woman eating alone in her apartment on a Wednesday night"}'
```

Should return `{ suggestions: [...] }` with 4 caption objects.

**Step 5: Commit**

```bash
git add supabase/functions/generate/index.ts
git commit -m "Edge Function: add suggest-captions type for mobile app"
```

---

## Task 5: Generate Tab — Caption Suggestions After Image Generation

**Files:**
- Modify: `web-apps/mobile-spa/index.html`

**What to build:**

After an image is generated, automatically fire a second request for caption suggestions and display them as ephemeral cards.

**Flow:**

1. Image generation succeeds → image card is rendered
2. Immediately fire suggest-captions call:
   ```javascript
   const { data: suggestData } = await supabaseClient.functions.invoke('generate', {
     body: {
       type: 'suggest-captions',
       brief: briefText,
       segment_hint: activeSegmentHint || undefined,
       image_prompt: promptText
     }
   });
   ```
3. Show suggestions below the image card:
   - Each suggestion as a card with text, role badge, and a "Keep" button
   - Visually distinct from saved captions (dashed border, lighter styling, or "Suggestion" label)
4. "Keep" button on each suggestion:
   - Saves to `caption` table: `await db().from('caption').insert({ text, role }).select().single()`
   - Auto-assigns to active segment
   - Card transitions to "Saved" state (solid style, checkmark)
   - Reload data
5. Suggestions that aren't kept disappear when:
   - User generates again (results area cleared)
   - User navigates to Library tab

**Step 1: Modify the image generation handler**

After successful image generation, chain the suggest-captions call. Show a "Suggesting captions..." loading state below the image.

**Step 2: Implement suggestion rendering**

`renderCaptionSuggestions(suggestions)` — renders ephemeral cards with Keep buttons.

**Step 3: Implement the Keep action**

`keepSuggestion(text, role)` — inserts caption, assigns segment, updates card state.

**Step 4: Verify**

Generate an image in the mobile app:
- Image appears
- After a moment, 3-4 caption suggestions appear below
- Tap "Keep" on one → it saves (check Supabase dashboard)
- Generate again → old suggestions disappear, new ones appear

**Step 5: Commit**

```bash
git add web-apps/mobile-spa/index.html
git commit -m "Mobile app: caption suggestions after image generation"
```

---

## Task 6: Library Tab — Images Grid (Camera-Roll Style)

**Files:**
- Modify: `web-apps/mobile-spa/index.html`

**What to build:**

The Library tab with a camera-roll style photo grid for images.

1. **Sub-toggle at top:** Images | Ads — pill toggle, defaults to Images. Stores in variable.

2. **Images grid:**
   - 3 columns, square thumbnails, small gap (2-3px like Photos app)
   - `filteredImages()` provides the data
   - Each cell: `<img>` with `object-fit: cover`, aspect-ratio 1:1
   - Lazy loading: `loading="lazy"`
   - Images grouped by `generation_prompt` — subtle divider with prompt text (truncated) between groups. Ungrouped images at the top or bottom.
   - Most recent first (already sorted by `created_at` desc from query)
   - Tap image → opens fullscreen viewer (Task 7)

3. **Empty state:** "No images yet. Head to Generate to create some." if filtered list is empty.

**CSS:**
```css
.image-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 2px;
}
.image-grid img {
  width: 100%;
  aspect-ratio: 1;
  object-fit: cover;
  display: block;
}
```

**Step 1: Implement the Library tab HTML structure**

Sub-toggle + grid container + empty state inside `#tab-library`.

**Step 2: Implement the CSS**

Photo grid, toggle pills, group dividers.

**Step 3: Implement the rendering**

`renderLibrary()` — called from `render()`. Checks sub-toggle state, renders Images or Ads grid. For images:
- Group by `generation_prompt_id`
- Render dividers between groups
- Render image cells with click handlers

**Step 4: Verify**

Serve and check:
- Library tab shows Images grid
- Images appear in 3-column grid, square thumbnails
- Segment filter works (switch segment, grid updates)
- Images grouped by generation prompt
- Empty state shows when no images match filter

**Step 5: Commit**

```bash
git add web-apps/mobile-spa/index.html
git commit -m "Mobile app: Library tab with camera-roll image grid"
```

---

## Task 7: Library Tab — Fullscreen Image Viewer with Swipe

**Files:**
- Modify: `web-apps/mobile-spa/index.html`

**What to build:**

Tap an image in the grid → fullscreen overlay with swipe navigation.

1. **Fullscreen overlay:**
   - Fixed position, covers entire viewport (including safe areas)
   - Black/dark background
   - Image displayed at full width, centred vertically
   - Close button (X) top-right
   - "Build Ad" button at bottom

2. **Swipe navigation:**
   - Touch-based: track `touchstart`, `touchmove`, `touchend`
   - Swipe left → next image, swipe right → previous image
   - Threshold: ~50px horizontal movement
   - Smooth transition between images (CSS transform + transition)
   - Wraps around (last → first, first → last)
   - Uses `filteredImages()` as the image set — swipe order matches grid order

3. **Image counter:** "3 of 24" indicator, subtle, top-centre

4. **"Build Ad" button:** prominent button at bottom of fullscreen view. Tapping it opens the ad builder (Task 8). Store the current image ID for the builder.

**Implementation approach for swipe:**

```javascript
let touchStartX = 0;
let touchDeltaX = 0;

viewer.addEventListener('touchstart', e => {
  touchStartX = e.touches[0].clientX;
});
viewer.addEventListener('touchmove', e => {
  touchDeltaX = e.touches[0].clientX - touchStartX;
  // Optional: translate image with finger for visual feedback
});
viewer.addEventListener('touchend', () => {
  if (touchDeltaX > 50) showPrevImage();
  else if (touchDeltaX < -50) showNextImage();
  touchDeltaX = 0;
});
```

**Step 1: Implement the fullscreen overlay HTML**

Overlay div with image container, close button, image counter, Build Ad button.

**Step 2: Implement the CSS**

Fullscreen overlay, image sizing, transition animations, button positioning.

**Step 3: Implement the JavaScript**

- `openViewer(imageId)` — show overlay, set current image, render
- `closeViewer()` — hide overlay
- `showNextImage()` / `showPrevImage()` — navigate within filtered set
- Touch event handlers for swipe
- Wire grid cells to `openViewer()`
- Wire close button and Build Ad button

**Step 4: Verify**

- Tap image in grid → fullscreen overlay opens
- Image displays centred on dark background
- Swipe left/right → navigates between images
- Counter updates ("3 of 24")
- Close button dismisses overlay
- "Build Ad" button is visible and tappable

**Step 5: Commit**

```bash
git add web-apps/mobile-spa/index.html
git commit -m "Mobile app: fullscreen image viewer with swipe navigation"
```

---

## Task 8: Ad Builder — Bottom Sheet with Caption Picker and Ad Creation

**Files:**
- Modify: `web-apps/mobile-spa/index.html`

**What to build:**

Bottom sheet that slides up from the fullscreen image viewer, allowing caption selection and ad creation.

1. **Bottom sheet:**
   - Slides up from bottom, covers ~60-70% of screen
   - Drag handle at top (small pill shape)
   - Can be dismissed by tapping outside or swiping down
   - Semi-transparent backdrop behind it

2. **Content:**
   - Small image preview at top (the selected base image, thumbnail size)
   - **Caption list:** `filteredCaptions()` grouped by role:
     - Headline section
     - Subline section
     - CTA section
     - Tagline section
   - Each caption is a tappable card — tap to select (checkmark + highlight), tap again to deselect
   - Multiple captions can be selected (one per role, or multiple)
   - Empty state per role if no captions: "No headlines yet"

3. **Adaptive action button (fixed at bottom of sheet):**
   - No captions selected: **"Use as Ad"** — creates ad with base image only, sets `composited_image_path` to the base image's `storage_path`
   - Captions selected: **"Generate Ad"** — creates ad with captions, triggers compositing

4. **Ad creation flow:**

   **"Use as Ad" path:**
   ```javascript
   const { data: ad } = await db().from('ad')
     .insert({ base_image_id: imageId, composited_image_path: image.storage_path })
     .select().single();
   if (activeSegmentId) {
     await db().from('ad_segment').insert({ ad_id: ad.id, segment_id: activeSegmentId });
   }
   ```

   **"Generate Ad" path:**
   ```javascript
   const { data: ad } = await db().from('ad')
     .insert({ base_image_id: imageId })
     .select().single();
   for (const captionId of selectedCaptionIds) {
     await db().from('ad_caption').insert({ ad_id: ad.id, caption_id: captionId });
   }
   if (activeSegmentId) {
     await db().from('ad_segment').insert({ ad_id: ad.id, segment_id: activeSegmentId });
   }
   // Trigger compositing:
   await supabaseClient.functions.invoke('generate', {
     body: { type: 'composite', adId: ad.id }
   });
   ```

5. **After creation:**
   - Close bottom sheet
   - Close fullscreen viewer
   - Switch Library sub-toggle to "Ads"
   - Reload data (new ad appears in grid)
   - Brief success toast/message

**Step 1: Implement the bottom sheet HTML**

Sheet container with drag handle, image preview, caption sections, action button.

**Step 2: Implement the CSS**

- Sheet: `position: fixed; bottom: 0;`, `border-radius: 16px 16px 0 0`, background blur/solid
- Slide-up animation: `transform: translateY(100%)` → `translateY(0)`
- Backdrop: semi-transparent overlay
- Caption cards: tappable, selected state with checkmark
- Action button: fixed within sheet, full-width

**Step 3: Implement the JavaScript**

- `openAdBuilder(imageId)` — show sheet, render captions, set initial state
- `closeAdBuilder()` — hide sheet, clear selection
- Caption tap handlers: toggle selection, update button text
- `createAd()` — handle both paths based on selection
- Wire "Build Ad" button in fullscreen viewer to `openAdBuilder()`

**Step 4: Verify**

- From fullscreen viewer, tap "Build Ad" → sheet slides up
- Image preview visible at top
- Captions listed by role
- Tap to select/deselect (visual feedback)
- Button text changes: "Use as Ad" ↔ "Generate Ad"
- Create an ad with no captions → check Supabase: ad row with `composited_image_path` = base image path
- Create an ad with captions → check Supabase: ad row + ad_caption rows + compositing triggered
- Sheet closes, Library switches to Ads view

**Step 5: Commit**

```bash
git add web-apps/mobile-spa/index.html
git commit -m "Mobile app: ad builder bottom sheet with caption picker"
```

---

## Task 9: Library Tab — Ads Grid with Fullscreen and Regenerate

**Files:**
- Modify: `web-apps/mobile-spa/index.html`

**What to build:**

The Ads sub-view in the Library tab, mirroring the Images view but for composited ads.

1. **Ads grid:**
   - Same 3-column layout as images
   - Shows `composited_image_path` if available, else base image
   - Cache-busted URLs: `storageBaseUrl + '/' + ad.composited_image_path + '?t=' + new Date(ad.updated_at).getTime()`
   - Filtered by active segment
   - Most recent first

2. **Tap ad → Fullscreen view:**
   - Same overlay pattern as image viewer
   - Swipe left/right to browse ads
   - Shows composited image (or base image if not composited yet)

3. **"Regenerate" button:**
   - Shown in fullscreen ad view (instead of "Build Ad")
   - Tapping triggers: `supabaseClient.functions.invoke('generate', { body: { type: 'composite', adId: ad.id } })`
   - Shows loading state
   - On success: realtime subscription fires → data reloads → image updates (cache-busted)

4. **Empty state:** "No ads yet. Open an image and tap Build Ad to create one."

**Step 1: Implement the Ads grid rendering**

Extend `renderLibrary()` to handle the Ads sub-toggle. Render ad grid with composited images.

**Step 2: Implement fullscreen ad viewer**

Reuse the fullscreen overlay from Task 7 but with ad-specific content (Regenerate button instead of Build Ad, shows composited image).

**Step 3: Wire up Regenerate**

Button click → Edge Function call → loading state → realtime update refreshes image.

**Step 4: Verify**

- Switch to Ads view in Library
- Ads from previous task visible in grid
- Tap ad → fullscreen with composited image
- Swipe between ads
- Tap Regenerate → loading state → image updates after compositing

**Step 5: Commit**

```bash
git add web-apps/mobile-spa/index.html
git commit -m "Mobile app: Ads grid with fullscreen viewer and regenerate"
```

---

## Summary

| Task | What | Files |
|------|------|-------|
| 1 | App shell — tabs, segment picker, data loading | `index.html` |
| 2 | Generate tab — type toggle, prompt, brief UI | `index.html` |
| 3 | Generate tab — wire up image + caption generation | `index.html` |
| 4 | Edge Function — suggest-captions type | `generate/index.ts` |
| 5 | Generate tab — caption suggestions after image gen | `index.html` |
| 6 | Library tab — camera-roll image grid | `index.html` |
| 7 | Library tab — fullscreen viewer with swipe | `index.html` |
| 8 | Ad builder — bottom sheet, caption picker, create ad | `index.html` |
| 9 | Library tab — Ads grid, fullscreen, regenerate | `index.html` |

Tasks 1-3 give you a working Generate experience. Task 4 deploys the Edge Function change. Task 5 adds caption suggestions. Tasks 6-9 build the Library and ad assembly flow.

Task 4 (Edge Function) has no frontend dependency and can be done in parallel with Tasks 1-3 if desired.
