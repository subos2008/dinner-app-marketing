/**
 * Data access layer for the Creative Review App.
 *
 * All state lives in Supabase. Every query uses a per-request client
 * authenticated with the user's JWT. RLS is always enforced.
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
  console.log(`Supabase mode: ${supabaseUrl}`);
}

function getStorageBaseUrl() {
  return storageBaseUrl;
}

// Per-request client authenticated as the requesting user.
function clientForRequest(token) {
  const { createClient } = require('@supabase/supabase-js');
  return createClient(supabaseUrl, supabaseAnonKey, {
    db: { schema: 'marketing' },
    global: { headers: { Authorization: `Bearer ${token}` } }
  });
}

// Anon client for Realtime subscriptions only (no data queries).
function getRealtimeClient() {
  if (!_realtimeClient) {
    const { createClient } = require('@supabase/supabase-js');
    _realtimeClient = createClient(supabaseUrl, supabaseAnonKey, {
      db: { schema: 'marketing' }
    });
  }
  return _realtimeClient;
}

// --- Data fetchers ---

async function getAllData(token) {
  const client = clientForRequest(token);

  const { data: segmentRows, error: segErr } = await client
    .from('segment')
    .select('*')
    .order('slug');
  if (segErr) throw segErr;

  const { data: imageRows, error: imgErr } = await client
    .from('creative_image')
    .select('*')
    .order('filename');
  if (imgErr) throw imgErr;

  const { data: reviewRows, error: revErr } = await client
    .from('image_review')
    .select('*');
  if (revErr) throw revErr;

  const { data: statusRows, error: statErr } = await client
    .from('ad_campaign_status')
    .select('*');
  if (statErr) throw statErr;

  // Index reviews and statuses by segment
  const reviewsBySegment = {};
  for (const r of reviewRows) {
    if (!reviewsBySegment[r.segment_slug]) reviewsBySegment[r.segment_slug] = {};
    reviewsBySegment[r.segment_slug][r.filename] = {
      status: r.status,
      note: r.note || '',
      updatedAt: r.updated_at
    };
  }

  const statusesBySegment = {};
  for (const s of statusRows) {
    if (!statusesBySegment[s.segment_slug]) statusesBySegment[s.segment_slug] = {};
    statusesBySegment[s.segment_slug][s.ad_id] = {
      status: s.status,
      feedback: s.feedback || '',
      updatedAt: s.updated_at
    };
  }

  // Index images by segment
  const imagesBySegment = {};
  for (const img of imageRows) {
    if (!imagesBySegment[img.segment_slug]) imagesBySegment[img.segment_slug] = [];
    const segReviews = reviewsBySegment[img.segment_slug] || {};
    imagesBySegment[img.segment_slug].push({
      filename: img.filename,
      concept: img.concept || null,
      format: img.format || null,
      aspect_ratio: img.aspect_ratio || null,
      type: img.type || 'base',
      parent: img.parent || null,
      copy_variant: img.ad_variant || null,
      review: segReviews[img.filename] || null
    });
  }

  const segments = segmentRows.map(row => {
    const slug = row.slug;
    const segImages = imagesBySegment[slug] || [];

    const manifestImages = segImages.map(img => ({
      filename: img.filename,
      concept: img.concept,
      format: img.format,
      aspect_ratio: img.aspect_ratio,
      type: img.type,
      parent: img.parent,
      copy_variant: img.copy_variant
    }));

    return {
      slug,
      name: row.name,
      profile: row.profile,
      empathy: row.empathy,
      concepts: row.concepts,
      adCopy: row.ad_copy,
      review: row.review,
      manifest: manifestImages.length ? { images: manifestImages } : null,
      images: segImages,
      adStatus: statusesBySegment[slug] || {},
      creativePath: `segments/${slug}/creative`
    };
  });

  // Sort: life-situation first, cross-segment last
  segments.sort((a, b) => {
    if (a.slug === 'cross-segment') return 1;
    if (b.slug === 'cross-segment') return -1;
    const aType = a.profile?.type || '';
    const bType = b.profile?.type || '';
    if (aType.includes('Life-situation') && !bType.includes('Life-situation')) return -1;
    if (!aType.includes('Life-situation') && bType.includes('Life-situation')) return 1;
    return 0;
  });

  return {
    generatedAt: new Date().toISOString(),
    segmentCount: segments.length,
    segments,
    storageBaseUrl
  };
}

// --- Reviews ---

async function getReviews(slug, token) {
  const client = clientForRequest(token);
  const { data, error } = await client
    .from('image_review')
    .select('*')
    .eq('segment_slug', slug);
  if (error) throw error;
  const result = {};
  for (const r of data) {
    result[r.filename] = {
      status: r.status,
      note: r.note || '',
      updatedAt: r.updated_at
    };
  }
  return result;
}

async function upsertReview(slug, filename, status, note, token) {
  const client = clientForRequest(token);
  const { data, error } = await client
    .from('image_review')
    .upsert(
      {
        segment_slug: slug,
        filename,
        status: status || null,
        note: note || '',
        updated_at: new Date().toISOString()
      },
      { onConflict: 'segment_slug,filename' }
    )
    .select()
    .single();
  if (error) throw error;
  return { status: data.status, note: data.note, updatedAt: data.updated_at };
}

// --- Ad statuses ---

async function getAdStatuses(slug, token) {
  const client = clientForRequest(token);
  const { data, error } = await client
    .from('ad_campaign_status')
    .select('*')
    .eq('segment_slug', slug);
  if (error) throw error;
  const result = {};
  for (const s of data) {
    result[s.ad_id] = {
      status: s.status,
      feedback: s.feedback || '',
      updatedAt: s.updated_at
    };
  }
  return result;
}

async function upsertAdStatus(slug, adId, status, feedback, token) {
  const client = clientForRequest(token);
  const { data, error } = await client
    .from('ad_campaign_status')
    .upsert(
      {
        segment_slug: slug,
        ad_id: adId,
        status: status || 'unreviewed',
        feedback: feedback || '',
        updated_at: new Date().toISOString()
      },
      { onConflict: 'segment_slug,ad_id' }
    )
    .select()
    .single();
  if (error) throw error;
  return { status: data.status, feedback: data.feedback, updatedAt: data.updated_at };
}

module.exports = {
  init,
  getRealtimeClient,
  getStorageBaseUrl,
  getAllData,
  getReviews,
  upsertReview,
  getAdStatuses,
  upsertAdStatus
};
