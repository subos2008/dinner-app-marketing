/**
 * Data access layer for the Creative Review App.
 *
 * New schema: tag, base_image, caption, body_copy, ad_set, ad,
 * plus join tables base_image_tag, caption_tag, body_copy_tag.
 *
 * All state lives in Supabase (marketing schema). Every query uses a
 * per-request client authenticated with the user's JWT. RLS is always enforced.
 */

let supabaseUrl = null;
let supabaseAnonKey = null;
let storageBaseUrl = null;
let _realtimeClient = null;

// --- Infrastructure ---

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

function clientForRequest(token) {
  const { createClient } = require('@supabase/supabase-js');
  return createClient(supabaseUrl, supabaseAnonKey, {
    db: { schema: 'marketing' },
    global: { headers: { Authorization: `Bearer ${token}` } }
  });
}

function getServiceClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return null;
  const { createClient } = require('@supabase/supabase-js');
  return createClient(supabaseUrl, key, {
    db: { schema: 'marketing' }
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
  const client = clientForRequest(token);
  const { data, error } = await client
    .from('tag')
    .select('*')
    .order('name');
  if (error) throw error;
  return data;
}

async function createTag(name, token) {
  const client = clientForRequest(token);
  const { data, error } = await client
    .from('tag')
    .insert({ name })
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function deleteTag(id, token) {
  const client = clientForRequest(token);
  const { error } = await client
    .from('tag')
    .delete()
    .eq('id', id);
  if (error) throw error;
}

// --- Base Images ---

async function getImages(token) {
  const client = clientForRequest(token);
  const { data, error } = await client
    .from('base_image')
    .select('*, base_image_tag(tag_id, tag:tag_id(id, name))')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data.map(row => {
    const tags = (row.base_image_tag || []).map(jt => jt.tag).filter(Boolean);
    const { base_image_tag, ...rest } = row;
    return { ...rest, tags };
  });
}

async function createImage(data, token) {
  const client = clientForRequest(token);
  const { data: row, error } = await client
    .from('base_image')
    .insert({ filename: data.filename, storage_path: data.storage_path, prompt: data.prompt })
    .select()
    .single();
  if (error) throw error;
  return row;
}

async function deleteImage(id, token) {
  const client = clientForRequest(token);
  const { error } = await client
    .from('base_image')
    .delete()
    .eq('id', id);
  if (error) throw error;
}

async function addImageTag(imageId, tagId, token) {
  const client = clientForRequest(token);
  const { data, error } = await client
    .from('base_image_tag')
    .insert({ base_image_id: imageId, tag_id: tagId })
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function removeImageTag(imageId, tagId, token) {
  const client = clientForRequest(token);
  const { error } = await client
    .from('base_image_tag')
    .delete()
    .eq('base_image_id', imageId)
    .eq('tag_id', tagId);
  if (error) throw error;
}

// --- Captions ---

async function getCaptions(token) {
  const client = clientForRequest(token);
  const { data, error } = await client
    .from('caption')
    .select('*, caption_tag(tag_id, tag:tag_id(id, name))')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data.map(row => {
    const tags = (row.caption_tag || []).map(jt => jt.tag).filter(Boolean);
    const { caption_tag, ...rest } = row;
    return { ...rest, tags };
  });
}

async function createCaption(text, token) {
  const client = clientForRequest(token);
  const { data, error } = await client
    .from('caption')
    .insert({ text })
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function updateCaption(id, text, token) {
  const client = clientForRequest(token);
  const { data, error } = await client
    .from('caption')
    .update({ text })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function deleteCaption(id, token) {
  const client = clientForRequest(token);
  const { error } = await client
    .from('caption')
    .delete()
    .eq('id', id);
  if (error) throw error;
}

async function addCaptionTag(captionId, tagId, token) {
  const client = clientForRequest(token);
  const { data, error } = await client
    .from('caption_tag')
    .insert({ caption_id: captionId, tag_id: tagId })
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function removeCaptionTag(captionId, tagId, token) {
  const client = clientForRequest(token);
  const { error } = await client
    .from('caption_tag')
    .delete()
    .eq('caption_id', captionId)
    .eq('tag_id', tagId);
  if (error) throw error;
}

// --- Body Copy ---

async function getBodyCopy(token) {
  const client = clientForRequest(token);
  const { data, error } = await client
    .from('body_copy')
    .select('*, body_copy_tag(tag_id, tag:tag_id(id, name))')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data.map(row => {
    const tags = (row.body_copy_tag || []).map(jt => jt.tag).filter(Boolean);
    const { body_copy_tag, ...rest } = row;
    return { ...rest, tags };
  });
}

async function createBodyCopy(data, token) {
  const client = clientForRequest(token);
  const { data: row, error } = await client
    .from('body_copy')
    .insert({ text: data.text, headline: data.headline })
    .select()
    .single();
  if (error) throw error;
  return row;
}

async function updateBodyCopy(id, data, token) {
  const client = clientForRequest(token);
  const { data: row, error } = await client
    .from('body_copy')
    .update(data)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return row;
}

async function deleteBodyCopy(id, token) {
  const client = clientForRequest(token);
  const { error } = await client
    .from('body_copy')
    .delete()
    .eq('id', id);
  if (error) throw error;
}

async function addBodyCopyTag(bodyId, tagId, token) {
  const client = clientForRequest(token);
  const { data, error } = await client
    .from('body_copy_tag')
    .insert({ body_copy_id: bodyId, tag_id: tagId })
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function removeBodyCopyTag(bodyId, tagId, token) {
  const client = clientForRequest(token);
  const { error } = await client
    .from('body_copy_tag')
    .delete()
    .eq('body_copy_id', bodyId)
    .eq('tag_id', tagId);
  if (error) throw error;
}

// --- Ad Sets ---

async function getAdSets(token) {
  const client = clientForRequest(token);
  const { data, error } = await client
    .from('ad_set')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

async function createAdSet(name, token) {
  const client = clientForRequest(token);
  const { data, error } = await client
    .from('ad_set')
    .insert({ name })
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function updateAdSet(id, data, token) {
  const client = clientForRequest(token);
  const { data: row, error } = await client
    .from('ad_set')
    .update(data)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return row;
}

async function deleteAdSet(id, token) {
  const client = clientForRequest(token);
  const { error } = await client
    .from('ad_set')
    .delete()
    .eq('id', id);
  if (error) throw error;
}

// --- Ads ---

async function getAds(token) {
  const client = clientForRequest(token);
  const { data, error } = await client
    .from('ad')
    .select('*, base_image:base_image_id(*), caption:caption_id(*), body_copy:body_copy_id(*), ad_set:ad_set_id(id, name)')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

async function createAd(data, token) {
  const client = clientForRequest(token);
  const { data: row, error } = await client
    .from('ad')
    .insert({
      base_image_id: data.base_image_id,
      caption_id: data.caption_id,
      body_copy_id: data.body_copy_id,
      ad_set_id: data.ad_set_id
    })
    .select()
    .single();
  if (error) throw error;
  return row;
}

async function updateAd(id, data, token) {
  const client = clientForRequest(token);
  const { data: row, error } = await client
    .from('ad')
    .update(data)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return row;
}

async function deleteAd(id, token) {
  const client = clientForRequest(token);
  const { error } = await client
    .from('ad')
    .delete()
    .eq('id', id);
  if (error) throw error;
}

// --- Exports ---

module.exports = {
  // Infrastructure
  init,
  getStorageBaseUrl,
  clientForRequest,
  getServiceClient,
  getRealtimeClient,
  // Tags
  getTags,
  createTag,
  deleteTag,
  // Base Images
  getImages,
  createImage,
  deleteImage,
  addImageTag,
  removeImageTag,
  // Captions
  getCaptions,
  createCaption,
  updateCaption,
  deleteCaption,
  addCaptionTag,
  removeCaptionTag,
  // Body Copy
  getBodyCopy,
  createBodyCopy,
  updateBodyCopy,
  deleteBodyCopy,
  addBodyCopyTag,
  removeBodyCopyTag,
  // Ad Sets
  getAdSets,
  createAdSet,
  updateAdSet,
  deleteAdSet,
  // Ads
  getAds,
  createAd,
  updateAd,
  deleteAd
};
