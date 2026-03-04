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
  try {
    await db.deleteImage(req.params.id, req.token);
    res.json({ ok: true });
  } catch (e) {
    if (e.code === '23503') {
      return res.status(409).json({ error: 'Cannot delete image — it is used by one or more ads. Delete those ads first.' });
    }
    res.status(500).json({ error: e.message });
  }
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
  const VALID_DESIRED_STATUSES = ['draft', 'approved', 'live', 'paused'];
  const allowedFields = [
    'ad_set_id', 'caption_id', 'body_copy_id', 'desired_status',
    'feedback', 'composited_image_path', 'generation_prompt'
  ];
  const updates = {};
  for (const field of allowedFields) {
    if (req.body[field] !== undefined) updates[field] = req.body[field];
  }
  if (updates.desired_status && !VALID_DESIRED_STATUSES.includes(updates.desired_status)) {
    return res.status(400).json({ error: `Invalid status. Must be one of: ${VALID_DESIRED_STATUSES.join(', ')}` });
  }
  try { res.json(await db.updateAd(req.params.id, updates, req.token)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/ads/:id', requireAuth, async (req, res) => {
  try { await db.deleteAd(req.params.id, req.token); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/ads/:id/generate', requireAuth, async (req, res) => {
  const os = require('os');
  const fs = require('fs');
  const { execSync } = require('child_process');

  const adId = req.params.id;
  let tmpDir = null;

  try {
    // 1. Fetch the ad and find it by id
    const ads = await db.getAds(req.token);
    const ad = ads.find(a => a.id === adId);
    if (!ad) {
      return res.status(404).json({ error: 'Ad not found' });
    }

    // 2. Validate: must have base_image and caption
    if (!ad.base_image) {
      return res.status(400).json({ error: 'Ad has no base image assigned' });
    }
    if (!ad.caption) {
      return res.status(400).json({ error: 'Ad has no caption assigned' });
    }

    const captionText = ad.caption.text;
    const storagePath = ad.base_image.storage_path;

    // 3. Download the base image to a temp directory
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'adgen-'));
    const ext = path.extname(storagePath) || '.png';
    const inputPath = path.join(tmpDir, `base${ext}`);

    const imgUrl = `${db.getStorageBaseUrl()}/${storagePath}`;
    const imgResponse = await fetch(imgUrl);
    if (!imgResponse.ok) {
      return res.status(502).json({ error: `Failed to download base image: ${imgResponse.status}` });
    }
    const imgBuffer = Buffer.from(await imgResponse.arrayBuffer());
    fs.writeFileSync(inputPath, imgBuffer);

    // Snapshot /tmp PNGs before running claude so we can find the output
    const tmpPngsBefore = new Set(
      fs.readdirSync(os.tmpdir())
        .filter(f => f.endsWith('.png') || f.endsWith('.jpg') || f.endsWith('.jpeg'))
    );

    // 4. Build the prompt for Claude Code + Nano Banana
    const prompt = `Use the mcp__nanobanana__edit_image tool to add the text "${captionText.replace(/"/g, '\\"')}" as a bold, clean overlay on the image at ${inputPath}. The text should be white with a subtle drop shadow, positioned prominently. Keep the image composition intact.`;

    // 5. Shell out to claude -p
    console.log(`[generate] Ad ${adId}: running claude -p for compositing...`);
    let claudeOutput;
    try {
      claudeOutput = execSync(
        `claude -p ${JSON.stringify(prompt)} --allowedTools "mcp__nanobanana__edit_image,mcp__nanobanana__configure_gemini_token"`,
        { timeout: 120000, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 }
      );
    } catch (execErr) {
      console.error(`[generate] claude -p failed:`, execErr.message);
      return res.status(500).json({
        error: 'Image generation failed',
        detail: execErr.stderr || execErr.message
      });
    }

    // 6. Find the output image
    // Strategy: check claude output for a file path, then scan /tmp for new image files
    let outputPath = null;

    // Try to extract a file path from claude's output
    const pathMatch = claudeOutput.match(/\/[^\s"']+\.(png|jpg|jpeg)/i);
    if (pathMatch && fs.existsSync(pathMatch[0])) {
      outputPath = pathMatch[0];
    }

    // Fallback: scan /tmp for new image files
    if (!outputPath) {
      const tmpPngsAfter = fs.readdirSync(os.tmpdir())
        .filter(f => f.endsWith('.png') || f.endsWith('.jpg') || f.endsWith('.jpeg'))
        .filter(f => !tmpPngsBefore.has(f));

      if (tmpPngsAfter.length > 0) {
        // Pick the most recently modified one
        tmpPngsAfter.sort((a, b) => {
          const sa = fs.statSync(path.join(os.tmpdir(), a));
          const sb = fs.statSync(path.join(os.tmpdir(), b));
          return sb.mtimeMs - sa.mtimeMs;
        });
        outputPath = path.join(os.tmpdir(), tmpPngsAfter[0]);
      }
    }

    // Also check the tmpDir for any new files besides the original input
    if (!outputPath) {
      const tmpDirFiles = fs.readdirSync(tmpDir)
        .filter(f => f !== `base${ext}`)
        .filter(f => f.endsWith('.png') || f.endsWith('.jpg') || f.endsWith('.jpeg'));
      if (tmpDirFiles.length > 0) {
        outputPath = path.join(tmpDir, tmpDirFiles[0]);
      }
    }

    if (!outputPath) {
      console.error(`[generate] Could not find output image. Claude output:\n${claudeOutput.slice(0, 500)}`);
      return res.status(500).json({
        error: 'Generation ran but output image not found',
        // TODO: improve output parsing if Nano Banana changes its save path
        claudeOutput: claudeOutput.slice(0, 500)
      });
    }

    console.log(`[generate] Ad ${adId}: found output at ${outputPath}`);

    // 7. Upload the composited image to Supabase Storage
    const serviceClient = db.getServiceClient();
    if (!serviceClient) {
      return res.status(500).json({
        error: 'SUPABASE_SERVICE_ROLE_KEY not configured — cannot upload to storage'
      });
    }

    const compositedStoragePath = `composited/${adId}.png`;
    const outputBuffer = fs.readFileSync(outputPath);

    const { error: uploadError } = await serviceClient.storage
      .from('creative')
      .upload(compositedStoragePath, outputBuffer, {
        contentType: 'image/png',
        upsert: true
      });

    if (uploadError) {
      console.error(`[generate] Storage upload failed:`, uploadError);
      return res.status(500).json({ error: 'Failed to upload composited image', detail: uploadError.message });
    }

    // 8. Update the ad row with the composited image path
    const updatedAd = await db.updateAd(adId, {
      composited_image_path: compositedStoragePath,
      generation_prompt: prompt
    }, req.token);

    console.log(`[generate] Ad ${adId}: composited image uploaded to ${compositedStoragePath}`);

    // 9. Return the updated ad info
    res.json({
      ad: updatedAd,
      composited_image_path: compositedStoragePath,
      composited_image_url: `${db.getStorageBaseUrl()}/${compositedStoragePath}`
    });
  } catch (err) {
    console.error(`[generate] Unexpected error:`, err);
    res.status(500).json({ error: err.message });
  } finally {
    // 9. Clean up temp files
    if (tmpDir) {
      try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
    }
  }
});

// --- SSE live reload via Supabase Realtime ---
const sseClients = new Set();

// SSE uses query param for token since EventSource doesn't support headers
app.get('/api/events', async (req, res, next) => {
  const token = req.query.token;
  if (!token) return res.status(401).json({ error: 'Authentication required' });
  const { createClient } = require('@supabase/supabase-js');
  const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } }
  });
  const { data: { user }, error } = await client.auth.getUser(token);
  if (error || !user) return res.status(401).json({ error: 'Invalid or expired token' });
  next();
}, (req, res) => {
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
