const express = require('express');
const path = require('path');
const db = require('./db');

db.init();

const app = express();
const PORT = process.env.PORT || 8642;

app.use(express.json());

// --- Auth config endpoint (public, needed before login) ---
app.get('/api/config', (req, res) => {
  res.json({
    supabaseUrl: process.env.SUPABASE_URL,
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY,
    storageBaseUrl: db.getStorageBaseUrl()
  });
});

// --- Auth middleware: validate JWT, extract token for db calls ---
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

// Serve index.html at root
app.get('/', (req, res) => {
  res.sendFile('index.html', { root: __dirname, dotfiles: 'allow' });
});

// --- Tags ---

app.get('/api/tags', requireAuth, async (req, res) => {
  try { res.json(await db.getTags(req.token)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/tags', requireAuth, async (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });
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
  if (!filename || !storage_path) return res.status(400).json({ error: 'filename and storage_path are required' });
  try { res.json(await db.createImage({ filename, storage_path, prompt }, req.token)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/images/:id', requireAuth, async (req, res) => {
  try { await db.deleteImage(req.params.id, req.token); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/images/:id/tags', requireAuth, async (req, res) => {
  const { tag_id } = req.body;
  if (!tag_id) return res.status(400).json({ error: 'tag_id is required' });
  try { res.json(await db.addImageTag(req.params.id, tag_id, req.token)); }
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
  if (!text) return res.status(400).json({ error: 'text is required' });
  try { res.json(await db.createCaption(text, req.token)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/captions/:id', requireAuth, async (req, res) => {
  const { text } = req.body;
  if (!text) return res.status(400).json({ error: 'text is required' });
  try { res.json(await db.updateCaption(req.params.id, text, req.token)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/captions/:id', requireAuth, async (req, res) => {
  try { await db.deleteCaption(req.params.id, req.token); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/captions/:id/tags', requireAuth, async (req, res) => {
  const { tag_id } = req.body;
  if (!tag_id) return res.status(400).json({ error: 'tag_id is required' });
  try { res.json(await db.addCaptionTag(req.params.id, tag_id, req.token)); }
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
  if (!text) return res.status(400).json({ error: 'text is required' });
  try { res.json(await db.createBodyCopy({ text, headline }, req.token)); }
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
  if (!tag_id) return res.status(400).json({ error: 'tag_id is required' });
  try { res.json(await db.addBodyCopyTag(req.params.id, tag_id, req.token)); }
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
  if (!name) return res.status(400).json({ error: 'name is required' });
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
  if (!base_image_id) return res.status(400).json({ error: 'base_image_id is required' });
  try { res.json(await db.createAd({ base_image_id, caption_id, body_copy_id, ad_set_id }, req.token)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/ads/:id', requireAuth, async (req, res) => {
  const allowedFields = [
    'ad_set_id', 'caption_id', 'body_copy_id', 'desired_status',
    'feedback', 'composited_image_path', 'generation_prompt',
    'meta_status', 'meta_ad_id'
  ];
  const updates = {};
  for (const field of allowedFields) {
    if (req.body[field] !== undefined) updates[field] = req.body[field];
  }
  try { res.json(await db.updateAd(req.params.id, updates, req.token)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/ads/:id', requireAuth, async (req, res) => {
  try { await db.deleteAd(req.params.id, req.token); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/ads/:id/generate', requireAuth, async (req, res) => {
  res.status(501).json({ error: 'Not implemented — generation coming soon' });
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
  .on('postgres_changes', { event: '*', schema: 'marketing', table: 'ad' }, () => {
    broadcastReload();
  })
  .subscribe();

app.listen(PORT, () => {
  console.log(`Creative review app: http://localhost:${PORT}`);
});
