# Segments Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add first-class segments (audience niches) with persistent filter bar, drag-and-drop assignment, and client-side filtering across all library panels.

**Architecture:** New `segment` table + 4 M2M join tables in Supabase. Segments loaded into STATE alongside tags. Filter bar renders below tab row. Client-side filtering in render functions. Segment chips on cards like existing tag chips.

**Tech Stack:** Supabase (Postgres), Express, vanilla JS (same as existing app)

---

### Task 1: Database Migration

**Files:**
- Create: `supabase/migrations/00007_segments.sql`

**Step 1: Write the migration**

```sql
-- Segments: first-class audience niches (separate from freeform tags)

CREATE TABLE marketing.segment (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE marketing.base_image_segment (
  base_image_id uuid NOT NULL REFERENCES marketing.base_image(id) ON DELETE CASCADE,
  segment_id    uuid NOT NULL REFERENCES marketing.segment(id) ON DELETE CASCADE,
  PRIMARY KEY (base_image_id, segment_id)
);

CREATE TABLE marketing.caption_segment (
  caption_id uuid NOT NULL REFERENCES marketing.caption(id) ON DELETE CASCADE,
  segment_id uuid NOT NULL REFERENCES marketing.segment(id) ON DELETE CASCADE,
  PRIMARY KEY (caption_id, segment_id)
);

CREATE TABLE marketing.body_copy_segment (
  body_copy_id uuid NOT NULL REFERENCES marketing.body_copy(id) ON DELETE CASCADE,
  segment_id   uuid NOT NULL REFERENCES marketing.segment(id) ON DELETE CASCADE,
  PRIMARY KEY (body_copy_id, segment_id)
);

CREATE TABLE marketing.ad_segment (
  ad_id      uuid NOT NULL REFERENCES marketing.ad(id) ON DELETE CASCADE,
  segment_id uuid NOT NULL REFERENCES marketing.segment(id) ON DELETE CASCADE,
  PRIMARY KEY (ad_id, segment_id)
);

-- RLS: same pattern as other tables (authenticated full access)
ALTER TABLE marketing.segment ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing.base_image_segment ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing.caption_segment ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing.body_copy_segment ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing.ad_segment ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated full access" ON marketing.segment FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated full access" ON marketing.base_image_segment FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated full access" ON marketing.caption_segment FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated full access" ON marketing.body_copy_segment FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated full access" ON marketing.ad_segment FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Grants (matches existing pattern in 00005_fix_grants.sql)
GRANT ALL ON marketing.segment TO authenticated;
GRANT ALL ON marketing.base_image_segment TO authenticated;
GRANT ALL ON marketing.caption_segment TO authenticated;
GRANT ALL ON marketing.body_copy_segment TO authenticated;
GRANT ALL ON marketing.ad_segment TO authenticated;

-- Seed starting segments
INSERT INTO marketing.segment (name) VALUES
  ('Digital Nomad'),
  ('Vegans'),
  ('Sober People');
```

**Step 2: Push to Supabase**

Run: `npx supabase db push --linked`
Expected: Migration applies successfully, 5 tables created, 3 segments seeded.

**Step 3: Commit**

```
git add supabase/migrations/00007_segments.sql
git commit -m "Add segment tables and seed data"
```

---

### Task 2: Data Access Layer (db.js)

**Files:**
- Modify: `app/db.js`

**Step 1: Add segment CRUD functions**

After the Tags section (~line 92), add:

```javascript
// --- Segments ---

async function getSegments(token) {
  const client = clientForRequest(token);
  const { data, error } = await client
    .from('segment')
    .select('*')
    .order('name');
  if (error) throw error;
  return data;
}

async function createSegment(name, token) {
  const client = clientForRequest(token);
  const { data, error } = await client
    .from('segment')
    .insert({ name })
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function updateSegment(id, name, token) {
  const client = clientForRequest(token);
  const { data, error } = await client
    .from('segment')
    .update({ name })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function deleteSegment(id, token) {
  const client = clientForRequest(token);
  const { error } = await client
    .from('segment')
    .delete()
    .eq('id', id);
  if (error) throw error;
}
```

**Step 2: Add segment assignment functions for all four entity types**

After the segment CRUD, add:

```javascript
// --- Segment assignments ---

async function addImageSegment(imageId, segmentId, token) {
  const client = clientForRequest(token);
  const { data, error } = await client
    .from('base_image_segment')
    .insert({ base_image_id: imageId, segment_id: segmentId })
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function removeImageSegment(imageId, segmentId, token) {
  const client = clientForRequest(token);
  const { error } = await client
    .from('base_image_segment')
    .delete()
    .eq('base_image_id', imageId)
    .eq('segment_id', segmentId);
  if (error) throw error;
}

async function addCaptionSegment(captionId, segmentId, token) {
  const client = clientForRequest(token);
  const { data, error } = await client
    .from('caption_segment')
    .insert({ caption_id: captionId, segment_id: segmentId })
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function removeCaptionSegment(captionId, segmentId, token) {
  const client = clientForRequest(token);
  const { error } = await client
    .from('caption_segment')
    .delete()
    .eq('caption_id', captionId)
    .eq('segment_id', segmentId);
  if (error) throw error;
}

async function addBodyCopySegment(bodyId, segmentId, token) {
  const client = clientForRequest(token);
  const { data, error } = await client
    .from('body_copy_segment')
    .insert({ body_copy_id: bodyId, segment_id: segmentId })
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function removeBodyCopySegment(bodyId, segmentId, token) {
  const client = clientForRequest(token);
  const { error } = await client
    .from('body_copy_segment')
    .delete()
    .eq('body_copy_id', bodyId)
    .eq('segment_id', segmentId);
  if (error) throw error;
}

async function addAdSegment(adId, segmentId, token) {
  const client = clientForRequest(token);
  const { data, error } = await client
    .from('ad_segment')
    .insert({ ad_id: adId, segment_id: segmentId })
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function removeAdSegment(adId, segmentId, token) {
  const client = clientForRequest(token);
  const { error } = await client
    .from('ad_segment')
    .delete()
    .eq('ad_id', adId)
    .eq('segment_id', segmentId);
  if (error) throw error;
}
```

**Step 3: Update getImages to include segment joins**

Change the `getImages` select to also join `base_image_segment`:

```javascript
// In getImages, change .select() to:
.select('*, base_image_tag(tag_id, tag:tag_id(id, name)), base_image_segment(segment_id, segment:segment_id(id, name)), generation_prompt:generation_prompt_id(id, type, prompt, created_at)')

// In the .map(), extract segments alongside tags:
return data.map(row => {
  const tags = (row.base_image_tag || []).map(jt => jt.tag).filter(Boolean);
  const segments = (row.base_image_segment || []).map(js => js.segment).filter(Boolean);
  const { base_image_tag, base_image_segment, ...rest } = row;
  return { ...rest, tags, segments };
});
```

**Step 4: Update getCaptions to include segment joins**

Same pattern — join `caption_segment`:

```javascript
// In getCaptions, change .select() to:
.select('*, caption_tag(tag_id, tag:tag_id(id, name)), caption_segment(segment_id, segment:segment_id(id, name)), generation_prompt:generation_prompt_id(id, type, prompt, created_at)')

// In the .map():
return data.map(row => {
  const tags = (row.caption_tag || []).map(jt => jt.tag).filter(Boolean);
  const segments = (row.caption_segment || []).map(js => js.segment).filter(Boolean);
  const { caption_tag, caption_segment, ...rest } = row;
  return { ...rest, tags, segments };
});
```

**Step 5: Update getBodyCopy to include segment joins**

```javascript
// In getBodyCopy, change .select() to:
.select('*, body_copy_tag(tag_id, tag:tag_id(id, name)), body_copy_segment(segment_id, segment:segment_id(id, name))')

// In the .map():
return data.map(row => {
  const tags = (row.body_copy_tag || []).map(jt => jt.tag).filter(Boolean);
  const segments = (row.body_copy_segment || []).map(js => js.segment).filter(Boolean);
  const { body_copy_tag, body_copy_segment, ...rest } = row;
  return { ...rest, tags, segments };
});
```

**Step 6: Update getAds to include segment joins**

```javascript
// In getAds, change .select() to:
.select('*, base_image:base_image_id(*), caption:caption_id(*), body_copy:body_copy_id(*), ad_set:ad_set_id(id, name), ad_segment(segment_id, segment:segment_id(id, name))')

// After the query, map to extract segments:
return data.map(row => {
  const segments = (row.ad_segment || []).map(js => js.segment).filter(Boolean);
  const { ad_segment, ...rest } = row;
  return { ...rest, segments };
});
```

**Step 7: Add all new functions to module.exports**

Add to the exports object:

```javascript
// Segments
getSegments,
createSegment,
updateSegment,
deleteSegment,
addImageSegment,
removeImageSegment,
addCaptionSegment,
removeCaptionSegment,
addBodyCopySegment,
removeBodyCopySegment,
addAdSegment,
removeAdSegment,
```

**Step 8: Verify the server starts**

Run: `cd app && node -e "require('./db')"`
Expected: No syntax errors.

**Step 9: Commit**

```
git add app/db.js
git commit -m "Add segment data access functions and join queries"
```

---

### Task 3: Server Routes

**Files:**
- Modify: `app/server.js`

**Step 1: Add segment CRUD routes**

After the Tags routes section (~line 67), add:

```javascript
// --- Segments ---

app.get('/api/segments', requireAuth, async (req, res) => {
  try { res.json(await db.getSegments(req.token)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/segments', requireAuth, async (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });
  try { res.json(await db.createSegment(name, req.token)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/segments/:id', requireAuth, async (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });
  try { res.json(await db.updateSegment(req.params.id, name, req.token)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/segments/:id', requireAuth, async (req, res) => {
  try { await db.deleteSegment(req.params.id, req.token); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
```

**Step 2: Add segment assignment routes for images**

After the existing image tag routes (~line 105), add:

```javascript
app.post('/api/images/:id/segments', requireAuth, async (req, res) => {
  const { segment_id } = req.body;
  if (!segment_id) return res.status(400).json({ error: 'segment_id is required' });
  try { res.json(await db.addImageSegment(req.params.id, segment_id, req.token)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/images/:id/segments/:segmentId', requireAuth, async (req, res) => {
  try { await db.removeImageSegment(req.params.id, req.params.segmentId, req.token); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
```

**Step 3: Add segment assignment routes for captions**

After existing caption tag routes (~line 143), add:

```javascript
app.post('/api/captions/:id/segments', requireAuth, async (req, res) => {
  const { segment_id } = req.body;
  if (!segment_id) return res.status(400).json({ error: 'segment_id is required' });
  try { res.json(await db.addCaptionSegment(req.params.id, segment_id, req.token)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/captions/:id/segments/:segmentId', requireAuth, async (req, res) => {
  try { await db.removeCaptionSegment(req.params.id, req.params.segmentId, req.token); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
```

**Step 4: Add segment assignment routes for body copy**

After existing body copy tag routes (~line 181), add:

```javascript
app.post('/api/body-copy/:id/segments', requireAuth, async (req, res) => {
  const { segment_id } = req.body;
  if (!segment_id) return res.status(400).json({ error: 'segment_id is required' });
  try { res.json(await db.addBodyCopySegment(req.params.id, segment_id, req.token)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/body-copy/:id/segments/:segmentId', requireAuth, async (req, res) => {
  try { await db.removeBodyCopySegment(req.params.id, req.params.segmentId, req.token); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
```

**Step 5: Add segment assignment routes for ads**

After the existing ads PUT route (~line 240), add:

```javascript
app.post('/api/ads/:id/segments', requireAuth, async (req, res) => {
  const { segment_id } = req.body;
  if (!segment_id) return res.status(400).json({ error: 'segment_id is required' });
  try { res.json(await db.addAdSegment(req.params.id, segment_id, req.token)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/ads/:id/segments/:segmentId', requireAuth, async (req, res) => {
  try { await db.removeAdSegment(req.params.id, req.params.segmentId, req.token); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
```

**Step 6: Commit**

```
git add app/server.js
git commit -m "Add segment API routes"
```

---

### Task 4: Frontend — State, Data Loading, Filter Bar

**Files:**
- Modify: `app/index.html`

This is the biggest task. Breaking into sub-steps.

**Step 1: Add CSS for the segment filter bar**

After the existing `.tabs` styles (~line 130), add:

```css
/* --- Segment filter bar --- */
.segment-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  background: var(--warm-white);
  border-bottom: 1px solid var(--light-gray);
  flex-wrap: wrap;
  min-height: 40px;
}

.segment-pill {
  font-family: var(--font-body);
  font-size: 12px;
  font-weight: 400;
  padding: 4px 12px;
  border-radius: 14px;
  border: 1px solid var(--light-gray);
  background: transparent;
  color: var(--warm-gray);
  cursor: pointer;
  transition: all 0.15s;
  white-space: nowrap;
  position: relative;
}

.segment-pill:hover {
  border-color: var(--amber);
  color: var(--amber-dark);
}

.segment-pill.active {
  background: var(--charcoal);
  color: var(--cream);
  border-color: var(--charcoal);
  font-weight: 600;
}

.segment-pill.drag-over {
  background: var(--amber-light);
  border-color: var(--amber);
  color: var(--amber-dark);
}

.segment-pill-add {
  font-size: 14px;
  padding: 2px 10px;
  border: 1px dashed var(--light-gray);
  border-radius: 14px;
  background: transparent;
  color: var(--warm-gray);
  cursor: pointer;
  transition: all 0.15s;
}

.segment-pill-add:hover {
  border-color: var(--amber);
  color: var(--amber-dark);
}

.segment-add-input {
  font-family: var(--font-body);
  font-size: 12px;
  padding: 4px 10px;
  border: 1px solid var(--amber);
  border-radius: 14px;
  background: #fff;
  color: var(--charcoal);
  outline: none;
  width: 140px;
}

.segment-pill-menu {
  position: absolute;
  top: 100%;
  left: 0;
  margin-top: 4px;
  background: #fff;
  border: 1px solid var(--light-gray);
  border-radius: var(--radius);
  box-shadow: var(--shadow-md);
  z-index: 50;
  min-width: 100px;
  overflow: hidden;
}

.segment-pill-menu button {
  display: block;
  width: 100%;
  padding: 6px 12px;
  border: none;
  background: transparent;
  font-family: var(--font-body);
  font-size: 12px;
  color: var(--charcoal);
  cursor: pointer;
  text-align: left;
}

.segment-pill-menu button:hover {
  background: var(--cream);
}

.segment-pill-menu button.danger {
  color: var(--red);
}
```

**Step 2: Add CSS for segment chips on cards (distinct from tag chips)**

```css
.segment-chip {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 10px;
  font-weight: 600;
  padding: 1px 8px;
  border-radius: 10px;
  background: rgba(200, 149, 108, 0.15);
  color: var(--amber-dark);
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.segment-chip .remove-seg {
  cursor: pointer;
  opacity: 0.5;
  font-size: 12px;
  line-height: 1;
}

.segment-chip .remove-seg:hover {
  opacity: 1;
}
```

**Step 3: Add segment bar HTML**

In the HTML, after the `.tabs` div (line 1001) and before `.tab-content` (line 1003), add:

```html
<div class="segment-bar" id="segment-bar"></div>
```

**Step 4: Update STATE and loadData**

In the JS STATE declaration (~line 1044), add `segments`:

```javascript
let STATE = { images: [], captions: [], bodyCopy: [], ads: [], adSets: [], tags: [], segments: [] };
```

Add a `activeSegment` variable after the STATE line:

```javascript
let activeSegment = 'all'; // 'all', 'generic', or a segment UUID
```

In `loadData` (~line 1206), add segments to the Promise.all:

```javascript
const [images, captions, bodyCopy, ads, adSets, tags, segments] = await Promise.all([
  authFetch('/api/images').then(r => r.json()),
  authFetch('/api/captions').then(r => r.json()),
  authFetch('/api/body-copy').then(r => r.json()),
  authFetch('/api/ads').then(r => r.json()),
  authFetch('/api/ad-sets').then(r => r.json()),
  authFetch('/api/tags').then(r => r.json()),
  authFetch('/api/segments').then(r => r.json()),
]);
STATE = { images, captions, bodyCopy, ads, adSets, tags, segments };
```

**Step 5: Add segment filtering helper**

After the `escapeHtml` function (~line 1081), add:

```javascript
function filterBySegment(items) {
  if (activeSegment === 'all') return items;
  if (activeSegment === 'generic') return items.filter(item => !item.segments || item.segments.length === 0);
  return items.filter(item => (item.segments || []).some(s => s.id === activeSegment));
}
```

**Step 6: Add renderSegmentBar function**

After the `render` function (~line 1258), add:

```javascript
function renderSegmentBar() {
  const $bar = document.getElementById('segment-bar');
  let html = '<button class="segment-pill' + (activeSegment === 'all' ? ' active' : '') + '" data-segment="all">All</button>';
  html += '<button class="segment-pill' + (activeSegment === 'generic' ? ' active' : '') + '" data-segment="generic">Generic</button>';

  for (const seg of STATE.segments) {
    html += '<button class="segment-pill' + (activeSegment === seg.id ? ' active' : '') + '" data-segment="' + seg.id + '" data-segment-name="' + escapeHtml(seg.name) + '">'
      + escapeHtml(seg.name)
      + '</button>';
  }

  html += '<button class="segment-pill-add" id="segment-add-btn" title="Add segment">+</button>';
  $bar.innerHTML = html;

  // Click handlers for pills
  $bar.querySelectorAll('.segment-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      activeSegment = pill.dataset.segment;
      render();
      renderSegmentBar();
    });

    // Right-click context menu for real segments (not All/Generic)
    if (pill.dataset.segment !== 'all' && pill.dataset.segment !== 'generic') {
      pill.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        showSegmentMenu(pill, pill.dataset.segment, pill.dataset.segmentName);
      });
    }

    // Drop target for assigning items to segments
    if (pill.dataset.segment !== 'all' && pill.dataset.segment !== 'generic') {
      pill.addEventListener('dragover', (e) => {
        e.preventDefault();
        pill.classList.add('drag-over');
      });
      pill.addEventListener('dragleave', () => {
        pill.classList.remove('drag-over');
      });
      pill.addEventListener('drop', async (e) => {
        e.preventDefault();
        pill.classList.remove('drag-over');
        const segmentId = pill.dataset.segment;
        const imageId = e.dataTransfer.getData('application/image-id');
        const captionId = e.dataTransfer.getData('application/caption-id');
        const bodyCopyId = e.dataTransfer.getData('application/bodycopy-id');
        const adId = e.dataTransfer.getData('application/ad-id');
        try {
          if (imageId) await authFetch('/api/images/' + imageId + '/segments', { method: 'POST', body: { segment_id: segmentId } });
          if (captionId) await authFetch('/api/captions/' + captionId + '/segments', { method: 'POST', body: { segment_id: segmentId } });
          if (bodyCopyId) await authFetch('/api/body-copy/' + bodyCopyId + '/segments', { method: 'POST', body: { segment_id: segmentId } });
          if (adId) await authFetch('/api/ads/' + adId + '/segments', { method: 'POST', body: { segment_id: segmentId } });
          await loadData();
        } catch (err) {
          console.error('Assign segment failed:', err);
        }
      });
    }
  });

  // Add button
  document.getElementById('segment-add-btn').addEventListener('click', () => {
    const btn = document.getElementById('segment-add-btn');
    const input = document.createElement('input');
    input.className = 'segment-add-input';
    input.placeholder = 'Segment name...';
    btn.replaceWith(input);
    input.focus();

    async function submit() {
      const name = input.value.trim();
      if (name) {
        try {
          await authFetch('/api/segments', { method: 'POST', body: { name } });
          await loadData();
        } catch (err) {
          console.error('Create segment failed:', err);
        }
      }
      renderSegmentBar();
    }
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') submit();
      if (e.key === 'Escape') renderSegmentBar();
    });
    input.addEventListener('blur', submit);
  });
}

function showSegmentMenu(pill, segmentId, segmentName) {
  // Close any existing menu
  document.querySelectorAll('.segment-pill-menu').forEach(m => m.remove());

  const menu = document.createElement('div');
  menu.className = 'segment-pill-menu';
  menu.innerHTML = '<button data-action="rename">Rename</button>'
    + '<button data-action="delete" class="danger">Delete</button>';
  pill.style.position = 'relative';
  pill.appendChild(menu);

  menu.querySelector('[data-action="rename"]').addEventListener('click', async (e) => {
    e.stopPropagation();
    menu.remove();
    const newName = prompt('Rename segment:', segmentName);
    if (newName && newName.trim() && newName.trim() !== segmentName) {
      try {
        await authFetch('/api/segments/' + segmentId, { method: 'PUT', body: { name: newName.trim() } });
        await loadData();
      } catch (err) {
        console.error('Rename segment failed:', err);
      }
    }
  });

  menu.querySelector('[data-action="delete"]').addEventListener('click', async (e) => {
    e.stopPropagation();
    menu.remove();
    if (confirm('Delete segment "' + segmentName + '"? Items won\'t be deleted, just unassigned.')) {
      try {
        if (activeSegment === segmentId) activeSegment = 'all';
        await authFetch('/api/segments/' + segmentId, { method: 'DELETE' });
        await loadData();
      } catch (err) {
        console.error('Delete segment failed:', err);
      }
    }
  });

  // Close on click outside
  setTimeout(() => {
    document.addEventListener('click', function closeMenu(e) {
      if (!menu.contains(e.target)) {
        menu.remove();
        document.removeEventListener('click', closeMenu);
      }
    });
  }, 0);
}
```

**Step 7: Call renderSegmentBar from render()**

Update the `render` function to include `renderSegmentBar()`:

```javascript
function render() {
  renderSegmentBar();
  renderImages();
  renderCaptions();
  renderBodyCopy();
  renderCaptionStrip();
  renderGenerate();
  renderBuilder();
  renderAds();
}
```

**Step 8: Commit**

```
git add app/index.html
git commit -m "Add segment filter bar with state, filtering, and management"
```

---

### Task 5: Frontend — Segment Filtering in Render Functions

**Files:**
- Modify: `app/index.html`

**Step 1: Filter images in renderImages**

At the top of `renderImages()`, apply the segment filter:

```javascript
function renderImages() {
  const filtered = filterBySegment(STATE.images);
  // Replace all references to STATE.images with filtered in this function
```

Change `if (STATE.images.length === 0)` to `if (filtered.length === 0)` and the loop to use `filtered` instead of `STATE.images`. Keep the grouping logic but operate on `filtered`.

**Step 2: Filter captions in renderCaptions**

Same pattern — `const filtered = filterBySegment(STATE.captions);` at top, use `filtered` for rendering.

**Step 3: Filter body copy in renderBodyCopy**

Same pattern — `const filtered = filterBySegment(STATE.bodyCopy);`.

**Step 4: Filter ads in renderAds**

Same pattern — `const filtered = filterBySegment(STATE.ads);` for both the Ads tab and the right panel.

**Step 5: Commit**

```
git add app/index.html
git commit -m "Apply segment filter to all library panel render functions"
```

---

### Task 6: Frontend — Segment Chips on Cards + Drag for Captions/Body Copy/Ads

**Files:**
- Modify: `app/index.html`

**Step 1: Add segment chips to image cards**

In `renderImageGrid`, after the tags HTML, add segment chips:

```javascript
const segHtml = (img.segments || []).map(s =>
  '<span class="segment-chip">' + escapeHtml(s.name)
  + ' <span class="remove-seg" onclick="window.__removeImageSegment(\'' + img.id + '\', \'' + s.id + '\')">&times;</span>'
  + '</span>'
).join('');
// Add segHtml into the card HTML after tagsHtml
```

**Step 2: Add segment chips to caption cards**

Same pattern in `renderCaptionCards`:

```javascript
const segHtml = (cap.segments || []).map(s =>
  '<span class="segment-chip">' + escapeHtml(s.name)
  + ' <span class="remove-seg" onclick="window.__removeCaptionSegment(\'' + cap.id + '\', \'' + s.id + '\')">&times;</span>'
  + '</span>'
).join('');
```

**Step 3: Add segment chips to body copy cards**

Same pattern in the body copy render.

**Step 4: Add segment chips to ad cards**

In `renderAdCard`, after the status section, add segment chips:

```javascript
const adSegHtml = (ad.segments || []).map(s =>
  '<span class="segment-chip">' + escapeHtml(s.name)
  + ' <span class="remove-seg" onclick="window.__removeAdSegment(\'' + ad.id + '\', \'' + s.id + '\')">&times;</span>'
  + '</span>'
).join('');
if (adSegHtml) {
  html += '<div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:8px">' + adSegHtml + '</div>';
}
```

**Step 5: Add draggable to caption and body copy cards**

Caption cards already have `draggable="true"` with `data-caption-id`. Add dragstart for the `application/caption-id` type. Body copy cards need `draggable="true"` added, with `data-bodycopy-id` and dragstart for `application/bodycopy-id`. Ad cards need `draggable="true"` with `data-ad-id` and `application/ad-id`.

**Step 6: Add global segment removal handlers**

```javascript
window.__removeImageSegment = async function(imageId, segmentId) {
  try {
    await authFetch('/api/images/' + imageId + '/segments/' + segmentId, { method: 'DELETE' });
    await loadData();
  } catch (err) { console.error('Remove image segment failed:', err); }
};

window.__removeCaptionSegment = async function(captionId, segmentId) {
  try {
    await authFetch('/api/captions/' + captionId + '/segments/' + segmentId, { method: 'DELETE' });
    await loadData();
  } catch (err) { console.error('Remove caption segment failed:', err); }
};

window.__removeBodyCopySegment = async function(bodyId, segmentId) {
  try {
    await authFetch('/api/body-copy/' + bodyId + '/segments/' + segmentId, { method: 'DELETE' });
    await loadData();
  } catch (err) { console.error('Remove body copy segment failed:', err); }
};

window.__removeAdSegment = async function(adId, segmentId) {
  try {
    await authFetch('/api/ads/' + adId + '/segments/' + segmentId, { method: 'DELETE' });
    await loadData();
  } catch (err) { console.error('Remove ad segment failed:', err); }
};
```

**Step 7: Ensure caption drag handlers set the right data type**

In `renderCaptions`, the existing dragstart handlers should already be setting `application/caption-id`. Verify and add `application/bodycopy-id` for body copy cards and `application/ad-id` for ad cards.

**Step 8: Commit**

```
git add app/index.html
git commit -m "Add segment chips on cards and drag-to-assign for all entity types"
```

---

### Task 7: Manual Smoke Test

**Step 1: Start the app**

Run: `./app/start.sh`

**Step 2: Verify in browser**

- [ ] Segment bar appears below tabs with "All", "Generic", "Digital Nomad", "Vegans", "Sober People", "+"
- [ ] Clicking a segment filters all panels
- [ ] "Generic" shows only items with no segments
- [ ] "All" shows everything
- [ ] Drag an image card onto a segment pill → assigns it
- [ ] Segment chip appears on the card
- [ ] Click x on segment chip → removes assignment
- [ ] Right-click segment pill → rename/delete menu works
- [ ] "+" button → inline input → creates new segment
- [ ] Drag a caption onto a segment → assigns it
- [ ] Ad cards show segment chips

**Step 3: Final commit if any fixes needed**

---

### Task 8: Update Memory

**Files:**
- Modify: `/Users/ryan/.claude/projects/-Users-ryan-dinner-matcher-marketing/memory/MEMORY.md`

Update the Data Model section to mention segments. Add `segment` + 4 join tables to the table list.
