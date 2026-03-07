# Image Archive Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add soft-delete (archive) for images with select-mode bulk operations and an archived filter in both Creative and Desktop SPAs.

**Architecture:** Add `archived_at timestamptz` column to `base_image`. Both SPAs get a select mode (multi-select images → Archive/Restore action bar) and an Active/Archived toggle. Queries filter by `archived_at` null/not-null. Desktop's existing hard delete becomes archive.

**Tech Stack:** Supabase (Postgres, Edge Functions), vanilla JS SPAs

---

### Task 1: Migration — add archived_at to base_image

**Files:**
- Create: `supabase/migrations/00014_image_archived_at.sql`

**Step 1: Write the migration**

```sql
ALTER TABLE marketing.base_image ADD COLUMN archived_at timestamptz;
```

**Step 2: Apply the migration**

Run: `supabase db push --linked`
Expected: Migration applied successfully

**Step 3: Commit**

```
git add supabase/migrations/00014_image_archived_at.sql
git commit -m "Add archived_at column to base_image"
```

---

### Task 2: Creative SPA — filter archived images in loadData

**Files:**
- Modify: `web-apps/creative-spa/index.html`

**Step 1: Add showArchived state variable**

Near the other state variables (around line 1830, near `let libraryView`), add:

```javascript
let showArchived = false;
let selectMode = false;
let selectedImageIds = new Set();
```

**Step 2: Update loadData to filter by archived_at**

Change the `base_image` query (line 1859) to filter based on `showArchived`:

```javascript
const imageQuery = db().from('base_image')
  .select('*, base_image_segment(segment_id, segment:segment_id(id, name)), generation_prompt:generation_prompt_id(id, type, prompt, created_at)')
  .order('created_at', { ascending: false });

if (showArchived) {
  imageQuery.not('archived_at', 'is', null);
} else {
  imageQuery.is('archived_at', null);
}
```

Replace the existing `db().from('base_image')...` line in the `Promise.all` with `imageQuery`. Since `Promise.all` needs the promise directly, build the query before the `Promise.all` call:

```javascript
async function loadData() {
  try {
    const imageQuery = db().from('base_image')
      .select('*, base_image_segment(segment_id, segment:segment_id(id, name)), generation_prompt:generation_prompt_id(id, type, prompt, created_at)')
      .order('created_at', { ascending: false });
    if (showArchived) {
      imageQuery.not('archived_at', 'is', null);
    } else {
      imageQuery.is('archived_at', null);
    }

    const [rawImages, rawCaptions, rawAds, rawSegments] = await Promise.all([
      imageQuery,
      // ... rest unchanged
```

**Step 3: Commit**

```
git add web-apps/creative-spa/index.html
git commit -m "Creative SPA: filter images by archived_at state"
```

---

### Task 3: Creative SPA — select mode UI

**Files:**
- Modify: `web-apps/creative-spa/index.html`

**Step 1: Add CSS for select mode**

Add after the `.image-grid` CSS block (after line 965):

```css
/* Select mode */
.image-grid-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.image-grid-header-label {
  font-size: 13px;
  color: var(--text-secondary);
}

.image-select-btn {
  font-family: var(--font-body);
  font-size: 14px;
  font-weight: 500;
  color: var(--accent);
  background: none;
  border: none;
  padding: 4px 8px;
  cursor: pointer;
  -webkit-appearance: none;
  -webkit-tap-highlight-color: transparent;
}

.image-grid.select-mode img {
  transition: opacity 0.15s;
}

.image-cell-wrap {
  position: relative;
}

.image-cell-wrap .select-check {
  display: none;
  position: absolute;
  top: 6px;
  right: 6px;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  border: 2px solid rgba(255,255,255,0.8);
  background: rgba(0,0,0,0.3);
  z-index: 2;
}

.select-mode .image-cell-wrap .select-check {
  display: block;
}

.image-cell-wrap.selected .select-check {
  background: var(--accent);
  border-color: var(--accent);
}

.image-cell-wrap.selected .select-check::after {
  content: '✓';
  color: #fff;
  font-size: 14px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
}

.image-cell-wrap.selected img {
  opacity: 0.7;
}

/* Action bar */
.select-action-bar {
  position: fixed;
  bottom: calc(60px + var(--safe-bottom));
  left: 0;
  right: 0;
  background: var(--surface);
  border-top: 1px solid var(--separator);
  padding: 12px 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  z-index: 90;
  box-shadow: 0 -2px 8px rgba(0,0,0,0.06);
}

.select-action-bar .select-count {
  font-size: 15px;
  font-weight: 500;
  color: var(--text-primary);
}

.select-action-bar .select-archive-btn {
  font-family: var(--font-body);
  font-size: 15px;
  font-weight: 600;
  padding: 10px 20px;
  border: none;
  border-radius: var(--radius);
  cursor: pointer;
  -webkit-appearance: none;
}

.select-action-bar .select-archive-btn.archive {
  background: var(--red);
  color: #fff;
}

.select-action-bar .select-archive-btn.restore {
  background: var(--accent);
  color: #fff;
}

.select-action-bar .select-cancel-btn {
  font-family: var(--font-body);
  font-size: 15px;
  color: var(--text-secondary);
  background: none;
  border: none;
  padding: 10px;
  cursor: pointer;
  -webkit-appearance: none;
}
```

**Step 2: Add action bar HTML**

After the image viewer HTML (after line 1590), add:

```html
<div id="select-action-bar" class="select-action-bar hidden">
  <button class="select-cancel-btn" id="select-cancel-btn">Cancel</button>
  <span class="select-count" id="select-count">0 selected</span>
  <button class="select-archive-btn" id="select-archive-btn">Archive</button>
</div>
```

**Step 3: Update renderImageGrid to support select mode**

Replace `renderImageCell` (line 2497-2503) to wrap images in a selectable container:

```javascript
function renderImageCell(img) {
  const src = storageBaseUrl + '/' + img.storage_path;
  const selectedClass = selectedImageIds.has(img.id) ? ' selected' : '';
  return '<div class="image-cell-wrap' + selectedClass + '" data-image-id="' + escapeHtml(img.id) + '">'
    + '<div class="select-check"></div>'
    + '<img src="' + escapeHtml(src) + '" loading="lazy" alt="" />'
    + '</div>';
}
```

Update `renderImageGrid` to add header with Select/Cancel button and toggle CSS class on the grid. Replace the header/grid opening and click handler sections:

Before the grid HTML, add:

```javascript
let html = '<div class="image-grid-header">'
  + '<span class="image-grid-header-label">'
  + (showArchived ? 'Archived' : '') + images.length + ' image' + (images.length !== 1 ? 's' : '')
  + '</span>'
  + '<button class="image-select-btn" id="image-select-toggle">'
  + (selectMode ? 'Cancel' : 'Select')
  + '</button>'
  + '</div>';

html += '<div class="image-grid' + (selectMode ? ' select-mode' : '') + '">';
```

Replace the click handler block (lines 2489-2494) with:

```javascript
// Attach click handlers
$libImageGrid.querySelectorAll('.image-cell-wrap').forEach(cell => {
  cell.addEventListener('click', () => {
    if (selectMode) {
      const id = cell.dataset.imageId;
      if (selectedImageIds.has(id)) {
        selectedImageIds.delete(id);
        cell.classList.remove('selected');
      } else {
        selectedImageIds.add(id);
        cell.classList.add('selected');
      }
      updateSelectActionBar();
    } else {
      openViewer(cell.dataset.imageId);
    }
  });
});

// Select toggle button
const $selectToggle = document.getElementById('image-select-toggle');
if ($selectToggle) {
  $selectToggle.addEventListener('click', () => {
    if (selectMode) {
      exitSelectMode();
    } else {
      enterSelectMode();
    }
  });
}
```

**Step 4: Add select mode functions**

After the `renderImageGrid` function, add:

```javascript
function enterSelectMode() {
  selectMode = true;
  selectedImageIds.clear();
  renderLibrary();
  updateSelectActionBar();
  show(document.getElementById('select-action-bar'));
}

function exitSelectMode() {
  selectMode = false;
  selectedImageIds.clear();
  hide(document.getElementById('select-action-bar'));
  renderLibrary();
}

function updateSelectActionBar() {
  const count = selectedImageIds.size;
  const $bar = document.getElementById('select-action-bar');
  const $count = document.getElementById('select-count');
  const $btn = document.getElementById('select-archive-btn');

  $count.textContent = count + ' selected';

  if (showArchived) {
    $btn.textContent = 'Restore';
    $btn.className = 'select-archive-btn restore';
  } else {
    $btn.textContent = 'Archive';
    $btn.className = 'select-archive-btn archive';
  }

  $btn.disabled = count === 0;
  $btn.style.opacity = count === 0 ? '0.4' : '1';

  if (count > 0) {
    show($bar);
  }
}
```

**Step 5: Wire up archive/restore action and cancel button**

After the DOM references section (around line 1690), add event listeners for the action bar:

```javascript
document.getElementById('select-cancel-btn').addEventListener('click', exitSelectMode);

document.getElementById('select-archive-btn').addEventListener('click', async () => {
  const ids = Array.from(selectedImageIds);
  if (ids.length === 0) return;

  const action = showArchived ? 'restore' : 'archive';
  if (!confirm(action === 'archive'
    ? 'Archive ' + ids.length + ' image' + (ids.length > 1 ? 's' : '') + '?'
    : 'Restore ' + ids.length + ' image' + (ids.length > 1 ? 's' : '') + '?'
  )) return;

  try {
    const value = action === 'archive' ? new Date().toISOString() : null;
    const { error } = await db().from('base_image')
      .update({ archived_at: value })
      .in('id', ids);
    if (error) throw error;
    exitSelectMode();
    await loadData();
  } catch (err) {
    alert('Failed to ' + action + ': ' + (err.message || err));
  }
});
```

**Step 6: Commit**

```
git add web-apps/creative-spa/index.html
git commit -m "Creative SPA: select mode with bulk archive/restore"
```

---

### Task 4: Creative SPA — archived filter toggle

**Files:**
- Modify: `web-apps/creative-spa/index.html`

**Step 1: Add archived toggle CSS**

Add after the select mode CSS:

```css
.archive-toggle {
  display: flex;
  background: rgba(118, 118, 128, 0.12);
  border-radius: 6px;
  padding: 2px;
  margin-bottom: 8px;
}

.archive-toggle button {
  flex: 1;
  padding: 6px 12px;
  border: none;
  border-radius: 5px;
  background: transparent;
  font-family: var(--font-body);
  font-size: 13px;
  font-weight: 500;
  color: var(--text-secondary);
  cursor: pointer;
  -webkit-appearance: none;
  -webkit-tap-highlight-color: transparent;
  transition: all 0.2s ease;
}

.archive-toggle button.active {
  background: var(--surface);
  color: var(--text-primary);
  font-weight: 600;
  box-shadow: 0 1px 3px rgba(0,0,0,0.08);
}
```

**Step 2: Add archive toggle to renderImageGrid**

At the top of `renderImageGrid`, before the header, insert the toggle:

```javascript
// Archive toggle — at the very start of grid rendering, before header
let html = '<div class="archive-toggle">'
  + '<button class="archive-toggle-btn' + (!showArchived ? ' active' : '') + '" data-show="active">Active</button>'
  + '<button class="archive-toggle-btn' + (showArchived ? ' active' : '') + '" data-show="archived">Archived</button>'
  + '</div>';
```

Then continue with the header + grid HTML. After attaching the select toggle handler, add:

```javascript
// Archive toggle handler
$libImageGrid.querySelectorAll('.archive-toggle-btn').forEach(btn => {
  btn.addEventListener('click', async () => {
    const newShowArchived = btn.dataset.show === 'archived';
    if (newShowArchived === showArchived) return;
    showArchived = newShowArchived;
    exitSelectMode();
    await loadData();
  });
});
```

**Step 3: Update empty state for archived view**

In the empty state block of `renderImageGrid`, make the message context-aware:

```javascript
if (!images.length) {
  const emptyMsg = showArchived
    ? '<div style="font-size:13px;">No archived images.</div>'
    : '<div>No images yet.</div><div style="font-size:13px;">Head to Generate to create some.</div>';
  $libImageGrid.innerHTML = '<div class="archive-toggle">'
    + '<button class="archive-toggle-btn' + (!showArchived ? ' active' : '') + '" data-show="active">Active</button>'
    + '<button class="archive-toggle-btn' + (showArchived ? ' active' : '') + '" data-show="archived">Archived</button>'
    + '</div>'
    + '<div class="lib-empty"><div style="font-size:32px; opacity:0.3;">&#128247;</div>' + emptyMsg + '</div>';

  // Still need archive toggle handlers on empty state
  $libImageGrid.querySelectorAll('.archive-toggle-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const newShowArchived = btn.dataset.show === 'archived';
      if (newShowArchived === showArchived) return;
      showArchived = newShowArchived;
      await loadData();
    });
  });
  return;
}
```

**Step 4: Exit select mode when switching views**

In `switchLibraryView` (line 2337), add `exitSelectMode()` call at the start:

```javascript
function switchLibraryView(view) {
  if (selectMode) exitSelectMode();
  libraryView = view;
  // ... rest unchanged
}
```

**Step 5: Commit**

```
git add web-apps/creative-spa/index.html
git commit -m "Creative SPA: Active/Archived toggle for images"
```

---

### Task 5: Desktop SPA — archive support

**Files:**
- Modify: `web-apps/desktop-spa/index.html`

**Step 1: Add state variables**

Near other state variables (around line 1728), add:

```javascript
let showArchivedImages = false;
let imageSelectMode = false;
let selectedImageIds = new Set();
```

**Step 2: Update loadData to filter by archived_at**

In `loadData()` (line 1880), build the image query with archive filter before `Promise.all`:

```javascript
async function loadData() {
  try {
    const imageQuery = db().from('base_image')
      .select('*, base_image_tag(tag_id, tag:tag_id(id, name)), base_image_segment(segment_id, segment:segment_id(id, name)), generation_prompt:generation_prompt_id(id, type, prompt, created_at)')
      .order('created_at', { ascending: false });
    if (showArchivedImages) {
      imageQuery.not('archived_at', 'is', null);
    } else {
      imageQuery.is('archived_at', null);
    }

    const [rawImages, rawCaptions, rawBc, rawAds, rawAdSets, rawCampaigns, rawTags, rawSegments] = await Promise.all([
      imageQuery,
      // ... rest unchanged
```

**Step 3: Convert existing delete to archive**

Change `window.__deleteImage` (lines 3358-3374) from hard delete to soft archive:

```javascript
window.__deleteImage = async function(id) {
  if (!confirm('Archive this image?')) return;
  try {
    const { error } = await db().from('base_image')
      .update({ archived_at: new Date().toISOString() })
      .eq('id', id);
    if (error) {
      alert(error.message || 'Failed to archive image');
      return;
    }
    await loadData();
  } catch (err) {
    console.error('Archive image failed:', err);
  }
};
```

Update the button title in the image card HTML (line 2183) from `title="Delete"` to `title="Archive"`.

**Step 4: Add archive toggle + select mode to renderImages**

Add CSS for the archive toggle and select mode (after the existing `.image-ratio-filter` CSS around line 1473):

```css
.image-archive-toggle {
  display: inline-flex;
  background: var(--light-gray);
  border-radius: var(--radius);
  padding: 2px;
  margin-left: 12px;
}

.image-archive-toggle button {
  padding: 3px 10px;
  border: none;
  border-radius: calc(var(--radius) - 2px);
  background: transparent;
  font-family: var(--font-body);
  font-size: 12px;
  font-weight: 500;
  color: var(--warm-gray);
  cursor: pointer;
  transition: all 0.15s;
}

.image-archive-toggle button.active {
  background: #fff;
  color: var(--charcoal);
  font-weight: 600;
  box-shadow: var(--shadow-sm);
}

.image-select-controls {
  display: flex;
  gap: 8px;
  align-items: center;
}

.image-select-controls .btn-select {
  font-family: var(--font-body);
  font-size: 12px;
  color: var(--amber);
  background: none;
  border: none;
  cursor: pointer;
  padding: 4px 8px;
}

.image-select-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 12px;
  margin-bottom: 12px;
  background: var(--warm-white);
  border-radius: var(--radius);
  border: 1px solid var(--light-gray);
}

.image-select-bar .select-count {
  font-size: 13px;
  color: var(--charcoal);
  flex: 1;
}

.image-card.selectable {
  cursor: pointer;
}

.image-card .select-check {
  display: none;
  position: absolute;
  top: 8px;
  left: 8px;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  border: 2px solid rgba(255,255,255,0.8);
  background: rgba(0,0,0,0.3);
  z-index: 2;
}

.image-card.selectable .select-check {
  display: block;
}

.image-card.selected .select-check {
  background: var(--amber);
  border-color: var(--amber);
}

.image-card.selected .select-check::after {
  content: '✓';
  color: #fff;
  font-size: 13px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
}

.image-card.selected {
  opacity: 0.7;
}
```

**Step 5: Update renderImages to include archive toggle and select mode**

In `renderImages()`, after the ratio filter HTML (line 2167), add an archive toggle:

```javascript
html += '<div class="image-archive-toggle">'
  + '<button class="archive-btn' + (!showArchivedImages ? ' active' : '') + '" data-show="active">Active</button>'
  + '<button class="archive-btn' + (showArchivedImages ? ' active' : '') + '" data-show="archived">Archived</button>'
  + '</div>';
```

Add a select button next to the archive toggle:

```javascript
html += '<button class="btn-select" id="image-select-toggle" style="margin-left:auto;font-size:12px;color:var(--amber);background:none;border:none;cursor:pointer;padding:4px 8px">'
  + (imageSelectMode ? 'Cancel' : 'Select')
  + '</button>';
```

When `imageSelectMode` is true, show a select action bar at the top of the grid:

```javascript
if (imageSelectMode) {
  const action = showArchivedImages ? 'Restore' : 'Archive';
  html += '<div class="image-select-bar">'
    + '<span class="select-count" id="image-select-count">' + selectedImageIds.size + ' selected</span>'
    + '<button class="btn-primary" id="image-select-action" style="font-size:12px;padding:6px 14px">' + action + '</button>'
    + '</div>';
}
```

Update the image card template (line 2179) to include a select checkbox and toggle click behavior in select mode:

```javascript
const selectable = imageSelectMode ? ' selectable' + (selectedImageIds.has(img.id) ? ' selected' : '') : '';
g += '<div class="image-card' + selectable + '" ' + (imageSelectMode ? '' : 'draggable="true" ') + 'data-image-id="' + img.id + '">'
  + '<div class="select-check"></div>'
  + '<img src="' + escapeHtml(src) + '" alt="' + escapeHtml(img.filename) + '" loading="lazy"'
  + (imageSelectMode ? '' : ' onclick="window.__openLightbox(this.src, event)" style="cursor:zoom-in"')
  + ' />'
  + '<div class="image-card-info">' + escapeHtml(img.filename) + '</div>'
  + (tagsHtml || segHtml ? '<div class="image-card-tags">' + tagsHtml + segHtml + '</div>' : '')
  + (imageSelectMode ? '' : '<button class="btn-delete" onclick="window.__deleteImage(\'' + img.id + '\')" title="Archive">&times;</button>')
  + '</div>';
```

**Step 6: Add click handlers for select mode, archive toggle, and bulk action**

After the existing drag handlers (line 2218), add:

```javascript
// Archive toggle
$panelImages.querySelectorAll('.archive-btn').forEach(btn => {
  btn.addEventListener('click', async () => {
    const newVal = btn.dataset.show === 'archived';
    if (newVal === showArchivedImages) return;
    showArchivedImages = newVal;
    imageSelectMode = false;
    selectedImageIds.clear();
    await loadData();
  });
});

// Select toggle
const $selectToggle = $panelImages.querySelector('#image-select-toggle');
if ($selectToggle) {
  $selectToggle.addEventListener('click', () => {
    imageSelectMode = !imageSelectMode;
    selectedImageIds.clear();
    renderImages();
  });
}

// Select mode click on cards
if (imageSelectMode) {
  $panelImages.querySelectorAll('.image-card.selectable').forEach(card => {
    card.addEventListener('click', () => {
      const id = card.dataset.imageId;
      if (selectedImageIds.has(id)) {
        selectedImageIds.delete(id);
        card.classList.remove('selected');
      } else {
        selectedImageIds.add(id);
        card.classList.add('selected');
      }
      const $count = document.getElementById('image-select-count');
      if ($count) $count.textContent = selectedImageIds.size + ' selected';
    });
  });
}

// Bulk archive/restore action
const $selectAction = $panelImages.querySelector('#image-select-action');
if ($selectAction) {
  $selectAction.addEventListener('click', async () => {
    const ids = Array.from(selectedImageIds);
    if (ids.length === 0) return;
    const action = showArchivedImages ? 'restore' : 'archive';
    if (!confirm(action === 'archive'
      ? 'Archive ' + ids.length + ' image' + (ids.length > 1 ? 's' : '') + '?'
      : 'Restore ' + ids.length + ' image' + (ids.length > 1 ? 's' : '') + '?'
    )) return;
    try {
      const value = action === 'archive' ? new Date().toISOString() : null;
      const { error } = await db().from('base_image')
        .update({ archived_at: value })
        .in('id', ids);
      if (error) throw error;
      imageSelectMode = false;
      selectedImageIds.clear();
      await loadData();
    } catch (err) {
      alert('Failed to ' + action + ': ' + (err.message || err));
    }
  });
}
```

**Step 7: Commit**

```
git add web-apps/desktop-spa/index.html
git commit -m "Desktop SPA: archive toggle, select mode, convert delete to archive"
```

---

### Task 6: Deploy and verify

**Step 1: Deploy creative SPA**

Run: `bash web-apps/creative-spa/deploy.sh`

**Step 2: Verify end-to-end**

In the Creative SPA:
1. Open Images tab — should show active images only
2. Tap "Select" — checkbox overlays appear on each image
3. Tap 2-3 images — they get checked, count updates
4. Tap "Archive" — confirm dialog → images disappear from grid
5. Toggle to "Archived" — archived images appear
6. Enter select mode → select images → tap "Restore" → images reappear in Active view

In the Desktop SPA:
1. Open Images tab — active/archived toggle visible next to ratio filter
2. Hover an image card — archive button (×) appears
3. Click × — "Archive this image?" → image disappears
4. Click "Archived" toggle — see archived images
5. Use select mode to bulk restore

**Step 3: Commit any fixes**

---

## Implementation Order

1. Migration (schema)
2. Creative SPA: loadData filter
3. Creative SPA: select mode UI
4. Creative SPA: archived toggle
5. Desktop SPA: full archive support
6. Deploy and verify
