const express = require('express');
const fs = require('fs');
const path = require('path');
const db = require('./db');

db.init();

const app = express();
const PORT = process.env.PORT || 8642;
const ROOT = path.join(__dirname, '..');

app.use(express.json());

// --- Auth config endpoint (public, needed before login) ---
app.get('/api/config', (req, res) => {
  if (db.isSupabase()) {
    res.json({
      supabaseUrl: process.env.SUPABASE_URL,
      supabaseAnonKey: process.env.SUPABASE_ANON_KEY
    });
  } else {
    res.json({ supabaseUrl: null });
  }
});

// --- Auth middleware: validate JWT, extract token for db calls ---
async function requireAuth(req, res, next) {
  if (!db.isSupabase()) return next(); // filesystem mode: no auth

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const token = authHeader.slice(7);

  // Validate the token by calling getUser (hits Supabase auth server)
  const { createClient } = require('@supabase/supabase-js');
  const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } }
  });

  const { data: { user }, error } = await client.auth.getUser(token);
  if (error || !user) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  req.user = user;
  req.token = token; // pass through for db layer
  next();
}

// Serve index.html at root
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Serve segment creative images and other static segment files
app.use('/segments', express.static(path.join(ROOT, 'segments')));

// API: full data payload
app.get('/api/data', requireAuth, async (req, res) => {
  try {
    const data = await db.getAllData(req.token);
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Validate that a param is a safe path segment (no traversal)
function isSafeParam(param) {
  return !param.includes('..') && !param.includes('/');
}

// GET /api/segments/:slug/reviews
app.get('/api/segments/:slug/reviews', requireAuth, async (req, res) => {
  const { slug } = req.params;
  if (!isSafeParam(slug)) {
    return res.status(400).json({ error: 'Invalid slug' });
  }

  try {
    const data = await db.getReviews(slug, req.token);
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PUT /api/segments/:slug/reviews/:filename
app.put('/api/segments/:slug/reviews/:filename', requireAuth, async (req, res) => {
  const { slug, filename } = req.params;
  if (!isSafeParam(slug) || !isSafeParam(filename)) {
    return res.status(400).json({ error: 'Invalid slug or filename' });
  }

  const { status, note } = req.body;
  const validStatuses = ['approved', 'rejected', 'flagged', 'liked', null];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: 'Invalid status. Must be one of: approved, rejected, flagged, liked, or null' });
  }

  try {
    const entry = await db.upsertReview(slug, filename, status, note, req.token);
    res.json(entry);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/segments/:slug/ad-status
app.get('/api/segments/:slug/ad-status', requireAuth, async (req, res) => {
  const { slug } = req.params;
  if (!isSafeParam(slug)) {
    return res.status(400).json({ error: 'Invalid slug' });
  }

  try {
    const data = await db.getAdStatuses(slug, req.token);
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PUT /api/segments/:slug/ad-status/:adId
app.put('/api/segments/:slug/ad-status/:adId', requireAuth, async (req, res) => {
  const { slug, adId } = req.params;
  if (!isSafeParam(slug) || !isSafeParam(adId)) {
    return res.status(400).json({ error: 'Invalid slug or adId' });
  }

  const { status, feedback } = req.body;
  const validStatuses = ['unreviewed', 'feedback', 'approved', 'live', null];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: 'Invalid status. Must be one of: unreviewed, feedback, approved, live, or null' });
  }

  try {
    const entry = await db.upsertAdStatus(slug, adId, status, feedback, req.token);
    res.json(entry);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// --- SSE live reload ---
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

if (db.isSupabase()) {
  const realtimeClient = db.getRealtimeClient();

  realtimeClient
    .channel('marketing-changes')
    .on('postgres_changes', { event: '*', schema: 'marketing', table: 'image_review' }, () => {
      broadcastReload();
    })
    .on('postgres_changes', { event: '*', schema: 'marketing', table: 'ad_campaign_status' }, () => {
      broadcastReload();
    })
    .subscribe();
} else {
  let debounceTimer = null;
  fs.watch(path.join(ROOT, 'segments'), { recursive: true }, () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(broadcastReload, 500);
  });
}

// --- URL routing: serve index.html for /segment/:slug/:view paths ---
app.get('/segment/:slug/:view', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Creative review app: http://localhost:${PORT}`);
});
