# Image Editing & Ad Builder Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add base image editing and a full-screen ad builder with creative direction to the Creative SPA.

**Architecture:** New `edit-image` edge function wraps the existing `editImage()` gemini helper. The Creative SPA's bottom-sheet ad builder becomes a full-screen builder with caption pickers, creative direction textarea, and a preview/accept loop. The ad viewer becomes view-only (no Regenerate).

**Tech Stack:** Supabase Edge Functions (Deno), Gemini `editImage()`, vanilla JS SPA

---

### Task 1: Create `edit-image` Edge Function

**Files:**
- Create: `supabase/functions/edit-image/index.ts`

**Step 1: Create the edge function**

Model it on `generate-image/index.ts` but simpler — no `include_text`, no brief, no `generation_prompt` table.

```typescript
import { corsHeaders } from '../_shared/cors.ts'
import { createUserClient, createServiceClient } from '../_shared/supabase.ts'
import { editImage } from '../_shared/gemini.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const userClient = createUserClient(req)
    const { data: { user }, error: authError } = await userClient.auth.getUser()
    if (authError || !user) {
      return jsonResponse({ error: 'Unauthorized' }, 401)
    }

    const { base_image_id, prompt } = await req.json()
    if (!base_image_id) return jsonResponse({ error: 'base_image_id is required' }, 400)
    if (!prompt) return jsonResponse({ error: 'prompt is required' }, 400)

    // 1. Fetch source image metadata
    const { data: sourceImage, error: fetchError } = await userClient
      .from('base_image')
      .select('*')
      .eq('id', base_image_id)
      .single()

    if (fetchError || !sourceImage) {
      return jsonResponse({ error: 'Source image not found' }, 404)
    }

    // 2. Download original from Storage
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const imgUrl = `${supabaseUrl}/storage/v1/object/public/creative/${sourceImage.storage_path}`
    const imgResponse = await fetch(imgUrl)
    if (!imgResponse.ok) {
      return jsonResponse({ error: `Failed to download source image: ${imgResponse.status}` }, 502)
    }
    const imgBuffer = new Uint8Array(await imgResponse.arrayBuffer())
    const ext = (sourceImage.storage_path as string).split('.').pop() || 'png'
    const mimeType = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : 'image/png'

    // 3. Call Gemini editImage
    console.log(`[edit-image] Editing ${base_image_id}: calling Gemini...`)
    let editedData: Uint8Array
    try {
      const result = await editImage(imgBuffer, mimeType, prompt, sourceImage.aspect_ratio || undefined)
      editedData = result.data
    } catch (err) {
      console.error('[edit-image] Gemini failed:', (err as Error).message)
      return jsonResponse({ error: 'Image editing failed: ' + (err as Error).message }, 500)
    }

    // 4. Upload to Storage
    const serviceClient = createServiceClient()
    const timestamp = Date.now()
    const storagePath = `generated/${timestamp}.png`
    const filename = `edited-${timestamp}.png`

    const { error: uploadError } = await serviceClient.storage
      .from('creative')
      .upload(storagePath, editedData, {
        contentType: 'image/png',
        upsert: true,
      })

    if (uploadError) {
      return jsonResponse({ error: 'Failed to upload edited image: ' + uploadError.message }, 500)
    }

    // 5. Create new base_image row
    const { data: newImage, error: insertError } = await userClient
      .from('base_image')
      .insert({
        filename,
        storage_path: storagePath,
        prompt,
        aspect_ratio: sourceImage.aspect_ratio,
      })
      .select()
      .single()

    if (insertError) {
      return jsonResponse({ error: 'Failed to create image row: ' + insertError.message }, 500)
    }

    console.log(`[edit-image] Created: ${newImage.id} from ${base_image_id}`)
    return jsonResponse({ image: newImage })
  } catch (err) {
    console.error('edit-image error:', err)
    return jsonResponse({ error: (err as Error).message }, 500)
  }
})

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
```

**Step 2: Deploy and test**

Run: `supabase functions deploy edit-image`

Test with curl or from the browser console:
```javascript
const { data, error } = await supabaseClient.functions.invoke('edit-image', {
  body: { base_image_id: '<some-id>', prompt: 'make the colours warmer' }
});
console.log(data, error);
```

**Step 3: Commit**

```
feat: add edit-image edge function
```

---

### Task 2: Add Edit button + inline prompt to image viewer

**Files:**
- Modify: `web-apps/creative-spa/index.html`

**Step 1: Add HTML for Edit button and inline edit input**

In the `#image-viewer` div (line ~1768), add an Edit button next to the Build Ad button, and an initially-hidden inline edit form:

```html
<!-- Replace the single Build Ad button with a button row + edit form -->
<div class="viewer-actions">
  <button class="viewer-action-btn" id="viewer-edit-btn">Edit</button>
  <button class="viewer-action-btn viewer-action-primary" id="viewer-build-btn">Build Ad</button>
</div>
<div class="viewer-edit-form hidden" id="viewer-edit-form">
  <input type="text" id="viewer-edit-input" placeholder="e.g. remove the tree, warmer colours..." />
  <button id="viewer-edit-submit">Edit</button>
</div>
```

Remove the old standalone `<button class="viewer-build-btn" id="viewer-build-btn">Build Ad</button>`.

**Step 2: Add CSS for the viewer actions row and edit form**

Add after the existing `.viewer-build-btn` styles (line ~1322). Replace `.viewer-build-btn` with:

```css
.viewer-actions {
  position: absolute;
  bottom: calc(var(--safe-bottom) + 16px);
  left: 16px;
  right: 16px;
  display: flex;
  gap: 10px;
  z-index: 10;
}
.viewer-action-btn {
  flex: 1;
  padding: 16px;
  border: 2px solid rgba(255,255,255,0.3);
  border-radius: var(--radius);
  font-family: var(--font-body);
  font-size: 17px;
  font-weight: 600;
  cursor: pointer;
  -webkit-appearance: none;
  background: rgba(0,0,0,0.5);
  color: #fff;
}
.viewer-action-primary {
  background: var(--accent);
  border-color: var(--accent);
}
.viewer-edit-form {
  position: absolute;
  bottom: calc(var(--safe-bottom) + 16px);
  left: 16px;
  right: 16px;
  display: flex;
  gap: 8px;
  z-index: 10;
}
.viewer-edit-form input {
  flex: 1;
  padding: 14px 12px;
  border: 1px solid rgba(255,255,255,0.3);
  border-radius: var(--radius);
  background: rgba(0,0,0,0.6);
  color: #fff;
  font-size: 15px;
  font-family: var(--font-body);
}
.viewer-edit-form input::placeholder { color: rgba(255,255,255,0.5); }
.viewer-edit-form button {
  padding: 14px 20px;
  background: var(--accent);
  color: #fff;
  border: none;
  border-radius: var(--radius);
  font-size: 15px;
  font-weight: 600;
  font-family: var(--font-body);
  cursor: pointer;
}
```

**Step 3: Add DOM refs and JS**

Add DOM refs near the existing viewer refs (line ~1896):

```javascript
const $viewerEditBtn = document.getElementById('viewer-edit-btn');
const $viewerEditForm = document.getElementById('viewer-edit-form');
const $viewerEditInput = document.getElementById('viewer-edit-input');
const $viewerEditSubmit = document.getElementById('viewer-edit-submit');
const $viewerActions = document.querySelector('.viewer-actions');
```

Add state variable near other viewer state (line ~1933):

```javascript
let viewerEditing = false;
```

Edit button toggles the inline form:

```javascript
$viewerEditBtn.addEventListener('click', () => {
  viewerEditing = !viewerEditing;
  if (viewerEditing) {
    hide($viewerActions);
    show($viewerEditForm);
    $viewerEditInput.focus();
  } else {
    show($viewerActions);
    hide($viewerEditForm);
  }
});
```

Submit handler calls the edge function:

```javascript
$viewerEditSubmit.addEventListener('click', async () => {
  const editPrompt = $viewerEditInput.value.trim();
  if (!editPrompt) return;

  const images = filteredImages();
  if (viewerImageIndex < 0 || viewerImageIndex >= images.length) return;
  const sourceImage = images[viewerImageIndex];

  $viewerEditSubmit.disabled = true;
  $viewerEditSubmit.textContent = 'Editing...';

  try {
    const { data, error } = await supabaseClient.functions.invoke('edit-image', {
      body: { base_image_id: sourceImage.id, prompt: editPrompt }
    });
    const errMsg = fnError(error, data);
    if (errMsg) throw new Error(errMsg);

    // Reload data so the new image appears
    await loadData();

    // Navigate to the new image in the viewer
    const updatedImages = filteredImages();
    const newIdx = updatedImages.findIndex(img => img.id === data.image.id);
    if (newIdx !== -1) {
      viewerImageIndex = newIdx;
      updateViewerImage();
    }

    // Reset edit form
    $viewerEditInput.value = '';
    viewerEditing = false;
    hide($viewerEditForm);
    show($viewerActions);
  } catch (err) {
    console.error('Edit image failed:', err);
    $viewerEditSubmit.textContent = 'Failed — Tap to retry';
  } finally {
    $viewerEditSubmit.disabled = false;
    $viewerEditSubmit.textContent = 'Edit';
  }
});
```

Reset edit form state when closing viewer or navigating — in `closeViewer()`:

```javascript
viewerEditing = false;
hide($viewerEditForm);
show($viewerActions);
$viewerEditInput.value = '';
```

**Step 4: Test**

1. Open Creative SPA, go to Library > Images
2. Tap an image → viewer shows "Edit" and "Build Ad" buttons
3. Tap "Edit" → inline input appears
4. Type "make it warmer", tap Edit → loading state → new image appears
5. Original image still in library

**Step 5: Commit**

```
feat: add image edit button + inline prompt to Creative SPA viewer
```

---

### Task 3: Replace bottom sheet ad builder with full-screen builder

**Files:**
- Modify: `web-apps/creative-spa/index.html`

This is the biggest task. The current bottom sheet (`#ad-builder`) becomes a full-screen view with:
- Base image preview
- Caption pickers (reuse existing `renderBuilderContent()` logic)
- Creative direction textarea
- Generate button
- After generation: preview mode with Accept/Regenerate

**Step 1: Replace builder HTML**

Replace the current bottom sheet HTML (lines ~1787-1795) with:

```html
<!-- Full-screen Ad Builder -->
<div id="ad-builder" class="ad-builder-screen hidden">
  <div class="ad-builder-header">
    <button id="builder-close" class="ad-builder-close">&times;</button>
    <span class="ad-builder-title">Build Ad</span>
  </div>
  <div class="ad-builder-body" id="builder-body">
    <!-- Dynamically rendered: image preview, caption pickers, creative direction -->
  </div>
  <div class="ad-builder-footer">
    <button id="builder-action-btn" class="builder-action-btn">Generate Ad</button>
  </div>
</div>
```

Remove the `#ad-builder-backdrop` div — not needed for full-screen.

**Step 2: Replace builder CSS**

Remove `.builder-backdrop`, `.builder-sheet`, `.builder-handle` styles. Add:

```css
.ad-builder-screen {
  position: fixed;
  inset: 0;
  z-index: 220;
  background: var(--bg);
  display: flex;
  flex-direction: column;
}
.ad-builder-header {
  display: flex;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
}
.ad-builder-close {
  width: 36px;
  height: 36px;
  border: none;
  background: none;
  font-size: 24px;
  color: var(--text-primary);
  cursor: pointer;
}
.ad-builder-title {
  flex: 1;
  text-align: center;
  font-size: 17px;
  font-weight: 600;
  color: var(--text-primary);
  margin-right: 36px; /* balance close button */
}
.ad-builder-body {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  -webkit-overflow-scrolling: touch;
}
.builder-preview-img {
  width: 100%;
  max-height: 280px;
  object-fit: contain;
  border-radius: var(--radius);
  margin-bottom: 16px;
}
.builder-section-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin: 16px 0 8px;
}
.builder-direction-textarea {
  width: 100%;
  min-height: 80px;
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
  color: var(--text-primary);
  font-size: 14px;
  font-family: var(--font-body);
  resize: vertical;
  box-sizing: border-box;
}
.builder-direction-textarea::placeholder { color: var(--text-tertiary); }
```

Keep existing `.builder-caption-card`, `.builder-caption-check`, `.builder-action-btn` styles — they work for both layouts.

**Step 3: Update DOM refs**

Replace old refs (line ~1905-1910):

```javascript
const $adBuilder = document.getElementById('ad-builder');
const $builderClose = document.getElementById('builder-close');
const $builderBody = document.getElementById('builder-body');
const $builderActionBtn = document.getElementById('builder-action-btn');
```

Remove `$builderBackdrop`, `$builderSheet`, `$builderContent` refs.

**Step 4: Rewrite `openAdBuilder()` / `closeAdBuilder()`**

```javascript
function openAdBuilder() {
  if (!builderImageId) return;
  selectedCaptionIds = [];
  builderCreating = false;
  builderPreviewMode = false;
  renderBuilderContent();
  updateBuilderActionBtn();
  show($adBuilder);
  document.body.style.overflow = 'hidden';
}

function closeAdBuilder() {
  hide($adBuilder);
  document.body.style.overflow = '';
  selectedCaptionIds = [];
  builderImageId = null;
  builderPreviewMode = false;
  $builderBody.innerHTML = '';
}
```

Wire close button: `$builderClose.addEventListener('click', closeAdBuilder);`

**Step 5: Add creative direction to `renderBuilderContent()`**

After the caption picker sections, add:

```javascript
html += '<div class="builder-section-label">Creative Direction</div>';
html += '<textarea class="builder-direction-textarea" id="builder-direction" '
  + 'placeholder="e.g. white text, bottom third, minimal overlay..."></textarea>';
```

**Step 6: Add preview mode state + flow**

Add state variable:

```javascript
let builderPreviewMode = false;
```

Rewrite `handleCreateAd()` to support two phases:

1. **Generate phase**: Create ad row, attach captions, save creative direction to `ad.feedback`, call composite, show preview
2. **Accept phase**: Close builder, navigate to ads library

```javascript
async function handleCreateAd() {
  if (builderCreating || !builderImageId) return;

  // If in preview mode, "Accept" = close and go to ads
  if (builderPreviewMode) {
    closeAdBuilder();
    closeViewer();
    switchTab('library');
    switchLibraryView('ads');
    await loadData();
    showBuilderToast('Ad created');
    return;
  }

  builderCreating = true;
  $builderActionBtn.disabled = true;
  $builderActionBtn.textContent = 'Generating...';
  $builderActionBtn.classList.add('loading');

  const image = STATE.images.find(img => img.id === builderImageId);
  if (!image) {
    builderCreating = false;
    $builderActionBtn.disabled = false;
    $builderActionBtn.classList.remove('loading');
    return;
  }

  const directionEl = document.getElementById('builder-direction');
  const creativeDirection = directionEl ? directionEl.value.trim() : '';

  try {
    if (selectedCaptionIds.length === 0) {
      // "Use as Ad" — no captions, no compositing
      const insertData = { base_image_id: builderImageId, composited_image_path: image.storage_path };
      if (creativeDirection) insertData.feedback = creativeDirection;
      const { data: ad, error } = await db().from('ad')
        .insert(insertData).select().single();
      if (error) throw error;

      if (activeSegmentId) {
        await db().from('ad_segment').insert({ ad_id: ad.id, segment_id: activeSegmentId });
      }

      // No preview needed — go straight to accept
      closeAdBuilder();
      closeViewer();
      switchTab('library');
      switchLibraryView('ads');
      await loadData();
      showBuilderToast('Ad created');
      return;
    }

    // "Generate Ad" — with captions, trigger compositing
    // If regenerating (preview mode was true previously), delete the old ad first? No — just re-composite.
    let adId = builderPreviewAdId;

    if (!adId) {
      // First generation — create the ad row
      const insertData = { base_image_id: builderImageId };
      if (creativeDirection) insertData.feedback = creativeDirection;
      const { data: ad, error } = await db().from('ad')
        .insert(insertData).select().single();
      if (error) throw error;
      adId = ad.id;
      builderPreviewAdId = adId;

      // Attach captions
      for (const captionId of selectedCaptionIds) {
        await db().from('ad_caption').insert({ ad_id: adId, caption_id: captionId });
      }

      if (activeSegmentId) {
        await db().from('ad_segment').insert({ ad_id: adId, segment_id: activeSegmentId });
      }
    } else {
      // Regenerating — update creative direction
      if (creativeDirection !== undefined) {
        await db().from('ad').update({ feedback: creativeDirection }).eq('id', adId);
      }
    }

    // Trigger compositing
    const { data: compData, error: compError } = await supabaseClient.functions.invoke('composite', {
      body: { adId }
    });
    const compErrMsg = fnError(compError, compData);
    if (compErrMsg) throw new Error(compErrMsg);

    // Show preview
    await loadData();
    builderPreviewMode = true;
    renderBuilderPreview(compData.composited_image_url || (storageBaseUrl + '/' + compData.composited_image_path));

  } catch (err) {
    console.error('handleCreateAd failed:', err);
    $builderActionBtn.textContent = 'Failed — Tap to retry';
    $builderActionBtn.disabled = false;
    $builderActionBtn.classList.remove('loading');
    builderCreating = false;
    return;
  }

  builderCreating = false;
  $builderActionBtn.disabled = false;
  $builderActionBtn.classList.remove('loading');
  updateBuilderActionBtn();
}
```

Add state: `let builderPreviewAdId = null;` (reset in `openAdBuilder()` and `closeAdBuilder()`)

**Step 7: Add `renderBuilderPreview()`**

Shows the composited image with Accept and Regenerate options:

```javascript
function renderBuilderPreview(imageUrl) {
  $builderBody.innerHTML = '<img class="builder-preview-img" src="' + escapeHtml(imageUrl) + '?t=' + Date.now() + '" />'
    + '<div class="builder-section-label">Creative Direction</div>'
    + '<textarea class="builder-direction-textarea" id="builder-direction" '
    + 'placeholder="e.g. white text, bottom third, minimal overlay...">'
    + escapeHtml(document.getElementById('builder-direction')?.value || '')
    + '</textarea>';
}
```

**Step 8: Update `updateBuilderActionBtn()`**

```javascript
function updateBuilderActionBtn() {
  if (builderPreviewMode) {
    $builderActionBtn.textContent = 'Accept';
    // Also show a Regenerate link/button above
  } else if (selectedCaptionIds.length > 0) {
    $builderActionBtn.textContent = 'Generate Ad (' + selectedCaptionIds.length + ')';
  } else {
    $builderActionBtn.textContent = 'Use as Ad';
  }
}
```

In preview mode, the builder needs two buttons: "Regenerate" (secondary) and "Accept" (primary). Replace the single footer button with a two-button layout when in preview mode. The Regenerate button sets `builderPreviewMode = false`, re-renders the builder content (keeping the creative direction value), and lets the user tweak + re-generate.

**Step 9: Test**

1. Open Creative SPA, generate/view a base image
2. Tap "Build Ad" → full-screen builder with caption pickers + creative direction textarea
3. Select some captions, type "white text, bottom aligned"
4. Tap "Generate Ad" → loading → preview shows composited result
5. Tweak creative direction, tap "Regenerate" → re-composites
6. Tap "Accept" → navigates to ads library, ad appears

**Step 10: Commit**

```
feat: full-screen ad builder with creative direction and preview loop
```

---

### Task 4: Remove Regenerate from ad viewer

**Files:**
- Modify: `web-apps/creative-spa/index.html`

**Step 1: Remove the Regenerate button from ad viewer HTML**

Remove `<button class="ad-viewer-regen-btn" id="ad-viewer-regen-btn">Regenerate</button>` from the `#ad-viewer` div (line ~1785).

**Step 2: Remove Regenerate CSS**

Remove `.ad-viewer-regen-btn` styles (lines ~1341-1372).

**Step 3: Remove Regenerate JS**

Remove:
- `$adViewerRegenBtn` DOM ref
- `adRegenerating` state variable
- The `$adViewerRegenBtn.addEventListener('click', ...)` handler (lines ~2923-2964)
- The regenerate button state reset in `updateAdViewerImage()`

**Step 4: Test**

1. Open Creative SPA, go to Library > Ads
2. Tap an ad → viewer opens
3. Confirm no Regenerate button, just swipe navigation + close

**Step 5: Commit**

```
refactor: remove Regenerate from ad viewer, now handled by ad builder
```

---

### Task 5: Deploy and end-to-end test

**Step 1: Deploy edge function**

```bash
supabase functions deploy edit-image
```

**Step 2: Deploy Creative SPA**

```bash
bash web-apps/creative-spa/deploy.sh
```

**Step 3: End-to-end verification**

1. Open Creative SPA, generate a base image
2. Tap the image → viewer opens with "Edit" and "Build Ad" buttons
3. **Test Edit:** Tap Edit, type "make the colours warmer", submit → new image appears, original still in library
4. **Test Ad Builder:** Tap Build Ad → full-screen builder, pick captions, add creative direction, Generate → preview → Accept → ad in library
5. **Test Regeneration loop:** In builder preview, tweak direction, Regenerate → new preview
6. **Test ad viewer:** Open an ad from library → view only, no Regenerate button

**Step 4: Commit any fixes, push**
