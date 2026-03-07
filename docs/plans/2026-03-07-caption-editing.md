# Caption Editing & Segment Assignment Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add long-press-to-edit on captions with segment assignment, immutability for in-use captions, and fix caption list filtering by active segment.

**Architecture:** Long-press on a caption card opens a full-screen edit view (matching the ad-builder pattern). The edit view queries `ad_caption` to check if the caption is in use — if so, text/role are read-only and saving duplicates instead of updating. Caption list switches from `STATE.captions` to `filteredCaptions()`.

**Tech Stack:** Vanilla JS, Supabase JS client, CSS. Single file: `web-apps/creative-spa/index.html`.

---

### Task 1: Fix caption list to filter by active segment

The caption list currently shows all captions regardless of the active segment filter. This is a one-line fix.

**Files:**
- Modify: `web-apps/creative-spa/index.html:2729`

**Step 1: Change `STATE.captions` to `filteredCaptions()`**

At line 2729, change:
```js
const captions = STATE.captions || [];
```
to:
```js
const captions = filteredCaptions();
```

`filteredCaptions()` already exists at line 2183 and returns all captions when no segment is active, or only matching captions when one is.

**Step 2: Verify**

1. Open the Creative SPA in browser
2. With "All" segment active — all captions should appear
3. Select a specific segment — only captions assigned to that segment should appear
4. Select "All" again — all captions reappear

**Step 3: Commit**

```bash
git add web-apps/creative-spa/index.html
git commit -m "Fix caption list to filter by active segment"
```

---

### Task 2: Add long-press detection on caption cards

No long-press handler exists anywhere in the codebase. We need a reusable pattern.

**Files:**
- Modify: `web-apps/creative-spa/index.html` — add long-press detection inside `renderCaptionsList()`

**Step 1: Add long-press handlers after caption cards are rendered**

Inside `renderCaptionsList()`, after the existing event handlers (after the segment remove handlers ending around line 2857), add long-press detection on each `.lib-caption-card`:

```js
// Long-press to edit
$libCaptionsView.querySelectorAll('.lib-caption-card').forEach(card => {
  let pressTimer = null;
  let didLongPress = false;

  function startPress(e) {
    didLongPress = false;
    pressTimer = setTimeout(() => {
      didLongPress = true;
      const captionId = card.dataset.captionId;
      if (captionId) openCaptionEditor(captionId);
    }, 500);
  }

  function cancelPress() {
    clearTimeout(pressTimer);
  }

  function endPress(e) {
    clearTimeout(pressTimer);
    if (didLongPress) {
      e.preventDefault();
      e.stopPropagation();
    }
  }

  card.addEventListener('touchstart', startPress, { passive: true });
  card.addEventListener('touchmove', cancelPress);
  card.addEventListener('touchend', endPress);
  card.addEventListener('touchcancel', cancelPress);
  // Desktop fallback
  card.addEventListener('mousedown', startPress);
  card.addEventListener('mousemove', cancelPress);
  card.addEventListener('mouseup', endPress);
  card.addEventListener('mouseleave', cancelPress);
});
```

**Step 2: Add `data-caption-id` to each card element**

In the card HTML template (around line 2773), the outer `<div class="lib-caption-card">` needs a data attribute. Change:
```html
<div class="lib-caption-card">
```
to:
```html
<div class="lib-caption-card" data-caption-id="' + cap.id + '">
```

**Step 3: Add a stub `openCaptionEditor()` function**

Add near the other editor/viewer functions (around line 3350):

```js
function openCaptionEditor(captionId) {
  console.log('Open editor for caption:', captionId);
}
```

**Step 4: Verify**

1. Long-press (hold ~500ms) a caption card → console should log the caption ID
2. Normal tap should NOT trigger the editor
3. Moving finger/mouse during press should cancel

**Step 5: Commit**

```bash
git add web-apps/creative-spa/index.html
git commit -m "Add long-press detection on caption cards"
```

---

### Task 3: Build the full-screen caption editor UI

Follow the ad-builder-screen pattern: fixed overlay, header with close + title, scrollable body, sticky footer.

**Files:**
- Modify: `web-apps/creative-spa/index.html` — add HTML, CSS, and JS

**Step 1: Add CSS for the caption editor**

Add after the ad-builder CSS (after line ~1607), before the segment dropdown CSS:

```css
/* Caption editor */
.caption-editor { position: fixed; inset: 0; z-index: 220; background: var(--bg); display: flex; flex-direction: column; }
.caption-editor.hidden { display: none !important; }
.caption-editor-header { display: flex; align-items: center; padding: 16px; border-bottom: 1px solid var(--border); flex-shrink: 0; }
.caption-editor-close { background: none; border: none; font-size: 24px; padding: 0 12px 0 0; cursor: pointer; color: var(--text-primary); }
.caption-editor-title { font-size: 17px; font-weight: 600; flex: 1; }
.caption-editor-badge { font-size: 11px; padding: 3px 8px; border-radius: 10px; background: var(--accent-light); color: var(--accent-dark); }
.caption-editor-body { flex: 1; overflow-y: auto; padding: 20px 16px; display: flex; flex-direction: column; gap: 20px; }
.caption-editor-section label { display: block; font-size: 13px; font-weight: 600; color: var(--text-secondary); margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.5px; }
.caption-editor-textarea { width: 100%; min-height: 100px; padding: 12px; border: 1px solid var(--border); border-radius: 10px; font-size: 16px; font-family: inherit; resize: vertical; background: var(--card-bg); color: var(--text-primary); }
.caption-editor-textarea:disabled { opacity: 0.5; background: var(--bg); }
.caption-editor-roles { display: flex; gap: 8px; flex-wrap: wrap; }
.caption-editor-role-btn { padding: 8px 16px; border-radius: 20px; border: 1px solid var(--border); background: var(--card-bg); font-size: 14px; cursor: pointer; color: var(--text-primary); }
.caption-editor-role-btn.active { background: var(--accent-dark); color: #fff; border-color: var(--accent-dark); }
.caption-editor-role-btn:disabled { opacity: 0.5; cursor: default; }
.caption-editor-segments { display: flex; flex-wrap: wrap; gap: 8px; }
.caption-editor-seg-chip { display: inline-flex; align-items: center; gap: 4px; padding: 6px 10px; border-radius: 14px; background: rgba(0,0,0,0.06); font-size: 13px; }
.caption-editor-seg-chip button { background: none; border: none; font-size: 14px; cursor: pointer; padding: 0 0 0 2px; color: var(--text-secondary); }
.caption-editor-seg-add { padding: 6px 12px; border-radius: 14px; border: 1px dashed var(--border); background: none; font-size: 13px; cursor: pointer; color: var(--text-secondary); }
.caption-editor-locked { font-size: 13px; color: var(--text-secondary); padding: 10px 14px; background: rgba(0,0,0,0.03); border-radius: 10px; line-height: 1.5; }
.caption-editor-footer { padding: 16px; border-top: 1px solid var(--border); flex-shrink: 0; }
.caption-editor-save { width: 100%; padding: 14px; border-radius: 12px; border: none; background: var(--accent-dark); color: #fff; font-size: 16px; font-weight: 600; cursor: pointer; }
.caption-editor-save:disabled { opacity: 0.5; cursor: default; }
```

**Step 2: Add HTML for the caption editor**

Add after the ad-builder HTML (after `</div><!-- /ad-builder-screen -->`, around line 1898):

```html
<!-- Caption editor -->
<div id="caption-editor" class="caption-editor hidden">
  <div class="caption-editor-header">
    <button class="caption-editor-close" id="caption-editor-close">&times;</button>
    <div class="caption-editor-title">Edit Caption</div>
    <span class="caption-editor-badge hidden" id="caption-editor-locked-badge">In Use</span>
  </div>
  <div class="caption-editor-body" id="caption-editor-body"></div>
  <div class="caption-editor-footer">
    <button class="caption-editor-save" id="caption-editor-save">Save</button>
  </div>
</div>
```

**Step 3: Add DOM references**

Add near the other DOM ref declarations (around line 1910):

```js
const $captionEditor = document.getElementById('caption-editor');
const $captionEditorBody = document.getElementById('caption-editor-body');
const $captionEditorSave = document.getElementById('caption-editor-save');
const $captionEditorClose = document.getElementById('caption-editor-close');
const $captionEditorLockedBadge = document.getElementById('caption-editor-locked-badge');
```

**Step 4: Add state variables**

Add near the other state variables (around line 1920):

```js
let editorCaptionId = null;
let editorIsLocked = false;
```

**Step 5: Implement `openCaptionEditor()`**

Replace the stub from Task 2:

```js
async function openCaptionEditor(captionId) {
  const caption = STATE.captions.find(c => c.id === captionId);
  if (!caption) return;

  editorCaptionId = captionId;

  // Check if caption is used by any ad
  const { data: usages } = await db().from('ad_caption').select('ad_id').eq('caption_id', captionId).limit(1);
  editorIsLocked = (usages && usages.length > 0);

  renderCaptionEditorBody(caption);

  if (editorIsLocked) {
    show($captionEditorLockedBadge);
    $captionEditorSave.textContent = 'Duplicate & Save';
  } else {
    hide($captionEditorLockedBadge);
    $captionEditorSave.textContent = 'Save';
  }

  show($captionEditor);
  document.body.style.overflow = 'hidden';
}

function closeCaptionEditor() {
  hide($captionEditor);
  document.body.style.overflow = '';
  editorCaptionId = null;
  editorIsLocked = false;
}
```

**Step 6: Implement `renderCaptionEditorBody()`**

```js
function renderCaptionEditorBody(caption) {
  const roles = ['headline', 'subline', 'cta', 'tagline'];
  const currentRole = caption.role || 'headline';
  const disabledAttr = editorIsLocked ? ' disabled' : '';

  let segsHtml = '';
  for (const seg of (caption.segments || [])) {
    segsHtml += '<span class="caption-editor-seg-chip">'
      + escapeHtml(seg.name)
      + ' <button data-segment-id="' + seg.id + '" title="Remove">&times;</button>'
      + '</span>';
  }
  segsHtml += '<button class="caption-editor-seg-add" id="caption-editor-add-seg">+ Segment</button>';

  let html = '';

  if (editorIsLocked) {
    html += '<div class="caption-editor-locked">This caption is used by an ad. Editing will create a duplicate.</div>';
  }

  html += '<div class="caption-editor-section"><label>Text</label>'
    + '<textarea class="caption-editor-textarea" id="caption-editor-text"' + disabledAttr + '>' + escapeHtml(caption.text) + '</textarea>'
    + '</div>';

  html += '<div class="caption-editor-section"><label>Role</label><div class="caption-editor-roles">';
  for (const r of roles) {
    const activeClass = r === currentRole ? ' active' : '';
    html += '<button class="caption-editor-role-btn' + activeClass + '" data-role="' + r + '"' + disabledAttr + '>' + r + '</button>';
  }
  html += '</div></div>';

  html += '<div class="caption-editor-section"><label>Segments</label>'
    + '<div class="caption-editor-segments">' + segsHtml + '</div>'
    + '</div>';

  $captionEditorBody.innerHTML = html;

  // Role picker
  $captionEditorBody.querySelectorAll('.caption-editor-role-btn').forEach(btn => {
    if (editorIsLocked) return;
    btn.addEventListener('click', () => {
      $captionEditorBody.querySelectorAll('.caption-editor-role-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  // Remove segment chip
  $captionEditorBody.querySelectorAll('.caption-editor-seg-chip button').forEach(btn => {
    btn.addEventListener('click', async () => {
      const segId = btn.dataset.segmentId;
      await db().from('caption_segment').delete().eq('caption_id', editorCaptionId).eq('segment_id', segId);
      await loadData();
      const updated = STATE.captions.find(c => c.id === editorCaptionId);
      if (updated) renderCaptionEditorBody(updated);
    });
  });

  // Add segment button
  const addSegBtn = document.getElementById('caption-editor-add-seg');
  if (addSegBtn) {
    addSegBtn.addEventListener('click', () => {
      // Show segment dropdown, then on pick, insert into caption_segment
      showEditorSegmentPicker();
    });
  }
}
```

**Step 7: Implement segment picker for the editor**

Reuse the existing segment dropdown overlay pattern:

```js
function showEditorSegmentPicker() {
  const caption = STATE.captions.find(c => c.id === editorCaptionId);
  if (!caption) return;
  const assignedIds = new Set((caption.segments || []).map(s => s.id));
  const available = STATE.segments.filter(s => !assignedIds.has(s.id));

  if (available.length === 0) {
    alert('Already assigned to all segments.');
    return;
  }

  // Build a simple dropdown
  const overlay = document.getElementById('segment-dropdown-overlay');
  const dropdown = overlay.querySelector('.segment-dropdown');
  let html = '<div class="segment-dropdown-title">Add to Segment</div>';
  for (const seg of available) {
    html += '<div class="segment-dropdown-item" data-seg-id="' + seg.id + '">' + escapeHtml(seg.name) + '</div>';
  }
  dropdown.innerHTML = html;
  overlay.classList.add('visible');

  // Handle clicks
  dropdown.querySelectorAll('.segment-dropdown-item').forEach(item => {
    item.addEventListener('click', async () => {
      const segId = item.dataset.segId;
      overlay.classList.remove('visible');
      await db().from('caption_segment').insert({ caption_id: editorCaptionId, segment_id: segId });
      await loadData();
      const updated = STATE.captions.find(c => c.id === editorCaptionId);
      if (updated) renderCaptionEditorBody(updated);
    });
  });

  // Close on backdrop
  const backdropHandler = (e) => {
    if (e.target === overlay) {
      overlay.classList.remove('visible');
      overlay.removeEventListener('click', backdropHandler);
    }
  };
  overlay.addEventListener('click', backdropHandler);
}
```

**Step 8: Wire up close button**

Add near the other event listener setup (around where $captionEditorClose is referenced):

```js
$captionEditorClose.addEventListener('click', closeCaptionEditor);
```

**Step 9: Verify**

1. Long-press a caption → full-screen editor opens
2. Text, role, and segments are visible
3. Close button works
4. Segment chips show with × to remove
5. "+ Segment" opens picker, selecting one adds the segment

**Step 10: Commit**

```bash
git add web-apps/creative-spa/index.html
git commit -m "Add full-screen caption editor with segment assignment"
```

---

### Task 4: Implement save — direct edit and duplicate-on-edit

**Files:**
- Modify: `web-apps/creative-spa/index.html` — add save handler

**Step 1: Implement the save handler**

Add the click handler for `$captionEditorSave`:

```js
$captionEditorSave.addEventListener('click', async () => {
  const textEl = document.getElementById('caption-editor-text');
  const activeRole = $captionEditorBody.querySelector('.caption-editor-role-btn.active');
  if (!textEl || !activeRole) return;

  const newText = textEl.value.trim();
  const newRole = activeRole.dataset.role;

  if (!newText) {
    alert('Caption text cannot be empty.');
    return;
  }

  $captionEditorSave.disabled = true;

  try {
    if (editorIsLocked) {
      // Duplicate: insert new caption with edited values
      const { data: newCap, error } = await db().from('caption').insert({ text: newText, role: newRole }).select().single();
      if (error) throw error;

      // Copy segment assignments from original to new caption
      const original = STATE.captions.find(c => c.id === editorCaptionId);
      if (original && original.segments.length > 0) {
        const segInserts = original.segments.map(s => ({ caption_id: newCap.id, segment_id: s.id }));
        await db().from('caption_segment').insert(segInserts);
      }
    } else {
      // Direct update
      const { error } = await db().from('caption').update({ text: newText, role: newRole }).eq('id', editorCaptionId);
      if (error) throw error;
    }

    await loadData();
    closeCaptionEditor();
  } catch (err) {
    console.error('Save caption failed:', err);
    alert('Failed to save caption.');
  } finally {
    $captionEditorSave.disabled = false;
  }
});
```

**Step 2: Verify direct edit**

1. Create a test caption (not used by any ad)
2. Long-press → editor opens with "Save" button
3. Change text → tap Save → caption updates in list
4. Change role → tap Save → role badge updates

**Step 3: Verify duplicate-on-edit**

1. Find a caption that IS used by an ad (or create an ad using a caption)
2. Long-press → editor opens with "In Use" badge, greyed-out text/role, "Duplicate & Save" button
3. Text and role should NOT be editable (disabled attribute)
4. Tap "Duplicate & Save" → a new caption appears in the list with the same text/role/segments
5. Original caption is unchanged

Wait — the text/role are disabled for locked captions, so the user can't actually edit before duplicating. We need to allow editing the text/role for the duplicate. Change the approach: for locked captions, text/role are **editable** (so the user can tweak the wording), but the save action creates a copy instead of modifying the original.

**Step 3 (revised): Fix disabled state for locked captions**

In `renderCaptionEditorBody()`, remove the `disabledAttr` from the textarea and role buttons. Instead, only the notice and save button label communicate the locked state:

Change the `disabledAttr` variable:
```js
// Remove this line:
const disabledAttr = editorIsLocked ? ' disabled' : '';
```

And remove all uses of `disabledAttr` from the textarea and role button HTML. The text and role should always be editable — the locked state only affects whether we UPDATE or INSERT on save.

Keep the `if (editorIsLocked) return;` guard on role button click handlers — **remove it** so role buttons are always clickable.

**Step 4: Verify duplicate-on-edit (revised)**

1. Find a caption used by an ad
2. Long-press → editor opens with "In Use" badge and "Duplicate & Save"
3. Text and role ARE editable
4. Change the text → tap "Duplicate & Save" → new caption appears with edited text
5. Original caption unchanged, still attached to the ad

**Step 5: Commit**

```bash
git add web-apps/creative-spa/index.html
git commit -m "Implement caption save: direct edit and duplicate for in-use captions"
```

---

### Task 5: Deploy

**Step 1: Deploy the Creative SPA**

```bash
bash web-apps/creative-spa/deploy.sh
```

**Step 2: Verify on production**

1. Open https://creative.comejoinus.app
2. Caption list filters by segment
3. Long-press opens editor
4. Segment assignment works
5. Save/duplicate works
