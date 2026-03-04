# App Simplification Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the segment-centric marketing app with a simpler model: base images, captions, body copy, and ads that mirror Meta's ad hierarchy. Enable drag-and-drop ad creation in the UI.

**Architecture:** New Supabase schema with 9 tables (tag, base_image, caption, body_copy, ad_set, ad, + 3 join tables). Same Express + vanilla JS stack. Server shells out to `claude -p` for image compositing via Nano Banana MCP. CLI updated for new entities.

**Tech Stack:** Node.js/Express, Supabase (Postgres + Storage + Realtime), Deno CLI, Claude Code + Nano Banana MCP for image generation

**Design doc:** `docs/plans/2026-03-04-app-simplification-design.md`

---

### Task 1: Database Migration

**Files:**
- Create: `supabase/migrations/00004_simplify_schema.sql`

**Step 1: Write migration SQL**

Create `supabase/migrations/00004_simplify_schema.sql`:

```sql
-- Simplify schema: replace segment-centric model with
-- base images + captions + body copy + ads (mirrors Meta hierarchy)

-- 1. New tables

CREATE TABLE marketing.tag (
  id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE
);

CREATE TABLE marketing.base_image (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  filename     text NOT NULL,
  storage_path text NOT NULL UNIQUE,
  prompt       text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE marketing.caption (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  text       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE marketing.body_copy (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  text       text NOT NULL,
  headline   text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE marketing.ad_set (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  status     text NOT NULL DEFAULT 'paused',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE marketing.ad (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ad_set_id             uuid REFERENCES marketing.ad_set(id) ON DELETE SET NULL,
  base_image_id         uuid NOT NULL REFERENCES marketing.base_image(id),
  caption_id            uuid REFERENCES marketing.caption(id) ON DELETE SET NULL,
  body_copy_id          uuid REFERENCES marketing.body_copy(id) ON DELETE SET NULL,
  composited_image_path text,
  generation_prompt     text,
  desired_status        text NOT NULL DEFAULT 'draft',
  meta_status           text,
  meta_ad_id            text,
  feedback              text,
  created_at            timestamptz NOT NULL DEFAULT now()
);

-- Join tables for tagging
CREATE TABLE marketing.base_image_tag (
  base_image_id uuid NOT NULL REFERENCES marketing.base_image(id) ON DELETE CASCADE,
  tag_id        uuid NOT NULL REFERENCES marketing.tag(id) ON DELETE CASCADE,
  PRIMARY KEY (base_image_id, tag_id)
);

CREATE TABLE marketing.caption_tag (
  caption_id uuid NOT NULL REFERENCES marketing.caption(id) ON DELETE CASCADE,
  tag_id     uuid NOT NULL REFERENCES marketing.tag(id) ON DELETE CASCADE,
  PRIMARY KEY (caption_id, tag_id)
);

CREATE TABLE marketing.body_copy_tag (
  body_copy_id uuid NOT NULL REFERENCES marketing.body_copy(id) ON DELETE CASCADE,
  tag_id       uuid NOT NULL REFERENCES marketing.tag(id) ON DELETE CASCADE,
  PRIMARY KEY (body_copy_id, tag_id)
);

-- 2. RLS

ALTER TABLE marketing.tag ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing.base_image ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing.caption ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing.body_copy ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing.ad_set ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing.ad ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing.base_image_tag ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing.caption_tag ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing.body_copy_tag ENABLE ROW LEVEL SECURITY;

-- Authenticated full access on all tables
CREATE POLICY "auth_all" ON marketing.tag FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all" ON marketing.base_image FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all" ON marketing.caption FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all" ON marketing.body_copy FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all" ON marketing.ad_set FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all" ON marketing.ad FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all" ON marketing.base_image_tag FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all" ON marketing.caption_tag FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all" ON marketing.body_copy_tag FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 3. Migrate data

-- Images: carry over non-composited images
INSERT INTO marketing.base_image (id, filename, storage_path, prompt, created_at)
SELECT id, filename, storage_path, prompt, COALESCE(created_at, now())
FROM marketing.creative_image
WHERE type IS NULL OR type = 'base';

-- Tags: create from existing segment slugs
INSERT INTO marketing.tag (name)
SELECT DISTINCT segment_slug FROM marketing.creative_image
WHERE segment_slug IS NOT NULL
ON CONFLICT (name) DO NOTHING;

-- Tag the migrated images with their segment
INSERT INTO marketing.base_image_tag (base_image_id, tag_id)
SELECT bi.id, t.id
FROM marketing.base_image bi
JOIN marketing.creative_image ci ON ci.id = bi.id
JOIN marketing.tag t ON t.name = ci.segment_slug
WHERE ci.segment_slug IS NOT NULL;

-- 4. Realtime on ad table
ALTER PUBLICATION supabase_realtime ADD TABLE marketing.ad;

-- 5. Drop old tables (CASCADE handles FK deps)
DROP TABLE IF EXISTS marketing.image_review CASCADE;
DROP TABLE IF EXISTS marketing.ad_campaign_status CASCADE;
DROP TABLE IF EXISTS marketing.creative_image CASCADE;
DROP TABLE IF EXISTS marketing.segment CASCADE;
```

**Step 2: Push migration**

Run: `supabase db push --db-url "$SUPABASE_DB_URL"`

Expected: `Applying migration 00004_simplify_schema.sql...` with no errors.

**Step 3: Verify tables exist**

Run: `psql "$SUPABASE_DB_URL" -c "SELECT table_name FROM information_schema.tables WHERE table_schema = 'marketing' ORDER BY table_name;"`

Expected output should list: `ad`, `ad_set`, `base_image`, `base_image_tag`, `body_copy`, `body_copy_tag`, `caption`, `caption_tag`, `tag`

Also verify image migration:
Run: `psql "$SUPABASE_DB_URL" -c "SELECT count(*) FROM marketing.base_image;"`

Expected: non-zero count matching the old creative_image base rows.

**Step 4: Commit**

```bash
git add supabase/migrations/00004_simplify_schema.sql
git commit -m "Add migration: simplified schema with images, captions, body copy, ads"
```

---

### Task 2: Server Data Layer (db.js)

**Files:**
- Rewrite: `app/db.js`

**Context:** The old db.js has functions for segments, reviews, and ad statuses. Replace entirely with functions for the new entities. Keep the same patterns: `init()`, `clientForRequest(token)`, `getRealtimeClient()`.

**Step 1: Rewrite app/db.js**

```javascript
/**
 * Data access layer for the Ad Manager app.
 * All state lives in Supabase. Per-request clients enforce RLS.
 */

let supabaseUrl = null;
let supabaseAnonKey = null;
let storageBaseUrl = null;
let _realtimeClient = null;

function init() {
  supabaseUrl = process.env.SUPABASE_URL;
  supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('SUPABASE_URL and SUPABASE_ANON_KEY are required');
    process.exit(1);
  }
  storageBaseUrl = `${supabaseUrl}/storage/v1/object/public/creative`;
  console.log(`Supabase: ${supabaseUrl}`);
}

function getStorageBaseUrl() { return storageBaseUrl; }

function clientForRequest(token) {
  const { createClient } = require('@supabase/supabase-js');
  return createClient(supabaseUrl, supabaseAnonKey, {
    db: { schema: 'marketing' },
    global: { headers: { Authorization: `Bearer ${token}` } }
  });
}

function getRealtimeClient() {
  if (!_realtimeClient) {
    const { createClient } = require('@supabase/supabase-js');
    _realtimeClient = createClient(supabaseUrl, supabaseAnonKey, {
      db: { schema: 'marketing' }
    });
  }
  return _realtimeClient;
}

// --- Tags ---

async function getTags(token) {
  const c = clientForRequest(token);
  const { data, error } = await c.from('tag').select('*').order('name');
  if (error) throw error;
  return data;
}

async function createTag(name, token) {
  const c = clientForRequest(token);
  const { data, error } = await c.from('tag').insert({ name }).select().single();
  if (error) throw error;
  return data;
}

async function deleteTag(id, token) {
  const c = clientForRequest(token);
  const { error } = await c.from('tag').delete().eq('id', id);
  if (error) throw error;
}

// --- Base Images ---

async function getImages(token) {
  const c = clientForRequest(token);
  const { data: images, error } = await c
    .from('base_image')
    .select('*, base_image_tag(tag_id, tag:tag_id(id, name))')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return images.map(img => ({
    ...img,
    tags: (img.base_image_tag || []).map(t => t.tag).filter(Boolean),
    base_image_tag: undefined
  }));
}

async function createImage(data, token) {
  const c = clientForRequest(token);
  const { data: img, error } = await c.from('base_image').insert(data).select().single();
  if (error) throw error;
  return img;
}

async function deleteImage(id, token) {
  const c = clientForRequest(token);
  const { error } = await c.from('base_image').delete().eq('id', id);
  if (error) throw error;
}

async function addImageTag(imageId, tagId, token) {
  const c = clientForRequest(token);
  const { error } = await c.from('base_image_tag').insert({ base_image_id: imageId, tag_id: tagId });
  if (error) throw error;
}

async function removeImageTag(imageId, tagId, token) {
  const c = clientForRequest(token);
  const { error } = await c.from('base_image_tag').delete()
    .eq('base_image_id', imageId).eq('tag_id', tagId);
  if (error) throw error;
}

// --- Captions ---

async function getCaptions(token) {
  const c = clientForRequest(token);
  const { data: captions, error } = await c
    .from('caption')
    .select('*, caption_tag(tag_id, tag:tag_id(id, name))')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return captions.map(cap => ({
    ...cap,
    tags: (cap.caption_tag || []).map(t => t.tag).filter(Boolean),
    caption_tag: undefined
  }));
}

async function createCaption(text, token) {
  const c = clientForRequest(token);
  const { data, error } = await c.from('caption').insert({ text }).select().single();
  if (error) throw error;
  return data;
}

async function updateCaption(id, text, token) {
  const c = clientForRequest(token);
  const { data, error } = await c.from('caption').update({ text }).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

async function deleteCaption(id, token) {
  const c = clientForRequest(token);
  const { error } = await c.from('caption').delete().eq('id', id);
  if (error) throw error;
}

async function addCaptionTag(captionId, tagId, token) {
  const c = clientForRequest(token);
  const { error } = await c.from('caption_tag').insert({ caption_id: captionId, tag_id: tagId });
  if (error) throw error;
}

async function removeCaptionTag(captionId, tagId, token) {
  const c = clientForRequest(token);
  const { error } = await c.from('caption_tag').delete()
    .eq('caption_id', captionId).eq('tag_id', tagId);
  if (error) throw error;
}

// --- Body Copy ---

async function getBodyCopy(token) {
  const c = clientForRequest(token);
  const { data: rows, error } = await c
    .from('body_copy')
    .select('*, body_copy_tag(tag_id, tag:tag_id(id, name))')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return rows.map(row => ({
    ...row,
    tags: (row.body_copy_tag || []).map(t => t.tag).filter(Boolean),
    body_copy_tag: undefined
  }));
}

async function createBodyCopy(data, token) {
  const c = clientForRequest(token);
  const { data: row, error } = await c.from('body_copy').insert(data).select().single();
  if (error) throw error;
  return row;
}

async function updateBodyCopy(id, data, token) {
  const c = clientForRequest(token);
  const { data: row, error } = await c.from('body_copy').update(data).eq('id', id).select().single();
  if (error) throw error;
  return row;
}

async function deleteBodyCopy(id, token) {
  const c = clientForRequest(token);
  const { error } = await c.from('body_copy').delete().eq('id', id);
  if (error) throw error;
}

async function addBodyCopyTag(bodyId, tagId, token) {
  const c = clientForRequest(token);
  const { error } = await c.from('body_copy_tag').insert({ body_copy_id: bodyId, tag_id: tagId });
  if (error) throw error;
}

async function removeBodyCopyTag(bodyId, tagId, token) {
  const c = clientForRequest(token);
  const { error } = await c.from('body_copy_tag').delete()
    .eq('body_copy_id', bodyId).eq('tag_id', tagId);
  if (error) throw error;
}

// --- Ad Sets ---

async function getAdSets(token) {
  const c = clientForRequest(token);
  const { data, error } = await c.from('ad_set').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

async function createAdSet(name, token) {
  const c = clientForRequest(token);
  const { data, error } = await c.from('ad_set').insert({ name }).select().single();
  if (error) throw error;
  return data;
}

async function updateAdSet(id, data, token) {
  const c = clientForRequest(token);
  const { data: row, error } = await c.from('ad_set').update(data).eq('id', id).select().single();
  if (error) throw error;
  return row;
}

async function deleteAdSet(id, token) {
  const c = clientForRequest(token);
  const { error } = await c.from('ad_set').delete().eq('id', id);
  if (error) throw error;
}

// --- Ads ---

async function getAds(token) {
  const c = clientForRequest(token);
  const { data, error } = await c
    .from('ad')
    .select('*, base_image:base_image_id(*), caption:caption_id(*), body_copy:body_copy_id(*), ad_set:ad_set_id(id, name)')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

async function createAd(data, token) {
  const c = clientForRequest(token);
  const { data: row, error } = await c.from('ad').insert(data).select().single();
  if (error) throw error;
  return row;
}

async function updateAd(id, data, token) {
  const c = clientForRequest(token);
  const { data: row, error } = await c.from('ad').update(data).eq('id', id).select().single();
  if (error) throw error;
  return row;
}

async function deleteAd(id, token) {
  const c = clientForRequest(token);
  const { error } = await c.from('ad').delete().eq('id', id);
  if (error) throw error;
}

module.exports = {
  init, getStorageBaseUrl, getRealtimeClient,
  // Tags
  getTags, createTag, deleteTag,
  // Images
  getImages, createImage, deleteImage, addImageTag, removeImageTag,
  // Captions
  getCaptions, createCaption, updateCaption, deleteCaption, addCaptionTag, removeCaptionTag,
  // Body Copy
  getBodyCopy, createBodyCopy, updateBodyCopy, deleteBodyCopy, addBodyCopyTag, removeBodyCopyTag,
  // Ad Sets
  getAdSets, createAdSet, updateAdSet, deleteAdSet,
  // Ads
  getAds, createAd, updateAd, deleteAd,
};
```

**Step 2: Verify syntax**

Run: `node -e "require('./app/db')"`

Expected: no errors (module loads but init() is not called so no env var error).

**Step 3: Commit**

```bash
git add app/db.js
git commit -m "Rewrite db.js for simplified schema (images, captions, body copy, ads)"
```

---

### Task 3: Server Routes (server.js)

**Files:**
- Rewrite: `app/server.js`

**Context:** Replace segment-centric routes with CRUD routes for new entities. Keep: Express, auth middleware, SSE realtime, static file serving. The generation endpoint (Task 7) is a stub here — just the route signature.

**Step 1: Rewrite app/server.js**

```javascript
const express = require('express');
const path = require('path');
const db = require('./db');

db.init();

const app = express();
const PORT = process.env.PORT || 8642;

app.use(express.json());

// --- Auth config (public) ---
app.get('/api/config', (req, res) => {
  res.json({
    supabaseUrl: process.env.SUPABASE_URL,
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY,
    storageBaseUrl: db.getStorageBaseUrl()
  });
});

// --- Auth middleware ---
async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  const token = authHeader.slice(7);
  const { createClient } = require('@supabase/supabase-js');
  const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } }
  });
  const { data: { user }, error } = await client.auth.getUser(token);
  if (error || !user) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
  req.user = user;
  req.token = token;
  next();
}

// --- Static ---
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

// --- Tags ---
app.get('/api/tags', requireAuth, async (req, res) => {
  try { res.json(await db.getTags(req.token)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/tags', requireAuth, async (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  try { res.json(await db.createTag(name, req.token)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/tags/:id', requireAuth, async (req, res) => {
  try { await db.deleteTag(req.params.id, req.token); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// --- Images ---
app.get('/api/images', requireAuth, async (req, res) => {
  try { res.json(await db.getImages(req.token)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/images', requireAuth, async (req, res) => {
  const { filename, storage_path, prompt } = req.body;
  if (!filename || !storage_path) return res.status(400).json({ error: 'filename and storage_path required' });
  try { res.json(await db.createImage({ filename, storage_path, prompt: prompt || null }, req.token)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/images/:id', requireAuth, async (req, res) => {
  try { await db.deleteImage(req.params.id, req.token); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/images/:id/tags', requireAuth, async (req, res) => {
  const { tag_id } = req.body;
  if (!tag_id) return res.status(400).json({ error: 'tag_id required' });
  try { await db.addImageTag(req.params.id, tag_id, req.token); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/images/:id/tags/:tagId', requireAuth, async (req, res) => {
  try { await db.removeImageTag(req.params.id, req.params.tagId, req.token); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// --- Captions ---
app.get('/api/captions', requireAuth, async (req, res) => {
  try { res.json(await db.getCaptions(req.token)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/captions', requireAuth, async (req, res) => {
  const { text } = req.body;
  if (!text) return res.status(400).json({ error: 'text required' });
  try { res.json(await db.createCaption(text, req.token)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/captions/:id', requireAuth, async (req, res) => {
  const { text } = req.body;
  if (!text) return res.status(400).json({ error: 'text required' });
  try { res.json(await db.updateCaption(req.params.id, text, req.token)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/captions/:id', requireAuth, async (req, res) => {
  try { await db.deleteCaption(req.params.id, req.token); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/captions/:id/tags', requireAuth, async (req, res) => {
  const { tag_id } = req.body;
  if (!tag_id) return res.status(400).json({ error: 'tag_id required' });
  try { await db.addCaptionTag(req.params.id, tag_id, req.token); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/captions/:id/tags/:tagId', requireAuth, async (req, res) => {
  try { await db.removeCaptionTag(req.params.id, req.params.tagId, req.token); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// --- Body Copy ---
app.get('/api/body-copy', requireAuth, async (req, res) => {
  try { res.json(await db.getBodyCopy(req.token)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/body-copy', requireAuth, async (req, res) => {
  const { text, headline } = req.body;
  if (!text) return res.status(400).json({ error: 'text required' });
  try { res.json(await db.createBodyCopy({ text, headline: headline || null }, req.token)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/body-copy/:id', requireAuth, async (req, res) => {
  const updates = {};
  if (req.body.text !== undefined) updates.text = req.body.text;
  if (req.body.headline !== undefined) updates.headline = req.body.headline;
  try { res.json(await db.updateBodyCopy(req.params.id, updates, req.token)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/body-copy/:id', requireAuth, async (req, res) => {
  try { await db.deleteBodyCopy(req.params.id, req.token); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/body-copy/:id/tags', requireAuth, async (req, res) => {
  const { tag_id } = req.body;
  if (!tag_id) return res.status(400).json({ error: 'tag_id required' });
  try { await db.addBodyCopyTag(req.params.id, tag_id, req.token); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/body-copy/:id/tags/:tagId', requireAuth, async (req, res) => {
  try { await db.removeBodyCopyTag(req.params.id, req.params.tagId, req.token); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// --- Ad Sets ---
app.get('/api/ad-sets', requireAuth, async (req, res) => {
  try { res.json(await db.getAdSets(req.token)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/ad-sets', requireAuth, async (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  try { res.json(await db.createAdSet(name, req.token)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/ad-sets/:id', requireAuth, async (req, res) => {
  const updates = {};
  if (req.body.name !== undefined) updates.name = req.body.name;
  if (req.body.status !== undefined) updates.status = req.body.status;
  try { res.json(await db.updateAdSet(req.params.id, updates, req.token)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/ad-sets/:id', requireAuth, async (req, res) => {
  try { await db.deleteAdSet(req.params.id, req.token); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// --- Ads ---
app.get('/api/ads', requireAuth, async (req, res) => {
  try { res.json(await db.getAds(req.token)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/ads', requireAuth, async (req, res) => {
  const { base_image_id, caption_id, body_copy_id, ad_set_id } = req.body;
  if (!base_image_id) return res.status(400).json({ error: 'base_image_id required' });
  try {
    res.json(await db.createAd({
      base_image_id,
      caption_id: caption_id || null,
      body_copy_id: body_copy_id || null,
      ad_set_id: ad_set_id || null,
    }, req.token));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/ads/:id', requireAuth, async (req, res) => {
  const allowed = ['ad_set_id', 'caption_id', 'body_copy_id', 'desired_status', 'feedback',
                    'composited_image_path', 'generation_prompt', 'meta_status', 'meta_ad_id'];
  const updates = {};
  for (const key of allowed) {
    if (req.body[key] !== undefined) updates[key] = req.body[key];
  }
  try { res.json(await db.updateAd(req.params.id, updates, req.token)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/ads/:id', requireAuth, async (req, res) => {
  try { await db.deleteAd(req.params.id, req.token); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// --- Generation endpoint (stub — Task 7 implements the claude -p logic) ---
app.post('/api/ads/:id/generate', requireAuth, async (req, res) => {
  res.status(501).json({ error: 'Generation not yet implemented' });
});

// --- SSE live reload via Supabase Realtime ---
const sseClients = new Set();

app.get('/api/events', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive'
  });
  res.write('data: connected\n\n');
  sseClients.add(res);
  req.on('close', () => sseClients.delete(res));
});

function broadcastReload() {
  for (const client of sseClients) {
    client.write('data: reload\n\n');
  }
}

db.getRealtimeClient()
  .channel('marketing-changes')
  .on('postgres_changes', { event: '*', schema: 'marketing', table: 'ad' }, () => broadcastReload())
  .subscribe();

app.listen(PORT, () => {
  console.log(`Ad manager: http://localhost:${PORT}`);
});
```

**Step 2: Verify server starts**

Run: `cd app && source ../.env && node -e "require('./server')" &` then kill it.

Or just check syntax: `node --check app/server.js`

**Step 3: Commit**

```bash
git add app/server.js
git commit -m "Rewrite server.js with CRUD routes for simplified schema"
```

---

### Task 4: Frontend — Layout, Auth & Data Loading

**Files:**
- Rewrite: `app/index.html`

**Context:** This is the biggest task. Rewrite the single-page app. This task creates the shell: HTML structure, CSS, auth flow, data loading, and tab switching. Tasks 5-6 add the panel content and interactions.

**Layout:**
```
+----------------------------------------------------------+
| Come Join Us — Ad Manager               [user] [Sign out] |
+-----------------------------+----------------------------+
| [Images] [Captions] [Copy] |  Ads                       |
|                             |                            |
| (active library panel)      |  (ad cards)                |
|                             |                            |
+-----------------------------+----------------------------+
```

Two columns: left (60%) for tabbed library panels, right (40%) for ads. Top bar with auth.

**Step 1: Write the HTML shell and CSS**

Create `app/index.html` with:

1. **CSS variables** — keep the existing design system (cream, amber, charcoal palette, fonts)
2. **Top bar** — brand + user info + sign out
3. **Two-column layout** — `.library-panel` (left) and `.ads-panel` (right)
4. **Tab bar** in library panel — Images | Captions | Body Copy
5. **Auth flow** — magic link login (same pattern as existing)
6. **Boot/init** — fetch config, check auth, load data
7. **Data loading** — parallel fetch of all entities
8. **Tab switching** — show/hide panels based on active tab
9. **SSE connection** — same pattern as existing

Key CSS for layout:
```css
.app-layout {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0;
  height: calc(100vh - 52px);
  margin-top: 52px;
}
.library-panel {
  border-right: 1px solid var(--light-gray);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.library-tabs {
  display: flex;
  border-bottom: 1px solid var(--light-gray);
  background: var(--warm-white);
}
.library-tab {
  flex: 1;
  padding: 12px;
  text-align: center;
  cursor: pointer;
  font-size: 13px;
  font-weight: 600;
  border-bottom: 2px solid transparent;
}
.library-tab.active {
  border-bottom-color: var(--amber);
  color: var(--amber-dark);
}
.library-content {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
}
.ads-panel {
  overflow-y: auto;
  padding: 20px;
}
```

Key JS for data loading:
```javascript
let STATE = { images: [], captions: [], bodyCopy: [], ads: [], adSets: [], tags: [] };
let storageBaseUrl = '';

async function authFetch(url, opts = {}) {
  const session = JSON.parse(localStorage.getItem('sb-session') || 'null');
  if (!session?.access_token) throw new Error('Not authenticated');
  return fetch(url, {
    ...opts,
    headers: { ...opts.headers, Authorization: `Bearer ${session.access_token}` }
  });
}

async function loadData() {
  const [images, captions, bodyCopy, ads, adSets, tags] = await Promise.all([
    authFetch('/api/images').then(r => r.json()),
    authFetch('/api/captions').then(r => r.json()),
    authFetch('/api/body-copy').then(r => r.json()),
    authFetch('/api/ads').then(r => r.json()),
    authFetch('/api/ad-sets').then(r => r.json()),
    authFetch('/api/tags').then(r => r.json()),
  ]);
  STATE = { images, captions, bodyCopy, ads, adSets, tags };
  render();
}
```

Key JS for auth (same magic link pattern as existing):
```javascript
async function showLogin(supabaseUrl, anonKey) {
  // Import Supabase client from CDN
  // Check for existing session
  // If valid session: call init()
  // If no session: render login form with magic link
  // On login success: store session, call init()
}
```

**Step 2: Verify the page loads**

Run: `./app/start.sh` and open http://localhost:8642

Expected: Login page appears. After login, empty library panels and ads panel with tab switching working. No data yet (panels are empty shells).

**Step 3: Commit**

```bash
git add app/index.html
git commit -m "Frontend scaffold: layout, auth, data loading, tab switching"
```

---

### Task 5: Frontend — Library Panels

**Files:**
- Modify: `app/index.html` (add rendering functions)

**Context:** Build out the three library panels. Each panel has: a list of items, an "add" form, tag chips, and delete buttons. Images show thumbnails. Captions and body copy show text.

**Image Panel:**
- Grid of image cards (thumbnail from storage URL + filename)
- Each card shows tags as small chips
- "Add Image" not needed yet (images come from CLI/skills) — but show an empty state message
- Delete button (with confirmation)
- Drop target for captions (handled in Task 6)

```javascript
function renderImagePanel() {
  const panel = document.getElementById('panel-images');
  if (!STATE.images.length) {
    panel.innerHTML = '<div class="empty-state">No images yet. Generate some with /creative or upload via CLI.</div>';
    return;
  }
  panel.innerHTML = STATE.images.map(img => `
    <div class="image-card" data-id="${img.id}" data-storage-path="${img.storage_path}">
      <img src="${storageBaseUrl}/${img.storage_path}" alt="${img.filename}" loading="lazy">
      <div class="image-card-info">
        <span class="image-filename">${img.filename}</span>
        <div class="tag-chips">
          ${img.tags.map(t => `<span class="tag-chip">${t.name}</span>`).join('')}
        </div>
      </div>
    </div>
  `).join('');
}
```

**Caption Panel:**
- List of caption cards (text displayed as a styled chip/block)
- Each caption is `draggable="true"` with `dragstart` setting the caption ID
- Add form: text input + submit button
- Edit inline (click to edit)
- Delete button
- Tag chips

```javascript
function renderCaptionPanel() {
  const panel = document.getElementById('panel-captions');
  panel.innerHTML = `
    <form class="add-form" id="add-caption-form">
      <input type="text" placeholder="New caption..." class="add-input" required>
      <button type="submit" class="add-btn">Add</button>
    </form>
    <div class="caption-list">
      ${STATE.captions.map(cap => `
        <div class="caption-card" draggable="true" data-id="${cap.id}">
          <span class="caption-text">${escapeHtml(cap.text)}</span>
          <div class="tag-chips">
            ${cap.tags.map(t => `<span class="tag-chip">${t.name}</span>`).join('')}
          </div>
          <button class="delete-btn" data-id="${cap.id}" data-type="caption">&times;</button>
        </div>
      `).join('')}
    </div>
  `;
}
```

**Body Copy Panel:**
- List of body copy cards (headline + text)
- Add form: headline input + text textarea + submit
- Edit inline
- Delete button
- Tag chips

```javascript
function renderBodyCopyPanel() {
  const panel = document.getElementById('panel-bodycopy');
  panel.innerHTML = `
    <form class="add-form" id="add-bodycopy-form">
      <input type="text" placeholder="Headline (optional)..." class="add-input">
      <textarea placeholder="Body copy text..." class="add-textarea" required></textarea>
      <button type="submit" class="add-btn">Add</button>
    </form>
    <div class="bodycopy-list">
      ${STATE.bodyCopy.map(bc => `
        <div class="bodycopy-card" data-id="${bc.id}">
          ${bc.headline ? `<div class="bodycopy-headline">${escapeHtml(bc.headline)}</div>` : ''}
          <div class="bodycopy-text">${escapeHtml(bc.text)}</div>
          <div class="tag-chips">
            ${bc.tags.map(t => `<span class="tag-chip">${t.name}</span>`).join('')}
          </div>
          <button class="delete-btn" data-id="${bc.id}" data-type="bodycopy">&times;</button>
        </div>
      `).join('')}
    </div>
  `;
}
```

**Event handlers for CRUD:**

```javascript
// Add caption
document.addEventListener('submit', async (e) => {
  if (e.target.id !== 'add-caption-form') return;
  e.preventDefault();
  const input = e.target.querySelector('input');
  const text = input.value.trim();
  if (!text) return;
  await authFetch('/api/captions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text })
  });
  input.value = '';
  await loadData();
});

// Add body copy (similar pattern)
// Delete (generic handler for all types)
document.addEventListener('click', async (e) => {
  const btn = e.target.closest('.delete-btn');
  if (!btn) return;
  const { id, type } = btn.dataset;
  const endpoints = { caption: 'captions', bodycopy: 'body-copy', image: 'images' };
  if (!confirm(`Delete this ${type}?`)) return;
  await authFetch(`/api/${endpoints[type]}/${id}`, { method: 'DELETE' });
  await loadData();
});
```

**Drag start for captions:**
```javascript
document.addEventListener('dragstart', (e) => {
  const card = e.target.closest('.caption-card');
  if (!card) return;
  e.dataTransfer.setData('application/caption-id', card.dataset.id);
  e.dataTransfer.effectAllowed = 'copy';
});
```

**Step 2: Verify panels render**

Run the app, log in. Add a caption via the form. See it appear. Delete it. Check that images from the migration show up with thumbnails.

**Step 3: Commit**

```bash
git add app/index.html
git commit -m "Frontend: image, caption, and body copy library panels with CRUD"
```

---

### Task 6: Frontend — Ad Creation & Management

**Files:**
- Modify: `app/index.html` (add ad creation flow and ads panel)

**Context:** This is the key interaction — drag a caption onto an image to create an ad. The ads panel shows all created ads with their status and controls.

**Drag-and-drop: caption onto image card**

```javascript
// Image cards accept caption drops
document.addEventListener('dragover', (e) => {
  const card = e.target.closest('.image-card');
  if (!card) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = 'copy';
  card.classList.add('drop-target');
});

document.addEventListener('dragleave', (e) => {
  const card = e.target.closest('.image-card');
  if (card) card.classList.remove('drop-target');
});

document.addEventListener('drop', (e) => {
  const card = e.target.closest('.image-card');
  if (!card) return;
  e.preventDefault();
  card.classList.remove('drop-target');

  const captionId = e.dataTransfer.getData('application/caption-id');
  if (!captionId) return;

  const imageId = card.dataset.id;
  showCreateAdModal(imageId, captionId);
});
```

**Create Ad modal:**

```javascript
function showCreateAdModal(imageId, captionId) {
  const image = STATE.images.find(i => i.id === imageId);
  const caption = STATE.captions.find(c => c.id === captionId);
  if (!image || !caption) return;

  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal">
      <h3>Create Ad</h3>
      <div class="modal-preview">
        <img src="${storageBaseUrl}/${image.storage_path}" alt="${image.filename}">
        <div class="modal-caption-preview">${escapeHtml(caption.text)}</div>
      </div>
      <label>Body copy (optional):</label>
      <select id="modal-bodycopy-select">
        <option value="">— None —</option>
        ${STATE.bodyCopy.map(bc => `
          <option value="${bc.id}">${escapeHtml(bc.headline || bc.text.slice(0, 60))}</option>
        `).join('')}
      </select>
      <div class="modal-actions">
        <button class="btn-secondary" id="modal-cancel">Cancel</button>
        <button class="btn-primary" id="modal-create">Create Ad</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  modal.querySelector('#modal-cancel').onclick = () => modal.remove();
  modal.querySelector('#modal-create').onclick = async () => {
    const bodyCopyId = modal.querySelector('#modal-bodycopy-select').value || null;
    await authFetch('/api/ads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        base_image_id: imageId,
        caption_id: captionId,
        body_copy_id: bodyCopyId
      })
    });
    modal.remove();
    await loadData();
  };
}
```

**Ads panel rendering:**

```javascript
function renderAdsPanel() {
  const panel = document.getElementById('ads-panel');
  if (!STATE.ads.length) {
    panel.innerHTML = '<div class="empty-state">No ads yet. Drag a caption onto an image to create one.</div>';
    return;
  }

  panel.innerHTML = STATE.ads.map(ad => {
    const img = ad.base_image;
    const caption = ad.caption;
    const body = ad.body_copy;
    const imgSrc = ad.composited_image_path
      ? `${storageBaseUrl}/${ad.composited_image_path}`
      : (img ? `${storageBaseUrl}/${img.storage_path}` : '');

    return `
      <div class="ad-card" data-id="${ad.id}">
        <div class="ad-card-image">
          <img src="${imgSrc}" alt="Ad">
          ${caption && !ad.composited_image_path ? `<div class="ad-card-caption-overlay">${escapeHtml(caption.text)}</div>` : ''}
        </div>
        <div class="ad-card-body">
          ${caption ? `<div class="ad-caption">"${escapeHtml(caption.text)}"</div>` : ''}
          ${body ? `<div class="ad-bodycopy">${body.headline ? `<strong>${escapeHtml(body.headline)}</strong> ` : ''}${escapeHtml(body.text)}</div>` : ''}
        </div>
        <div class="ad-card-status">
          <span class="status-badge ${ad.desired_status}">${ad.desired_status}</span>
          ${ad.meta_status ? `<span class="meta-badge">${ad.meta_status}</span>` : ''}
        </div>
        <div class="ad-card-actions">
          ${!ad.composited_image_path ? `<button class="btn-generate" data-id="${ad.id}">Generate Image</button>` : ''}
          <select class="status-select" data-id="${ad.id}">
            ${['draft', 'approved', 'live', 'paused'].map(s =>
              `<option value="${s}" ${s === ad.desired_status ? 'selected' : ''}>${s}</option>`
            ).join('')}
          </select>
          <button class="btn-delete-ad" data-id="${ad.id}">&times;</button>
        </div>
        <div class="ad-card-feedback">
          <textarea class="feedback-input" data-id="${ad.id}" placeholder="Feedback...">${ad.feedback || ''}</textarea>
        </div>
      </div>
    `;
  }).join('');
}
```

**Event handlers for ad actions:**

```javascript
// Status change
document.addEventListener('change', async (e) => {
  if (!e.target.classList.contains('status-select')) return;
  const id = e.target.dataset.id;
  await authFetch(`/api/ads/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ desired_status: e.target.value })
  });
  await loadData();
});

// Feedback save on blur
document.addEventListener('focusout', async (e) => {
  if (!e.target.classList.contains('feedback-input')) return;
  const id = e.target.dataset.id;
  const ad = STATE.ads.find(a => a.id === id);
  if (!ad || e.target.value === (ad.feedback || '')) return;
  await authFetch(`/api/ads/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ feedback: e.target.value })
  });
});

// Delete ad
document.addEventListener('click', async (e) => {
  const btn = e.target.closest('.btn-delete-ad');
  if (!btn) return;
  if (!confirm('Delete this ad?')) return;
  await authFetch(`/api/ads/${btn.dataset.id}`, { method: 'DELETE' });
  await loadData();
});

// Generate button (stub — Task 7)
document.addEventListener('click', async (e) => {
  const btn = e.target.closest('.btn-generate');
  if (!btn) return;
  btn.disabled = true;
  btn.textContent = 'Generating...';
  try {
    const res = await authFetch(`/api/ads/${btn.dataset.id}/generate`, { method: 'POST' });
    const data = await res.json();
    if (!res.ok) alert(data.error || 'Generation failed');
    else await loadData();
  } finally {
    btn.disabled = false;
    btn.textContent = 'Generate Image';
  }
});
```

**CSS for ad cards and drag-drop:**

```css
.image-card.drop-target {
  outline: 3px dashed var(--amber);
  outline-offset: -3px;
}
.ad-card {
  background: var(--warm-white);
  border: 1px solid var(--light-gray);
  border-radius: var(--radius);
  margin-bottom: 16px;
  overflow: hidden;
}
.ad-card-image { position: relative; }
.ad-card-image img { width: 100%; display: block; }
.ad-card-caption-overlay {
  position: absolute;
  bottom: 12px;
  left: 12px;
  right: 12px;
  background: rgba(0,0,0,0.6);
  color: white;
  padding: 8px 12px;
  border-radius: 4px;
  font-weight: 600;
}
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}
.modal {
  background: white;
  border-radius: 8px;
  padding: 24px;
  max-width: 500px;
  width: 90%;
}
.modal-preview img {
  width: 100%;
  border-radius: 4px;
  margin-bottom: 8px;
}
```

**Step 2: Verify the full flow**

1. Open app, log in
2. See images in the Images tab
3. Switch to Captions tab, add a caption
4. Switch back to Images tab
5. Drag the caption from Captions tab... **wait** — you can't drag across tabs if they hide/show content.

**Important UX fix:** The caption needs to be visible while dragging onto images. Options:
- Show a persistent "drag strip" of captions below the images panel
- Make the tabs not hide content (stack panels)
- Use a floating panel

**Recommended approach:** When on the Images tab, show a compact strip of caption chips at the bottom of the library panel. These chips are always visible and draggable.

```javascript
function renderCaptionStrip() {
  // Rendered at bottom of image panel, always visible
  return `
    <div class="caption-strip">
      <div class="caption-strip-label">Drag a caption onto an image:</div>
      <div class="caption-strip-chips">
        ${STATE.captions.map(cap => `
          <span class="caption-chip" draggable="true" data-id="${cap.id}">${escapeHtml(cap.text)}</span>
        `).join('')}
      </div>
    </div>
  `;
}
```

Add the strip to the bottom of the image panel rendering. Update `dragstart` to also handle `.caption-chip` elements.

**Step 3: Commit**

```bash
git add app/index.html
git commit -m "Frontend: ad creation via drag-drop, ad list with status controls"
```

---

### Task 7: Generation Endpoint

**Files:**
- Modify: `app/server.js` (replace generation stub)

**Context:** When the user clicks "Generate Image" on an ad card, the server:
1. Fetches the ad's base image and caption from Supabase
2. Downloads the base image from Storage to a temp file
3. Shells out to `claude -p` with a Nano Banana edit_image prompt
4. Uploads the composited result to Supabase Storage
5. Updates the ad row with `composited_image_path`

**Dependencies:**
- `claude` CLI must be installed and on PATH
- Nano Banana MCP server must be configured in the project's `.mcp.json`
- Gemini API key must be available (configured in Nano Banana)

**Step 1: Implement the generation endpoint**

Replace the stub in `server.js`:

```javascript
const { execSync } = require('child_process');
const fs = require('fs');
const os = require('os');

app.post('/api/ads/:id/generate', requireAuth, async (req, res) => {
  try {
    // 1. Fetch the ad with joins
    const ad = (await db.getAds(req.token)).find(a => a.id === req.params.id);
    if (!ad) return res.status(404).json({ error: 'Ad not found' });
    if (!ad.base_image) return res.status(400).json({ error: 'Ad has no base image' });
    if (!ad.caption) return res.status(400).json({ error: 'Ad has no caption — nothing to composite' });

    // 2. Download base image to temp file
    const imgUrl = `${db.getStorageBaseUrl()}/${ad.base_image.storage_path}`;
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'adgen-'));
    const tmpInput = path.join(tmpDir, ad.base_image.filename);
    const imgResponse = await fetch(imgUrl);
    const imgBuffer = Buffer.from(await imgResponse.arrayBuffer());
    fs.writeFileSync(tmpInput, imgBuffer);

    // 3. Build the claude -p prompt
    const captionText = ad.caption.text;
    const prompt = `Use the mcp__nanobanana__edit_image tool to add the text "${captionText.replace(/"/g, '\\"')}" as a bold, clean overlay on the image at ${tmpInput}. The text should be white with a subtle drop shadow, positioned prominently. Keep the image composition intact.`;

    // Store the prompt on the ad
    await db.updateAd(ad.id, { generation_prompt: prompt }, req.token);

    // 4. Shell out to claude
    const result = execSync(
      `claude -p "${prompt.replace(/"/g, '\\"')}" --allowedTools "mcp__nanobanana__edit_image,mcp__nanobanana__configure_gemini_token" --output-format json`,
      { cwd: process.cwd(), timeout: 120000, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 }
    );

    // 5. Find the output image (Nano Banana saves to a generated path)
    // Parse claude output to find the saved file path
    const outputFiles = fs.readdirSync(tmpDir).filter(f => f !== ad.base_image.filename);
    // If no new file in tmpDir, check Nano Banana's default output location
    // This may need adjustment based on how Nano Banana saves edited images

    // 6. Upload to Supabase Storage
    const compositedPath = `composited/${ad.id}.png`;
    // Read the output file and upload via the service role or user token
    // For now, return what we have

    // 7. Update ad row
    await db.updateAd(ad.id, { composited_image_path: compositedPath }, req.token);

    // Cleanup
    fs.rmSync(tmpDir, { recursive: true, force: true });

    res.json({ composited_image_path: compositedPath });
  } catch (e) {
    console.error('Generation failed:', e.message);
    res.status(500).json({ error: e.message });
  }
});
```

**Note:** The exact flow of finding Nano Banana's output file will need adjustment during implementation. Nano Banana's `edit_image` returns the saved file path in its response. The `claude -p --output-format json` output will contain this path. Parse the JSON output to extract it.

**Step 2: Test with a real ad**

1. Create an ad in the UI (image + caption)
2. Click "Generate Image"
3. Check server logs for the claude -p invocation
4. Verify the composited image appears in the ad card

This step may require debugging the claude -p output parsing and Nano Banana file paths. That's expected.

**Step 3: Commit**

```bash
git add app/server.js
git commit -m "Implement ad image generation via claude -p and Nano Banana"
```

---

### Task 8: CLI Update

**Files:**
- Rewrite: `cli/commands/ad-status.ts` → `cli/commands/ads.ts`
- Rewrite: `cli/commands/images.ts`
- Rewrite: `cli/commands/reviews.ts` → delete
- Rewrite: `cli/commands/segments.ts` → delete
- Create: `cli/commands/captions.ts`
- Create: `cli/commands/body-copy.ts`
- Create: `cli/commands/tags.ts`
- Modify: `cli/main.ts`
- Rewrite: `cli/commands/sync.ts`

**Context:** Update CLI to match new schema. Drop segment-centric commands. Add commands for new entities.

**New CLI commands:**

```
deno task cli images list [--tag <tag>]
deno task cli images add --filename <f> --storage-path <p> [--prompt <p>]

deno task cli captions list
deno task cli captions add --text <t>
deno task cli captions delete <id>

deno task cli body-copy list
deno task cli body-copy add --text <t> [--headline <h>]
deno task cli body-copy delete <id>

deno task cli ads list
deno task cli ads create --image <id> [--caption <id>] [--body-copy <id>]
deno task cli ads update <id> --desired-status <s> [--feedback <f>]
deno task cli ads delete <id>

deno task cli ad-sets list
deno task cli ad-sets create --name <n>

deno task cli tags list
deno task cli tags create --name <n>
deno task cli tags delete <id>

deno task cli sync --images-only
```

**Step 1: Update cli/main.ts routing**

```typescript
import { images } from "./commands/images.ts";
import { captions } from "./commands/captions.ts";
import { bodyCopy } from "./commands/body-copy.ts";
import { ads } from "./commands/ads.ts";
import { adSets } from "./commands/ad-sets.ts";
import { tags } from "./commands/tags.ts";
import { sync } from "./commands/sync.ts";

export function parseFlags(args: string[]): Record<string, string> {
  const flags: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith("--") && i + 1 < args.length) {
      flags[args[i].slice(2)] = args[i + 1];
      i++;
    }
  }
  return flags;
}

async function main() {
  const [command, action, ...rest] = Deno.args;
  if (!command) {
    console.error("Usage: deno task cli <command> <action> [args]");
    console.error("Commands: images, captions, body-copy, ads, ad-sets, tags, sync");
    Deno.exit(1);
  }

  switch (command) {
    case "images": return await images(action, rest);
    case "captions": return await captions(action, rest);
    case "body-copy": return await bodyCopy(action, rest);
    case "ads": return await ads(action, rest);
    case "ad-sets": return await adSets(action, rest);
    case "tags": return await tags(action, rest);
    case "sync": return await sync(rest);
    default:
      console.error(`Unknown command: ${command}`);
      Deno.exit(1);
  }
}

main();
```

**Step 2: Write each command file**

Each command file follows the same pattern. Example for `cli/commands/captions.ts`:

```typescript
import { supabase } from "../client.ts";
import { parseFlags } from "../main.ts";

export async function captions(action: string, args: string[]) {
  switch (action) {
    case "list": return await list();
    case "add": return await add(args);
    case "delete": return await del(args[0]);
    default:
      console.error(`captions: unknown action "${action}". Use: list, add, delete`);
      Deno.exit(1);
  }
}

async function list() {
  const { data, error } = await supabase
    .from("caption")
    .select("*, caption_tag(tag:tag_id(id, name))")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  const result = (data || []).map(c => ({
    id: c.id,
    text: c.text,
    tags: (c.caption_tag || []).map((t: any) => t.tag).filter(Boolean),
    created_at: c.created_at,
  }));
  console.log(JSON.stringify(result, null, 2));
}

async function add(args: string[]) {
  const flags = parseFlags(args);
  if (!flags.text) {
    console.error("captions add: missing --text");
    Deno.exit(1);
  }
  const { data, error } = await supabase
    .from("caption")
    .insert({ text: flags.text })
    .select()
    .single();
  if (error) throw new Error(error.message);
  console.log(JSON.stringify(data, null, 2));
}

async function del(id: string) {
  if (!id) {
    console.error("captions delete: missing <id>");
    Deno.exit(1);
  }
  const { error } = await supabase.from("caption").delete().eq("id", id);
  if (error) throw new Error(error.message);
  console.log(JSON.stringify({ deleted: id }));
}
```

Follow the same pattern for: `images.ts`, `body-copy.ts`, `ads.ts`, `ad-sets.ts`, `tags.ts`.

For `ads.ts`, the `create` action takes `--image`, `--caption`, `--body-copy` flags:
```typescript
async function create(args: string[]) {
  const flags = parseFlags(args);
  if (!flags.image) { console.error("ads create: missing --image"); Deno.exit(1); }
  const { data, error } = await supabase
    .from("ad")
    .insert({
      base_image_id: flags.image,
      caption_id: flags.caption || null,
      body_copy_id: flags["body-copy"] || null,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  console.log(JSON.stringify(data, null, 2));
}
```

**Step 3: Simplify sync.ts**

The sync command now only does image uploads (no more segment data, reviews, or ad statuses):

```typescript
import { storageClient } from "../client.ts";

export async function sync(args: string[]) {
  console.error("Syncing images to Supabase Storage...\n");

  // Walk segments/*/creative/ for image files
  let uploaded = 0;
  let skipped = 0;

  for await (const segDir of Deno.readDir("segments")) {
    if (!segDir.isDirectory) continue;
    const creativePath = `segments/${segDir.name}/creative`;

    let files: string[];
    try {
      files = [];
      for await (const entry of Deno.readDir(creativePath)) {
        if (entry.isFile && /\.(png|jpg|jpeg|webp)$/i.test(entry.name)) {
          files.push(entry.name);
        }
      }
    } catch {
      continue;
    }

    for (const filename of files) {
      const storagePath = `${segDir.name}/${filename}`;

      // Check if already uploaded
      const { data: existing } = await storageClient.storage
        .from("creative")
        .list(segDir.name, { search: filename, limit: 1 });

      if (existing && existing.some((f: { name: string }) => f.name === filename)) {
        skipped++;
        continue;
      }

      const fileBytes = await Deno.readFile(`${creativePath}/${filename}`);
      const ext = filename.split(".").pop()?.toLowerCase();
      const mimeTypes: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp" };

      const { error } = await storageClient.storage
        .from("creative")
        .upload(storagePath, fileBytes, {
          contentType: mimeTypes[ext || ""] || "image/png",
          upsert: false,
        });

      if (error) {
        console.error(`  upload ${storagePath}: ${error.message}`);
      } else {
        uploaded++;
      }
    }
  }
  console.error(`Images: ${uploaded} uploaded, ${skipped} skipped`);
}
```

**Step 4: Delete old command files**

Delete: `cli/commands/reviews.ts`, `cli/commands/segments.ts`, `cli/commands/ad-status.ts`

**Step 5: Verify CLI works**

```bash
deno task cli tags list
deno task cli images list
deno task cli captions add --text "Your next dinner is waiting"
deno task cli captions list
```

**Step 6: Commit**

```bash
git add cli/
git rm cli/commands/reviews.ts cli/commands/segments.ts cli/commands/ad-status.ts
git commit -m "Rewrite CLI for simplified schema (images, captions, body copy, ads, tags)"
```

---

### Task 9: Cleanup & Documentation

**Files:**
- Delete: `app/build.js` (markdown parsers no longer needed by app)
- Modify: `app/start.sh` (no changes needed, already correct)
- Modify: `CLAUDE.md` (update if needed)
- Update: memory files

**Step 1: Remove app/build.js**

The build.js file parsed markdown files into structured data for the old segment-centric model. It's no longer used by the app or the sync command. Delete it.

```bash
git rm app/build.js
```

**Step 2: Remove app/sync.js if it exists**

Check if `app/sync.js` exists (old thin wrapper). If so, delete it.

**Step 3: Clean up old references**

Grep for any remaining references to old tables or commands:
```bash
grep -r "creative_image\|image_review\|ad_campaign_status\|segment_slug" --include="*.js" --include="*.ts" app/ cli/
```

Fix any remaining references found.

**Step 4: Update MEMORY.md**

Update the project memory to reflect the new simplified model, new tables, new CLI commands, and removed files.

**Step 5: Commit**

```bash
git add -A
git commit -m "Remove build.js, clean up old references, update documentation"
```

---

## Verification Checklist

After all tasks are complete:

1. `supabase db push` — migration applied successfully
2. `psql` — 9 new tables exist, old 4 tables are gone
3. `deno task cli images list` — returns migrated images
4. `deno task cli tags list` — returns migrated segment tags
5. `deno task cli captions add --text "test"` — creates a caption
6. `./app/start.sh` — app starts, login works
7. Images appear in the Images panel
8. Caption can be created in the Captions panel
9. Drag caption onto image → Create Ad modal appears
10. Ad appears in the Ads panel with status controls
11. Status changes persist across page reload
12. SSE live reload works (change ad status, other tabs update)
