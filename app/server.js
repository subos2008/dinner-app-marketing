const express = require('express');
const fs = require('fs');
const path = require('path');
const { buildData } = require('./build');

const app = express();
const PORT = process.env.PORT || 8642;
const ROOT = path.join(__dirname, '..');

app.use(express.json());

// Serve index.html at root
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Serve segment creative images and other static segment files
app.use('/segments', express.static(path.join(ROOT, 'segments')));

// API: full data payload (live from filesystem, no build step)
app.get('/api/data', (req, res) => {
  try {
    const data = buildData();
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Validate that a param is a safe path segment (no traversal)
function isSafeParam(param) {
  return !param.includes('..') && !param.includes('/');
}

// GET /api/segments/:slug/reviews — read all reviews for a segment
app.get('/api/segments/:slug/reviews', (req, res) => {
  const { slug } = req.params;
  if (!isSafeParam(slug)) {
    return res.status(400).json({ error: 'Invalid slug' });
  }

  const reviewsPath = path.join(ROOT, 'segments', slug, 'creative', 'reviews.json');
  try {
    if (fs.existsSync(reviewsPath)) {
      const data = JSON.parse(fs.readFileSync(reviewsPath, 'utf8'));
      res.json(data);
    } else {
      res.json({});
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PUT /api/segments/:slug/reviews/:filename — upsert a review for an image
app.put('/api/segments/:slug/reviews/:filename', (req, res) => {
  const { slug, filename } = req.params;
  if (!isSafeParam(slug) || !isSafeParam(filename)) {
    return res.status(400).json({ error: 'Invalid slug or filename' });
  }

  const reviewsPath = path.join(ROOT, 'segments', slug, 'creative', 'reviews.json');
  const { status, note } = req.body;

  // Validate status
  const validStatuses = ['approved', 'rejected', 'flagged', null];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: 'Invalid status. Must be one of: approved, rejected, flagged, or null' });
  }

  try {
    let reviews = {};
    if (fs.existsSync(reviewsPath)) {
      reviews = JSON.parse(fs.readFileSync(reviewsPath, 'utf8'));
    }

    const entry = {
      status: status || null,
      note: note || '',
      updatedAt: new Date().toISOString()
    };
    reviews[filename] = entry;

    fs.writeFileSync(reviewsPath, JSON.stringify(reviews, null, 2) + '\n');
    res.json(entry);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/segments/:slug/ad-status — read all ad statuses for a segment
app.get('/api/segments/:slug/ad-status', (req, res) => {
  const { slug } = req.params;
  if (!isSafeParam(slug)) {
    return res.status(400).json({ error: 'Invalid slug' });
  }

  const statusPath = path.join(ROOT, 'segments', slug, 'creative', 'ad-status.json');
  try {
    if (fs.existsSync(statusPath)) {
      const data = JSON.parse(fs.readFileSync(statusPath, 'utf8'));
      res.json(data);
    } else {
      res.json({});
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PUT /api/segments/:slug/ad-status/:adId — upsert status + feedback for one ad
app.put('/api/segments/:slug/ad-status/:adId', (req, res) => {
  const { slug, adId } = req.params;
  if (!isSafeParam(slug) || !isSafeParam(adId)) {
    return res.status(400).json({ error: 'Invalid slug or adId' });
  }

  const statusPath = path.join(ROOT, 'segments', slug, 'creative', 'ad-status.json');
  const { status, feedback } = req.body;

  // Validate status
  const validStatuses = ['unreviewed', 'feedback', 'approved', 'live', null];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: 'Invalid status. Must be one of: unreviewed, feedback, approved, live, or null' });
  }

  try {
    let adStatuses = {};
    if (fs.existsSync(statusPath)) {
      adStatuses = JSON.parse(fs.readFileSync(statusPath, 'utf8'));
    }

    const entry = {
      status: status || 'unreviewed',
      feedback: feedback || '',
      updatedAt: new Date().toISOString()
    };
    adStatuses[adId] = entry;

    fs.writeFileSync(statusPath, JSON.stringify(adStatuses, null, 2) + '\n');
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

let debounceTimer = null;
fs.watch(path.join(ROOT, 'segments'), { recursive: true }, () => {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    for (const client of sseClients) {
      client.write('data: reload\n\n');
    }
  }, 500);
});

// --- URL routing: serve index.html for /segment/:slug/:view paths ---
app.get('/segment/:slug/:view', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Creative review app: http://localhost:${PORT}`);
});
