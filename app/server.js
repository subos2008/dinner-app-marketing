const express = require('express');
const path = require('path');
const { trace, SpanStatusCode } = require('@opentelemetry/api');
const db = require('./db');
const gemini = require('./gemini');

const tracer = trace.getTracer('ad-manager');

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

// --- Captions ---

app.get('/api/captions', requireAuth, async (req, res) => {
  try { res.json(await db.getCaptions(req.token)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/captions', requireAuth, async (req, res) => {
  const { text, role } = req.body;
  if (!text) return res.status(400).json({ error: 'text is required' });
  try { res.json(await db.createCaption(text, req.token, undefined, role)); }
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
  const { base_image_id, body_copy_id, ad_set_id, caption_ids } = req.body;
  if (!base_image_id) return res.status(400).json({ error: 'base_image_id is required' });
  try {
    const ad = await db.createAd({ base_image_id, body_copy_id, ad_set_id }, req.token);
    // Assign captions via M2M join table
    if (caption_ids && Array.isArray(caption_ids)) {
      for (const captionId of caption_ids) {
        await db.addAdCaption(ad.id, captionId, req.token);
      }
    }
    res.json(ad);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/ads/:id', requireAuth, async (req, res) => {
  const VALID_DESIRED_STATUSES = ['draft', 'approved', 'live', 'paused'];
  const allowedFields = [
    'ad_set_id', 'body_copy_id', 'desired_status',
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

app.post('/api/ads/:id/captions', requireAuth, async (req, res) => {
  const { caption_id } = req.body;
  if (!caption_id) return res.status(400).json({ error: 'caption_id is required' });
  try { res.json(await db.addAdCaption(req.params.id, caption_id, req.token)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/ads/:id/captions/:captionId', requireAuth, async (req, res) => {
  try { await db.removeAdCaption(req.params.id, req.params.captionId, req.token); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

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

// --- Creative Brief ---

app.get('/api/creative-brief', requireAuth, (req, res) => {
  const fs = require('fs');
  const briefPath = path.join(__dirname, '..', 'segments', 'creative-brief.md');
  try {
    const text = fs.readFileSync(briefPath, 'utf8');
    res.json({ text });
  } catch (e) {
    res.status(404).json({ error: 'Creative brief not found' });
  }
});

// --- Generation Prompts ---

app.get('/api/generation-prompts', requireAuth, async (req, res) => {
  try { res.json(await db.getGenerationPrompts(req.token)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// --- Generate (images & captions via Gemini API) ---

app.post('/api/generate', requireAuth, async (req, res) => {
  const { type, brief, prompt } = req.body;
  if (!type || !prompt) {
    return res.status(400).json({ error: 'type and prompt are required' });
  }
  if (type !== 'image' && type !== 'caption') {
    return res.status(400).json({ error: 'type must be "image" or "caption"' });
  }

  try {
    // Create generation_prompt row first
    const genPrompt = await db.createGenerationPrompt({ type, prompt, brief }, req.token);
    const genPromptId = genPrompt.id;

    if (type === 'image') {
      const geminiPrompt = [
        brief ? `Context — creative brief:\n${brief}\n\n---\n\n` : '',
        `Generate an ad image based on this request: ${prompt}\n\n`,
        'Make the image suitable for a social media ad (Instagram/Facebook). ',
        'Do NOT include any text, words, letters, captions, headlines, or watermarks in the image. The image should be purely visual with no text overlay — text will be added separately later.'
      ].join('');

      console.log(`[generate] Image: calling Gemini...`);
      let imageBuffer;
      try {
        imageBuffer = await tracer.startActiveSpan('gemini.generate_image', async (span) => {
          span.setAttribute('generation.type', 'image');
          try {
            const result = await gemini.generateImage(geminiPrompt);
            if (result.text) span.setAttribute('gemini.text', result.text.slice(0, 2000));
            span.setAttribute('gemini.image_bytes', result.buffer.length);
            span.setStatus({ code: SpanStatusCode.OK });
            return result.buffer;
          } catch (err) {
            span.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
            span.recordException(err);
            throw err;
          } finally {
            span.end();
          }
        });
      } catch (err) {
        console.error(`[generate] Gemini image generation failed:`, err.message);
        return res.status(500).json({ error: 'Image generation failed', detail: err.message });
      }

      // Upload to Supabase Storage
      const serviceClient = db.getServiceClient();
      if (!serviceClient) {
        return res.status(500).json({
          error: 'SUPABASE_SERVICE_ROLE_KEY not configured — cannot upload to storage'
        });
      }

      const timestamp = Date.now();
      const storagePath = `generated/${timestamp}.png`;
      const filename = `generated-${timestamp}.png`;

      const { error: uploadError } = await serviceClient.storage
        .from('creative')
        .upload(storagePath, imageBuffer, {
          contentType: 'image/png',
          upsert: true
        });

      if (uploadError) {
        console.error(`[generate] Storage upload failed:`, uploadError);
        return res.status(500).json({ error: 'Failed to upload image', detail: uploadError.message });
      }

      // Create base_image row
      const image = await db.createImage({ filename, storage_path: storagePath, prompt, generation_prompt_id: genPromptId }, req.token);
      console.log(`[generate] Image created: ${image.id}`);
      return res.json({ image });

    } else {
      // type === 'caption'
      const geminiPrompt = [
        brief ? `Context — creative brief:\n${brief}\n\n---\n\n` : '',
        `Generate short ad caption text based on this request: ${prompt}\n\n`,
        'Output ONLY a JSON array of caption strings. Each caption should be short (suitable for overlaying on an image). ',
        'Generate 3-5 captions. Output raw JSON with no markdown fences, no explanation — just the array.'
      ].join('');

      console.log(`[generate] Captions: calling Gemini...`);
      let geminiOutput;
      try {
        geminiOutput = await tracer.startActiveSpan('gemini.generate_captions', async (span) => {
          span.setAttribute('generation.type', 'caption');
          try {
            const result = await gemini.generateCaptions(geminiPrompt);
            span.setAttribute('gemini.output', result.slice(0, 2000));
            span.setStatus({ code: SpanStatusCode.OK });
            return result;
          } catch (err) {
            span.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
            span.recordException(err);
            throw err;
          } finally {
            span.end();
          }
        });
      } catch (err) {
        console.error(`[generate] Gemini caption generation failed:`, err.message);
        return res.status(500).json({ error: 'Caption generation failed', detail: err.message });
      }

      // Parse JSON array from output
      let captions;
      try {
        const jsonMatch = geminiOutput.match(/\[[\s\S]*\]/);
        if (!jsonMatch) throw new Error('No JSON array found in output');
        captions = JSON.parse(jsonMatch[0]);
        if (!Array.isArray(captions)) throw new Error('Parsed value is not an array');
        captions = captions.filter(c => typeof c === 'string' && c.trim().length > 0);
      } catch (parseErr) {
        console.error(`[generate] Failed to parse captions. Output:\n${geminiOutput.slice(0, 500)}`);
        return res.status(500).json({
          error: 'Failed to parse generated captions',
          geminiOutput: geminiOutput.slice(0, 500)
        });
      }

      // Create caption rows
      const created = [];
      for (const text of captions) {
        const cap = await db.createCaption(text.trim(), req.token, genPromptId);
        created.push(cap);
      }
      console.log(`[generate] Created ${created.length} captions`);
      return res.json({ captions: created });
    }
  } catch (err) {
    console.error(`[generate] Unexpected error:`, err);
    res.status(500).json({ error: err.message });
  }
});

// --- Ad Compositing ---

app.post('/api/ads/:id/generate', requireAuth, async (req, res) => {
  const adId = req.params.id;

  try {
    // 1. Fetch the ad
    const ads = await db.getAds(req.token);
    const ad = ads.find(a => a.id === adId);
    if (!ad) {
      return res.status(404).json({ error: 'Ad not found' });
    }

    // 2. Validate
    if (!ad.base_image) {
      return res.status(400).json({ error: 'Ad has no base image assigned' });
    }
    if (!ad.captions || ad.captions.length === 0) {
      return res.status(400).json({ error: 'Ad has no captions assigned' });
    }

    // 3. Download the base image
    const imgUrl = `${db.getStorageBaseUrl()}/${ad.base_image.storage_path}`;
    const imgResponse = await fetch(imgUrl);
    if (!imgResponse.ok) {
      return res.status(502).json({ error: `Failed to download base image: ${imgResponse.status}` });
    }
    const imgBuffer = Buffer.from(await imgResponse.arrayBuffer());
    const ext = path.extname(ad.base_image.storage_path) || '.png';
    const mimeType = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'image/png';

    // 4. Build the prompt
    const roleHints = {
      headline: 'large, bold, upper area',
      subline: 'medium, below headline',
      cta: 'button style, lower area, accent color',
      tagline: 'small, bottom edge'
    };

    const overlayLines = ad.captions.map(cap => {
      const role = cap.role;
      if (role && roleHints[role]) {
        return `- ${role.toUpperCase()} (${roleHints[role]}): "${cap.text}"`;
      }
      return `- OVERLAY TEXT: "${cap.text}"`;
    }).join('\n');

    const prompt = `Add the following text overlays to this image:\n${overlayLines}\nKeep the image composition intact. Use white text with subtle shadows for readability.`;

    // 5. Call Gemini to edit the image
    console.log(`[generate] Ad ${adId}: calling Gemini for compositing...`);
    let compositedBuffer;
    try {
      compositedBuffer = await tracer.startActiveSpan('gemini.composite_ad', async (span) => {
        span.setAttribute('ad.id', adId);
        span.setAttribute('ad.caption_count', ad.captions.length);
        try {
          const result = await gemini.editImage(imgBuffer, mimeType, prompt);
          if (result.text) span.setAttribute('gemini.text', result.text.slice(0, 2000));
          span.setAttribute('gemini.image_bytes', result.buffer.length);
          span.setStatus({ code: SpanStatusCode.OK });
          return result.buffer;
        } catch (err) {
          span.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
          span.recordException(err);
          throw err;
        } finally {
          span.end();
        }
      });
    } catch (err) {
      console.error(`[generate] Gemini compositing failed:`, err.message);
      return res.status(500).json({ error: 'Image compositing failed', detail: err.message });
    }

    // 6. Upload the composited image to Supabase Storage
    const serviceClient = db.getServiceClient();
    if (!serviceClient) {
      return res.status(500).json({
        error: 'SUPABASE_SERVICE_ROLE_KEY not configured — cannot upload to storage'
      });
    }

    const compositedStoragePath = `composited/${adId}.png`;

    const { error: uploadError } = await serviceClient.storage
      .from('creative')
      .upload(compositedStoragePath, compositedBuffer, {
        contentType: 'image/png',
        upsert: true
      });

    if (uploadError) {
      console.error(`[generate] Storage upload failed:`, uploadError);
      return res.status(500).json({ error: 'Failed to upload composited image', detail: uploadError.message });
    }

    // 7. Update the ad row
    const updatedAd = await db.updateAd(adId, {
      composited_image_path: compositedStoragePath,
      generation_prompt: prompt
    }, req.token);

    console.log(`[generate] Ad ${adId}: composited image uploaded to ${compositedStoragePath}`);

    res.json({
      ad: updatedAd,
      composited_image_path: compositedStoragePath,
      composited_image_url: `${db.getStorageBaseUrl()}/${compositedStoragePath}`
    });
  } catch (err) {
    console.error(`[generate] Unexpected error:`, err);
    res.status(500).json({ error: err.message });
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
