# Meta Publisher SPA — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a standalone SPA that syncs approved ads to Meta ad sets via the Meta Marketing API.

**Architecture:** New mobile-optimized SPA (`web-apps/meta-publisher/index.html`) with a single `meta-sync` Edge Function that reconciles desired vs actual state. The SPA shows ads grouped by ad set and triggers sync. Meta API calls use `fetch()` directly against Meta's Marketing API (not the Node SDK, which has Deno compatibility issues).

**Tech Stack:** Vanilla JS SPA, Supabase JS client, Supabase Edge Function (Deno), Meta Marketing API v22.0

**Design doc:** `docs/plans/2026-03-07-meta-publisher-design.md`

---

## Context for Implementer

### Existing Data Model (already in DB, no migrations needed)

```
campaign
  - id, name, objective, desired_status, meta_status, meta_campaign_id

ad_set
  - id, name, campaign_id, daily_budget_cents, currency, targeting, placements
  - desired_status, meta_status, meta_ad_set_id

ad
  - id, ad_set_id, base_image_id, caption_id, body_copy_id
  - composited_image_path, desired_status, meta_status, meta_ad_id

sync_log
  - id, entity_type, entity_id, action, status, meta_id, error, synced_at
```

### Ad State Machine

```
desired_status: draft → approved → live ↔ paused
meta_status:    null                ACTIVE  PAUSED
```

Sync happens when `desired_status` doesn't match `meta_status`:
- `desired=live, meta=null` → create ad on Meta → `meta=ACTIVE`
- `desired=live, meta=PAUSED` → reactivate → `meta=ACTIVE`
- `desired=paused, meta=ACTIVE` → pause → `meta=PAUSED`

### Supabase Config

```
URL:      https://pqrhphvbyjqhntqjzljc.supabase.co
Anon key: sb_publishable_vJfmD1tuFO7X2tiKTmRe3Q_-Py5ObXh
Schema:   marketing
Storage:  creative bucket (public read)
```

### Existing Patterns

- **SPA auth:** Supabase magic link, same pattern as `web-apps/creative-spa/index.html`
- **Edge Functions:** `Deno.serve()`, use `_shared/cors.ts` + `_shared/supabase.ts`, return `{ error: "message" }` on failure
- **Storage URL:** `SUPABASE_URL + '/storage/v1/object/public/creative/' + path`

### Meta Marketing API Endpoints (v22.0)

All calls use `https://graph.facebook.com/v22.0/` with access token as query param or header.

1. **Upload image:** `POST /{ad_account_id}/adimages` with `bytes` (base64) → returns `{ images: { hash: { hash } } }`
2. **Create creative:** `POST /{ad_account_id}/adcreatives` with `name`, `object_story_spec` → returns `{ id }`
3. **Create ad:** `POST /{ad_account_id}/ads` with `name`, `adset_id`, `creative`, `status` → returns `{ id }`
4. **Update ad status:** `POST /{ad_id}` with `status=ACTIVE|PAUSED` → returns `{ success: true }`

---

### Task 1: Shared Meta API Module

**Files:**
- Create: `supabase/functions/_shared/meta.ts`

**Step 1: Create the module**

Create `supabase/functions/_shared/meta.ts`:

```typescript
/**
 * Meta Marketing API wrapper.
 * Uses fetch() directly against the Graph API.
 * Access token from SUPABASE secret: META_ACCESS_TOKEN
 * Ad account from SUPABASE secret: META_AD_ACCOUNT_ID
 */

const API_BASE = 'https://graph.facebook.com/v22.0'

function getToken(): string {
  const token = Deno.env.get('META_ACCESS_TOKEN')
  if (!token) throw new Error('META_ACCESS_TOKEN not set')
  return token
}

function getAdAccountId(): string {
  const id = Deno.env.get('META_AD_ACCOUNT_ID')
  if (!id) throw new Error('META_AD_ACCOUNT_ID not set')
  return id
}

// deno-lint-ignore no-explicit-any
async function graphPost(path: string, params: Record<string, string>): Promise<any> {
  const token = getToken()
  const body = new URLSearchParams(params)
  body.set('access_token', token)

  const resp = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    body,
  })

  const data = await resp.json()
  if (data.error) {
    throw new Error(`Meta API error: ${data.error.message} (code ${data.error.code})`)
  }
  return data
}

// deno-lint-ignore no-explicit-any
async function graphGet(path: string, params: Record<string, string> = {}): Promise<any> {
  const token = getToken()
  const qs = new URLSearchParams({ ...params, access_token: token })

  const resp = await fetch(`${API_BASE}${path}?${qs}`)
  const data = await resp.json()
  if (data.error) {
    throw new Error(`Meta API error: ${data.error.message} (code ${data.error.code})`)
  }
  return data
}

/**
 * Upload an image to the ad account.
 * Takes raw image bytes, returns the image hash.
 */
export async function uploadAdImage(imageBytes: Uint8Array): Promise<string> {
  const accountId = getAdAccountId()

  // Meta expects base64-encoded bytes in the 'bytes' field
  let binary = ''
  for (let i = 0; i < imageBytes.length; i++) {
    binary += String.fromCharCode(imageBytes[i])
  }
  const b64 = btoa(binary)

  const data = await graphPost(`/${accountId}/adimages`, { bytes: b64 })

  // Response: { images: { <hash>: { hash: "..." } } }
  const images = data.images
  const firstKey = Object.keys(images)[0]
  return images[firstKey].hash
}

/**
 * Create an ad creative with an image, body text, headline, and link.
 */
export async function createAdCreative(opts: {
  name: string
  imageHash: string
  body: string
  headline: string
  linkUrl: string
  pageId: string
}): Promise<string> {
  const accountId = getAdAccountId()

  const objectStorySpec = {
    page_id: opts.pageId,
    link_data: {
      image_hash: opts.imageHash,
      message: opts.body,
      name: opts.headline,
      link: opts.linkUrl,
      call_to_action: { type: 'LEARN_MORE' },
    },
  }

  const data = await graphPost(`/${accountId}/adcreatives`, {
    name: opts.name,
    object_story_spec: JSON.stringify(objectStorySpec),
  })

  return data.id
}

/**
 * Create an ad in an ad set.
 */
export async function createAd(opts: {
  name: string
  adSetId: string
  creativeId: string
  status: 'ACTIVE' | 'PAUSED'
}): Promise<string> {
  const accountId = getAdAccountId()

  const data = await graphPost(`/${accountId}/ads`, {
    name: opts.name,
    adset_id: opts.adSetId,
    creative: JSON.stringify({ creative_id: opts.creativeId }),
    status: opts.status,
  })

  return data.id
}

/**
 * Update an existing ad's status.
 */
export async function updateAdStatus(metaAdId: string, status: 'ACTIVE' | 'PAUSED'): Promise<void> {
  await graphPost(`/${metaAdId}`, { status })
}

/**
 * Fetch ad sets from the ad account.
 */
// deno-lint-ignore no-explicit-any
export async function fetchAdSets(): Promise<any[]> {
  const accountId = getAdAccountId()
  const data = await graphGet(`/${accountId}/adsets`, {
    fields: 'id,name,status,daily_budget,start_time,end_time',
    limit: '100',
  })
  return data.data || []
}
```

**Step 2: Commit**

```bash
git add supabase/functions/_shared/meta.ts
git commit -m "Add shared Meta Marketing API wrapper module"
```

---

### Task 2: meta-sync Edge Function

**Files:**
- Create: `supabase/functions/meta-sync/index.ts`
- Modify: `supabase/config.toml` (add JWT config)

**Step 1: Create the Edge Function**

Create `supabase/functions/meta-sync/index.ts`:

```typescript
import { corsHeaders } from '../_shared/cors.ts'
import { createUserClient, createServiceClient } from '../_shared/supabase.ts'
import { uploadAdImage, createAdCreative, createAd, updateAdStatus } from '../_shared/meta.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const userClient = createUserClient(req)
    const { data: { user }, error: authError } = await userClient.auth.getUser()
    if (authError || !user) {
      return jsonResponse({ error: 'Unauthorized' }, 401)
    }

    const { ad_set_id } = await req.json()
    if (!ad_set_id) return jsonResponse({ error: 'ad_set_id is required' }, 400)

    // Get the ad set to verify it exists and has a meta_ad_set_id
    const { data: adSet, error: asErr } = await userClient
      .from('ad_set')
      .select('*')
      .eq('id', ad_set_id)
      .single()

    if (asErr || !adSet) {
      return jsonResponse({ error: 'Ad set not found' }, 404)
    }

    if (!adSet.meta_ad_set_id) {
      return jsonResponse({ error: 'Ad set has no Meta ad set ID. Create or import it in Meta first, then set the meta_ad_set_id.' }, 400)
    }

    // Get the page ID from env
    const pageId = Deno.env.get('META_PAGE_ID')
    if (!pageId) return jsonResponse({ error: 'META_PAGE_ID not set' }, 500)

    const linkUrl = Deno.env.get('META_LINK_URL') || 'https://comejoinus.app'

    // Fetch ads that need syncing: desired_status != meta_status (or meta_status is null)
    const { data: ads, error: adsErr } = await userClient
      .from('ad')
      .select('*, base_image:base_image_id(*), caption:caption_id(*), body_copy:body_copy_id(*)')
      .eq('ad_set_id', ad_set_id)
      .in('desired_status', ['live', 'paused'])

    if (adsErr) {
      return jsonResponse({ error: 'Failed to fetch ads: ' + adsErr.message }, 500)
    }

    // Filter to ads that actually need syncing
    const toSync = (ads || []).filter(ad => {
      if (ad.desired_status === 'live' && ad.meta_status !== 'ACTIVE') return true
      if (ad.desired_status === 'paused' && ad.meta_status !== 'PAUSED') return true
      return false
    })

    if (toSync.length === 0) {
      return jsonResponse({ synced: [], message: 'Everything is in sync' })
    }

    const serviceClient = createServiceClient()
    const results: { ad_id: string; action: string; success: boolean; error?: string; meta_ad_id?: string }[] = []

    for (const ad of toSync) {
      try {
        if (!ad.meta_ad_id) {
          // --- CREATE new ad on Meta ---

          // 1. Download composited image from Storage
          const imagePath = ad.composited_image_path
          if (!imagePath) {
            results.push({ ad_id: ad.id, action: 'create', success: false, error: 'No composited image' })
            continue
          }

          const { data: fileData, error: dlErr } = await serviceClient.storage
            .from('creative')
            .download(imagePath)
          if (dlErr || !fileData) {
            results.push({ ad_id: ad.id, action: 'create', success: false, error: 'Failed to download image: ' + (dlErr?.message || 'unknown') })
            continue
          }
          const imageBytes = new Uint8Array(await fileData.arrayBuffer())

          // 2. Upload image to Meta
          const imageHash = await uploadAdImage(imageBytes)

          // 3. Build ad name and text
          const bodyText = ad.body_copy?.text || ''
          const headline = ad.body_copy?.headline || 'Come Join Us'
          const captionText = ad.caption?.text || ''
          const adName = `Ad ${ad.id.slice(0, 8)} - ${captionText.slice(0, 30) || 'untitled'}`

          // 4. Create creative
          const creativeId = await createAdCreative({
            name: adName,
            imageHash,
            body: bodyText,
            headline,
            linkUrl,
            pageId,
          })

          // 5. Create ad
          const metaStatus = ad.desired_status === 'live' ? 'ACTIVE' : 'PAUSED'
          const metaAdId = await createAd({
            name: adName,
            adSetId: adSet.meta_ad_set_id,
            creativeId,
            status: metaStatus,
          })

          // 6. Update local DB
          await userClient
            .from('ad')
            .update({ meta_ad_id: metaAdId, meta_status: metaStatus })
            .eq('id', ad.id)

          // 7. Log
          await userClient
            .from('sync_log')
            .insert({
              entity_type: 'ad',
              entity_id: ad.id,
              action: 'create',
              status: 'success',
              meta_id: metaAdId,
            })

          results.push({ ad_id: ad.id, action: 'create', success: true, meta_ad_id: metaAdId })

        } else {
          // --- UPDATE existing ad status on Meta ---
          const newStatus = ad.desired_status === 'live' ? 'ACTIVE' : 'PAUSED'

          await updateAdStatus(ad.meta_ad_id, newStatus)

          await userClient
            .from('ad')
            .update({ meta_status: newStatus })
            .eq('id', ad.id)

          await userClient
            .from('sync_log')
            .insert({
              entity_type: 'ad',
              entity_id: ad.id,
              action: 'update_status',
              status: 'success',
              meta_id: ad.meta_ad_id,
            })

          results.push({ ad_id: ad.id, action: 'update_status', success: true, meta_ad_id: ad.meta_ad_id })
        }

      } catch (err) {
        console.error(`[meta-sync] Failed to sync ad ${ad.id}:`, (err as Error).message)

        await userClient
          .from('sync_log')
          .insert({
            entity_type: 'ad',
            entity_id: ad.id,
            action: ad.meta_ad_id ? 'update_status' : 'create',
            status: 'error',
            error: (err as Error).message,
          })

        results.push({ ad_id: ad.id, action: ad.meta_ad_id ? 'update_status' : 'create', success: false, error: (err as Error).message })
      }
    }

    return jsonResponse({ synced: results })

  } catch (err) {
    console.error('meta-sync error:', err)
    return jsonResponse({ error: (err as Error).message }, 500)
  }
})

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
```

**Step 2: Add JWT config to `supabase/config.toml`**

Add at the end of the file:

```toml
[functions.meta-sync]
verify_jwt = false
```

**Step 3: Commit**

```bash
git add supabase/functions/meta-sync/index.ts supabase/config.toml
git commit -m "Add meta-sync Edge Function for pushing ads to Meta"
```

---

### Task 3: Meta Publisher SPA — HTML + CSS

**Files:**
- Create: `web-apps/meta-publisher/index.html`

This is a single `index.html` file containing all HTML, CSS, and JS (same pattern as creative-spa).

**Step 1: Create the SPA file with HTML + CSS (JS will be added in Task 4)**

Create `web-apps/meta-publisher/index.html`. The structure:

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
<title>ComeJoinUs - Publisher</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700&display=swap');

  :root {
    --bg: #F8F8FA;
    --surface: #FFFFFF;
    --text-primary: #1C1C1E;
    --text-secondary: #8E8E93;
    --text-tertiary: #AEAEB2;
    --separator: #E5E5EA;
    --accent: #C8956C;
    --accent-light: #F3E8DD;
    --accent-dark: #8B5E3C;
    --red: #FF3B30;
    --green: #34C759;
    --blue: #007AFF;
    --orange: #FF9500;
    --tab-bar-bg: rgba(249, 249, 249, 0.94);
    --top-bar-bg: rgba(249, 249, 249, 0.94);
    --radius: 10px;
    --radius-lg: 14px;
    --font-display: 'Playfair Display', Georgia, serif;
    --font-body: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', system-ui, sans-serif;
    --safe-top: env(safe-area-inset-top, 0px);
    --safe-bottom: env(safe-area-inset-bottom, 0px);
  }

  * { margin: 0; padding: 0; box-sizing: border-box; }
  html { scroll-behavior: smooth; -webkit-text-size-adjust: 100%; }

  body {
    font-family: var(--font-body);
    background: var(--bg);
    color: var(--text-primary);
    line-height: 1.4;
    font-weight: 400;
    min-height: 100dvh;
    -webkit-font-smoothing: antialiased;
    -webkit-tap-highlight-color: transparent;
    overscroll-behavior: none;
  }

  .hidden { display: none !important; }

  /* --- Loading --- */
  .loading-overlay {
    position: fixed; inset: 0;
    display: flex; align-items: center; justify-content: center;
    background: var(--bg);
    font-family: var(--font-display);
    font-size: 18px;
    color: var(--text-secondary);
    z-index: 200;
  }

  /* --- Login --- */
  .login-screen {
    position: fixed; inset: 0;
    display: flex; align-items: center; justify-content: center;
    background: var(--bg);
    padding: 24px;
    z-index: 150;
  }

  .login-card {
    width: 100%; max-width: 360px; text-align: center;
  }

  .login-card h1 {
    font-family: var(--font-display);
    font-size: 28px; font-weight: 400;
    margin-bottom: 8px;
  }

  .login-card p { color: var(--text-secondary); margin-bottom: 28px; font-size: 15px; }

  .login-card input {
    width: 100%; padding: 14px 16px;
    border: 1px solid var(--separator); border-radius: var(--radius);
    font-family: var(--font-body); font-size: 16px;
    margin-bottom: 12px; background: var(--surface);
    color: var(--text-primary); -webkit-appearance: none;
  }

  .login-card input:focus { outline: none; border-color: var(--accent); }

  .login-card button {
    width: 100%; padding: 14px;
    background: var(--accent); color: white; border: none;
    border-radius: var(--radius);
    font-family: var(--font-body); font-size: 16px; font-weight: 600;
    cursor: pointer; -webkit-appearance: none;
  }

  .login-card button:active { background: var(--accent-dark); }
  .login-card button:disabled { opacity: 0.5; cursor: default; }

  .login-message { margin-top: 16px; font-size: 14px; color: var(--green); }
  .login-message.error { color: var(--red); }

  /* --- App shell --- */
  #app {
    position: fixed; inset: 0;
    display: flex; flex-direction: column;
    background: var(--bg);
  }

  /* --- Top bar --- */
  .topbar {
    position: relative; z-index: 100;
    background: var(--top-bar-bg);
    -webkit-backdrop-filter: saturate(180%) blur(20px);
    backdrop-filter: saturate(180%) blur(20px);
    padding-top: var(--safe-top);
    border-bottom: 0.5px solid var(--separator);
    flex-shrink: 0;
  }

  .topbar-inner {
    display: flex; align-items: center; justify-content: space-between;
    height: 44px; padding: 0 16px;
  }

  .topbar-title {
    font-family: var(--font-display);
    font-size: 17px; font-weight: 400;
    letter-spacing: -0.2px;
  }

  .topbar-btn {
    background: none; border: none;
    color: var(--accent); font-size: 15px;
    cursor: pointer; padding: 4px 8px;
    font-family: var(--font-body);
  }

  /* --- Tab bar --- */
  .tab-bar {
    display: flex; gap: 0;
    padding: 6px 16px 4px;
    background: var(--top-bar-bg);
  }

  .tab-btn {
    flex: 1; text-align: center;
    padding: 8px 0;
    background: none; border: none;
    font-family: var(--font-body); font-size: 13px;
    color: var(--text-tertiary);
    cursor: pointer; position: relative;
    font-weight: 500;
  }

  .tab-btn.active {
    color: var(--accent);
  }

  .tab-btn.active::after {
    content: '';
    position: absolute; bottom: 0; left: 20%; right: 20%;
    height: 2px; background: var(--accent);
    border-radius: 1px;
  }

  /* --- Content area --- */
  .content {
    flex: 1; overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    padding-bottom: calc(var(--safe-bottom) + 16px);
  }

  /* --- Ad Set Card --- */
  .ad-set-card {
    background: var(--surface);
    margin: 12px 16px;
    border-radius: var(--radius-lg);
    padding: 16px;
    cursor: pointer;
    border: 1px solid var(--separator);
    transition: background 0.15s;
  }

  .ad-set-card:active { background: #F0F0F5; }

  .ad-set-name {
    font-size: 16px; font-weight: 600;
    margin-bottom: 4px;
  }

  .ad-set-meta {
    font-size: 13px; color: var(--text-secondary);
    display: flex; gap: 12px; flex-wrap: wrap;
  }

  .ad-set-badge {
    display: inline-block;
    padding: 2px 8px; border-radius: 6px;
    font-size: 11px; font-weight: 600;
    text-transform: uppercase;
  }

  .badge-synced { background: #D1F2D1; color: #1B7A1B; }
  .badge-pending { background: #FFF3CD; color: #856404; }
  .badge-error { background: #F8D7DA; color: #721C24; }
  .badge-no-meta { background: #E8E8ED; color: var(--text-secondary); }

  /* --- Ad Set Detail --- */
  .detail-header {
    padding: 16px;
    display: flex; align-items: center; gap: 12px;
    border-bottom: 0.5px solid var(--separator);
    background: var(--surface);
  }

  .detail-back {
    background: none; border: none;
    font-size: 24px; color: var(--accent);
    cursor: pointer; padding: 0 4px;
    line-height: 1;
  }

  .detail-title {
    font-size: 17px; font-weight: 600;
    flex: 1;
  }

  .sync-btn {
    padding: 10px 20px;
    background: var(--accent); color: white;
    border: none; border-radius: var(--radius);
    font-size: 15px; font-weight: 600;
    cursor: pointer; width: calc(100% - 32px);
    margin: 16px;
    font-family: var(--font-body);
  }

  .sync-btn:active { background: var(--accent-dark); }
  .sync-btn:disabled { opacity: 0.5; cursor: default; }

  /* --- Ad Row --- */
  .ad-row {
    display: flex; gap: 12px; align-items: center;
    padding: 12px 16px;
    border-bottom: 0.5px solid var(--separator);
    background: var(--surface);
  }

  .ad-row-thumb {
    width: 56px; height: 56px;
    border-radius: 8px;
    object-fit: cover;
    background: var(--separator);
    flex-shrink: 0;
  }

  .ad-row-info { flex: 1; min-width: 0; }

  .ad-row-caption {
    font-size: 14px; font-weight: 500;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }

  .ad-row-status {
    font-size: 12px; color: var(--text-secondary);
    margin-top: 2px;
    display: flex; gap: 8px; align-items: center;
  }

  .status-dot {
    width: 8px; height: 8px;
    border-radius: 50%;
    display: inline-block;
  }

  .dot-draft { background: var(--text-tertiary); }
  .dot-approved { background: var(--blue); }
  .dot-live { background: var(--green); }
  .dot-paused { background: var(--orange); }
  .dot-synced { background: var(--green); }
  .dot-pending { background: var(--orange); }

  .ad-row-actions { flex-shrink: 0; }

  .status-select {
    padding: 6px 8px;
    border: 1px solid var(--separator);
    border-radius: 6px;
    font-size: 13px;
    background: var(--surface);
    color: var(--text-primary);
    font-family: var(--font-body);
  }

  /* --- Sync Result --- */
  .sync-result {
    margin: 12px 16px;
    padding: 12px;
    border-radius: var(--radius);
    font-size: 13px;
  }

  .sync-result-success { background: #D1F2D1; color: #1B7A1B; }
  .sync-result-error { background: #F8D7DA; color: #721C24; }

  /* --- Sync Log --- */
  .log-entry {
    padding: 12px 16px;
    border-bottom: 0.5px solid var(--separator);
    font-size: 13px;
  }

  .log-time { color: var(--text-tertiary); font-size: 11px; }
  .log-action { font-weight: 500; }
  .log-error { color: var(--red); margin-top: 4px; }

  /* --- Unassigned Ads --- */
  .assign-btn {
    padding: 4px 10px;
    background: var(--accent-light); color: var(--accent-dark);
    border: 1px solid var(--accent);
    border-radius: 6px;
    font-size: 12px; font-weight: 500;
    cursor: pointer; font-family: var(--font-body);
  }

  .assign-btn:active { background: var(--accent); color: white; }

  /* --- Assign Sheet --- */
  .assign-sheet-overlay {
    position: fixed; inset: 0;
    background: rgba(0,0,0,0.4);
    z-index: 300;
  }

  .assign-sheet {
    position: fixed;
    bottom: 0; left: 0; right: 0;
    background: var(--surface);
    border-radius: 14px 14px 0 0;
    padding: 20px 16px calc(var(--safe-bottom) + 20px);
    z-index: 301;
    max-height: 60vh;
    overflow-y: auto;
  }

  .assign-sheet h3 {
    font-size: 17px; font-weight: 600;
    margin-bottom: 12px;
  }

  .assign-option {
    padding: 12px;
    border: 1px solid var(--separator);
    border-radius: var(--radius);
    margin-bottom: 8px;
    cursor: pointer;
    font-size: 15px;
  }

  .assign-option:active { background: var(--accent-light); }

  /* --- Empty state --- */
  .empty-state {
    text-align: center;
    padding: 60px 24px;
    color: var(--text-secondary);
    font-size: 15px;
  }

  .empty-state-title {
    font-family: var(--font-display);
    font-size: 20px;
    color: var(--text-primary);
    margin-bottom: 8px;
  }

  /* --- Section header --- */
  .section-header {
    padding: 20px 16px 8px;
    font-size: 13px;
    font-weight: 600;
    color: var(--text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
</style>
</head>
<body>

<!-- Loading -->
<div id="loading" class="loading-overlay">Publisher</div>

<!-- Login -->
<div id="login-screen" class="login-screen hidden">
  <div class="login-card">
    <h1>Publisher</h1>
    <p>Push ads to Meta</p>
    <form id="login-form">
      <input type="email" id="login-email" placeholder="Email" autocomplete="email" required />
      <button type="submit" id="login-btn">Send Magic Link</button>
    </form>
    <div id="login-message" class="login-message hidden"></div>
  </div>
</div>

<!-- App -->
<div id="app" class="hidden">
  <div class="topbar">
    <div class="topbar-inner">
      <span class="topbar-title">Publisher</span>
      <button class="topbar-btn" id="signout-btn">Sign Out</button>
    </div>
    <div class="tab-bar">
      <button class="tab-btn active" id="tab-ad-sets" data-tab="ad-sets">Ad Sets</button>
      <button class="tab-btn" id="tab-unassigned" data-tab="unassigned">Unassigned</button>
      <button class="tab-btn" id="tab-log" data-tab="log">Sync Log</button>
    </div>
  </div>

  <div class="content" id="content">
    <!-- Ad Sets list view -->
    <div id="view-ad-sets"></div>

    <!-- Ad Set detail view -->
    <div id="view-detail" class="hidden"></div>

    <!-- Unassigned ads view -->
    <div id="view-unassigned" class="hidden"></div>

    <!-- Sync Log view -->
    <div id="view-log" class="hidden"></div>
  </div>
</div>

<!-- Assign Sheet -->
<div id="assign-overlay" class="assign-sheet-overlay hidden"></div>
<div id="assign-sheet" class="assign-sheet hidden">
  <h3>Assign to Ad Set</h3>
  <div id="assign-options"></div>
</div>

<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js"></script>
<script>
(function() {
  'use strict';

  // --- Config ---
  const SUPABASE_URL = 'https://pqrhphvbyjqhntqjzljc.supabase.co';
  const SUPABASE_ANON_KEY = 'sb_publishable_vJfmD1tuFO7X2tiKTmRe3Q_-Py5ObXh';
  const storageBaseUrl = SUPABASE_URL + '/storage/v1/object/public/creative';

  // --- State ---
  let supabaseClient = null;
  let currentSession = null;
  let appInitialised = false;

  let STATE = { adSets: [], ads: [], syncLog: [] };
  let activeTab = 'ad-sets';
  let detailAdSetId = null;
  let assigningAdId = null;

  // --- Supabase helpers ---
  function db() { return supabaseClient.schema('marketing'); }

  function fnError(error, data) {
    if (error) {
      console.error('fnError raw:', { error, data, context: error.context, msg: error.message });
      if (error.context) {
        if (typeof error.context === 'object' && error.context.error) return error.context.error;
        if (typeof error.context === 'string') return error.context;
      }
      return error.message || 'Edge Function error';
    }
    if (data && data.error) return data.error;
    return null;
  }

  function escapeHtml(s) {
    const d = document.createElement('div');
    d.textContent = s || '';
    return d.innerHTML;
  }

  // --- DOM refs ---
  const $loading = document.getElementById('loading');
  const $loginScreen = document.getElementById('login-screen');
  const $loginForm = document.getElementById('login-form');
  const $loginEmail = document.getElementById('login-email');
  const $loginBtn = document.getElementById('login-btn');
  const $loginMessage = document.getElementById('login-message');
  const $app = document.getElementById('app');
  const $signoutBtn = document.getElementById('signout-btn');

  const $viewAdSets = document.getElementById('view-ad-sets');
  const $viewDetail = document.getElementById('view-detail');
  const $viewUnassigned = document.getElementById('view-unassigned');
  const $viewLog = document.getElementById('view-log');

  const $assignOverlay = document.getElementById('assign-overlay');
  const $assignSheet = document.getElementById('assign-sheet');
  const $assignOptions = document.getElementById('assign-options');

  // --- Auth ---
  $loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = $loginEmail.value.trim();
    if (!email) return;
    $loginBtn.disabled = true;
    $loginMessage.classList.add('hidden');

    const { error } = await supabaseClient.auth.signInWithOtp({ email });
    if (error) {
      $loginMessage.textContent = error.message;
      $loginMessage.className = 'login-message error';
      $loginMessage.classList.remove('hidden');
    } else {
      $loginMessage.textContent = 'Check your email for a login link.';
      $loginMessage.className = 'login-message';
      $loginMessage.classList.remove('hidden');
    }
    $loginBtn.disabled = false;
  });

  $signoutBtn.addEventListener('click', async () => {
    await supabaseClient.auth.signOut();
    currentSession = null;
    $app.classList.add('hidden');
    $loginScreen.classList.remove('hidden');
  });

  // --- Tabs ---
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      switchTab(tab);
    });
  });

  function switchTab(tab) {
    activeTab = tab;
    detailAdSetId = null;

    document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));

    $viewAdSets.classList.toggle('hidden', tab !== 'ad-sets');
    $viewDetail.classList.add('hidden');
    $viewUnassigned.classList.toggle('hidden', tab !== 'unassigned');
    $viewLog.classList.toggle('hidden', tab !== 'log');

    if (tab === 'ad-sets') renderAdSets();
    if (tab === 'unassigned') renderUnassigned();
    if (tab === 'log') renderSyncLog();
  }

  // --- Data loading ---
  async function loadData() {
    const [adSetsRes, adsRes, logRes] = await Promise.all([
      db().from('ad_set').select('*').order('created_at', { ascending: false }),
      db().from('ad').select('*, base_image:base_image_id(*), caption:caption_id(*), body_copy:body_copy_id(*)').order('created_at', { ascending: false }),
      db().from('sync_log').select('*').order('synced_at', { ascending: false }).limit(50),
    ]);

    STATE.adSets = adSetsRes.data || [];
    STATE.ads = adsRes.data || [];
    STATE.syncLog = logRes.data || [];

    render();
  }

  function render() {
    if (activeTab === 'ad-sets') {
      if (detailAdSetId) renderDetail();
      else renderAdSets();
    }
    if (activeTab === 'unassigned') renderUnassigned();
    if (activeTab === 'log') renderSyncLog();
  }

  // --- Render: Ad Sets list ---
  function renderAdSets() {
    if (STATE.adSets.length === 0) {
      $viewAdSets.innerHTML = '<div class="empty-state"><div class="empty-state-title">No Ad Sets</div>Create ad sets in Meta, then set their meta_ad_set_id in the database.</div>';
      return;
    }

    $viewAdSets.innerHTML = STATE.adSets.map(as => {
      const ads = STATE.ads.filter(a => a.ad_set_id === as.id);
      const total = ads.length;
      const synced = ads.filter(a => a.meta_ad_id && a.desired_status === 'live' && a.meta_status === 'ACTIVE').length;
      const pending = ads.filter(a => needsSync(a)).length;

      let badge = '';
      if (!as.meta_ad_set_id) {
        badge = '<span class="ad-set-badge badge-no-meta">No Meta ID</span>';
      } else if (pending > 0) {
        badge = '<span class="ad-set-badge badge-pending">' + pending + ' pending</span>';
      } else if (synced > 0) {
        badge = '<span class="ad-set-badge badge-synced">In sync</span>';
      }

      return '<div class="ad-set-card" data-id="' + as.id + '">'
        + '<div class="ad-set-name">' + escapeHtml(as.name) + '</div>'
        + '<div class="ad-set-meta">'
        + '<span>' + total + ' ad' + (total !== 1 ? 's' : '') + '</span>'
        + badge
        + '</div>'
        + '</div>';
    }).join('');

    $viewAdSets.querySelectorAll('.ad-set-card').forEach(card => {
      card.addEventListener('click', () => {
        detailAdSetId = card.dataset.id;
        $viewAdSets.classList.add('hidden');
        $viewDetail.classList.remove('hidden');
        renderDetail();
      });
    });
  }

  // --- Render: Ad Set Detail ---
  function renderDetail() {
    const adSet = STATE.adSets.find(as => as.id === detailAdSetId);
    if (!adSet) return;

    const ads = STATE.ads.filter(a => a.ad_set_id === adSet.id);
    const pendingCount = ads.filter(a => needsSync(a)).length;

    let html = '<div class="detail-header">'
      + '<button class="detail-back" id="detail-back">&larr;</button>'
      + '<div class="detail-title">' + escapeHtml(adSet.name) + '</div>'
      + '</div>';

    if (ads.length === 0) {
      html += '<div class="empty-state">No ads assigned to this ad set.<br>Assign ads from the Unassigned tab.</div>';
    } else {
      html += ads.map(ad => renderAdRow(ad)).join('');
    }

    // Sync button
    if (adSet.meta_ad_set_id && pendingCount > 0) {
      html += '<button class="sync-btn" id="sync-btn">Sync ' + pendingCount + ' Ad' + (pendingCount !== 1 ? 's' : '') + '</button>';
    } else if (!adSet.meta_ad_set_id) {
      html += '<div class="empty-state" style="padding:24px">Set meta_ad_set_id before syncing.</div>';
    } else if (pendingCount === 0 && ads.length > 0) {
      html += '<div class="empty-state" style="padding:24px;color:var(--green)">All ads in sync.</div>';
    }

    // Sync results area
    html += '<div id="sync-results"></div>';

    $viewDetail.innerHTML = html;

    // Back button
    document.getElementById('detail-back').addEventListener('click', () => {
      detailAdSetId = null;
      $viewDetail.classList.add('hidden');
      $viewAdSets.classList.remove('hidden');
      renderAdSets();
    });

    // Status dropdowns
    $viewDetail.querySelectorAll('.status-select').forEach(sel => {
      sel.addEventListener('change', async () => {
        const adId = sel.dataset.adId;
        const newStatus = sel.value;
        const { error } = await db().from('ad').update({ desired_status: newStatus }).eq('id', adId);
        if (error) {
          alert('Failed to update status: ' + error.message);
          return;
        }
        await loadData();
      });
    });

    // Sync button
    const $syncBtn = document.getElementById('sync-btn');
    if ($syncBtn) {
      $syncBtn.addEventListener('click', () => handleSync(adSet.id));
    }
  }

  function renderAdRow(ad) {
    const imgUrl = ad.composited_image_path
      ? storageBaseUrl + '/' + ad.composited_image_path
      : (ad.base_image ? storageBaseUrl + '/' + ad.base_image.storage_path : '');

    const captionText = ad.caption ? ad.caption.text : 'No caption';
    const syncState = getSyncState(ad);

    const statusOptions = ['draft', 'approved', 'live', 'paused'].map(s =>
      '<option value="' + s + '"' + (ad.desired_status === s ? ' selected' : '') + '>' + s + '</option>'
    ).join('');

    return '<div class="ad-row">'
      + (imgUrl ? '<img class="ad-row-thumb" src="' + imgUrl + '" alt="" />' : '<div class="ad-row-thumb"></div>')
      + '<div class="ad-row-info">'
      + '<div class="ad-row-caption">' + escapeHtml(captionText) + '</div>'
      + '<div class="ad-row-status">'
      + '<span class="status-dot dot-' + ad.desired_status + '"></span>'
      + '<span>' + ad.desired_status + '</span>'
      + (ad.meta_status ? ' &rarr; <span class="status-dot dot-' + (ad.meta_status === 'ACTIVE' ? 'synced' : 'pending') + '"></span> Meta: ' + ad.meta_status : '')
      + (syncState === 'pending' ? ' <span style="color:var(--orange);font-weight:600">(needs sync)</span>' : '')
      + '</div>'
      + '</div>'
      + '<div class="ad-row-actions">'
      + '<select class="status-select" data-ad-id="' + ad.id + '">' + statusOptions + '</select>'
      + '</div>'
      + '</div>';
  }

  // --- Render: Unassigned ---
  function renderUnassigned() {
    const unassigned = STATE.ads.filter(a => !a.ad_set_id && a.desired_status !== 'draft');

    if (unassigned.length === 0) {
      $viewUnassigned.innerHTML = '<div class="empty-state"><div class="empty-state-title">No Unassigned Ads</div>All approved ads are assigned to ad sets, or all ads are still in draft.</div>';
      return;
    }

    $viewUnassigned.innerHTML = '<div class="section-header">' + unassigned.length + ' unassigned ad' + (unassigned.length !== 1 ? 's' : '') + '</div>'
      + unassigned.map(ad => {
        const imgUrl = ad.composited_image_path
          ? storageBaseUrl + '/' + ad.composited_image_path
          : (ad.base_image ? storageBaseUrl + '/' + ad.base_image.storage_path : '');
        const captionText = ad.caption ? ad.caption.text : 'No caption';

        return '<div class="ad-row">'
          + (imgUrl ? '<img class="ad-row-thumb" src="' + imgUrl + '" alt="" />' : '<div class="ad-row-thumb"></div>')
          + '<div class="ad-row-info">'
          + '<div class="ad-row-caption">' + escapeHtml(captionText) + '</div>'
          + '<div class="ad-row-status"><span class="status-dot dot-' + ad.desired_status + '"></span> ' + ad.desired_status + '</div>'
          + '</div>'
          + '<div class="ad-row-actions">'
          + '<button class="assign-btn" data-ad-id="' + ad.id + '">Assign</button>'
          + '</div>'
          + '</div>';
      }).join('');

    $viewUnassigned.querySelectorAll('.assign-btn').forEach(btn => {
      btn.addEventListener('click', () => openAssignSheet(btn.dataset.adId));
    });
  }

  // --- Assign sheet ---
  function openAssignSheet(adId) {
    assigningAdId = adId;
    const adSetsWithMeta = STATE.adSets.filter(as => as.meta_ad_set_id);

    if (adSetsWithMeta.length === 0) {
      alert('No ad sets with a Meta ID. Create ad sets in Meta first.');
      return;
    }

    $assignOptions.innerHTML = adSetsWithMeta.map(as =>
      '<div class="assign-option" data-as-id="' + as.id + '">' + escapeHtml(as.name) + '</div>'
    ).join('');

    $assignSheet.classList.remove('hidden');
    $assignOverlay.classList.remove('hidden');

    $assignOptions.querySelectorAll('.assign-option').forEach(opt => {
      opt.addEventListener('click', async () => {
        const asId = opt.dataset.asId;
        const { error } = await db().from('ad').update({ ad_set_id: asId }).eq('id', assigningAdId);
        if (error) {
          alert('Failed to assign: ' + error.message);
          return;
        }
        closeAssignSheet();
        await loadData();
      });
    });
  }

  function closeAssignSheet() {
    $assignSheet.classList.add('hidden');
    $assignOverlay.classList.add('hidden');
    assigningAdId = null;
  }

  $assignOverlay.addEventListener('click', closeAssignSheet);

  // --- Render: Sync Log ---
  function renderSyncLog() {
    if (STATE.syncLog.length === 0) {
      $viewLog.innerHTML = '<div class="empty-state"><div class="empty-state-title">No Sync History</div>Sync some ads to see activity here.</div>';
      return;
    }

    $viewLog.innerHTML = STATE.syncLog.map(entry => {
      const time = new Date(entry.synced_at).toLocaleString();
      const statusClass = entry.status === 'success' ? 'dot-synced' : 'dot-pending';

      return '<div class="log-entry">'
        + '<div class="log-time">' + time + '</div>'
        + '<div class="log-action">'
        + '<span class="status-dot ' + statusClass + '"></span> '
        + entry.action + ' ' + entry.entity_type
        + (entry.meta_id ? ' &rarr; ' + entry.meta_id : '')
        + '</div>'
        + (entry.error ? '<div class="log-error">' + escapeHtml(entry.error) + '</div>' : '')
        + '</div>';
    }).join('');
  }

  // --- Sync ---
  async function handleSync(adSetId) {
    const $syncBtn = document.getElementById('sync-btn');
    const $syncResults = document.getElementById('sync-results');
    if ($syncBtn) {
      $syncBtn.disabled = true;
      $syncBtn.textContent = 'Syncing...';
    }

    try {
      const { data, error } = await supabaseClient.functions.invoke('meta-sync', {
        body: { ad_set_id: adSetId },
      });

      const errMsg = fnError(error, data);
      if (errMsg) {
        console.error('Sync error:', errMsg);
        if ($syncResults) {
          $syncResults.innerHTML = '<div class="sync-result sync-result-error">' + escapeHtml(errMsg) + '</div>';
        }
        return;
      }

      // Show results
      const results = data.synced || [];
      if ($syncResults && results.length > 0) {
        $syncResults.innerHTML = results.map(r => {
          if (r.success) {
            return '<div class="sync-result sync-result-success">' + r.action + ': ' + r.ad_id.slice(0, 8) + ' &rarr; ' + (r.meta_ad_id || '') + '</div>';
          } else {
            return '<div class="sync-result sync-result-error">' + r.action + ': ' + r.ad_id.slice(0, 8) + ' — ' + escapeHtml(r.error) + '</div>';
          }
        }).join('');
      } else if ($syncResults && data.message) {
        $syncResults.innerHTML = '<div class="sync-result sync-result-success">' + escapeHtml(data.message) + '</div>';
      }

      // Reload data to reflect new state
      await loadData();

    } catch (err) {
      console.error('Sync error:', err);
      if ($syncResults) {
        $syncResults.innerHTML = '<div class="sync-result sync-result-error">' + escapeHtml(err.message || 'Sync failed') + '</div>';
      }
    } finally {
      if ($syncBtn) {
        $syncBtn.disabled = false;
        $syncBtn.textContent = 'Sync';
      }
    }
  }

  // --- Helpers ---
  function needsSync(ad) {
    if (ad.desired_status === 'live' && ad.meta_status !== 'ACTIVE') return true;
    if (ad.desired_status === 'paused' && ad.meta_status !== 'PAUSED') return true;
    return false;
  }

  function getSyncState(ad) {
    if (needsSync(ad)) return 'pending';
    if (ad.meta_ad_id) return 'synced';
    return 'none';
  }

  // --- Init ---
  async function initApp() {
    if (appInitialised) return;
    appInitialised = true;
    await loadData();
    $loading.classList.add('hidden');
    $app.classList.remove('hidden');
  }

  // --- Boot ---
  supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  supabaseClient.auth.onAuthStateChange((event, session) => {
    currentSession = session;
    if (session) {
      $loginScreen.classList.add('hidden');
      initApp();
    } else {
      $loading.classList.add('hidden');
      $loginScreen.classList.remove('hidden');
      $app.classList.add('hidden');
      appInitialised = false;
    }
  });

})();
</script>
</body>
</html>
```

**Step 2: Create start.sh**

Create `web-apps/meta-publisher/start.sh`:

```bash
#!/usr/bin/env bash
cd "$(dirname "$0")"
npx serve . -l 8643
```

**Step 3: Commit**

```bash
chmod +x web-apps/meta-publisher/start.sh
git add web-apps/meta-publisher/index.html web-apps/meta-publisher/start.sh
git commit -m "Add Meta Publisher SPA with ad set view, sync, and assign UI"
```

---

### Task 4: Deploy Script + Deploy IDs

**Files:**
- Create: `web-apps/meta-publisher/deploy.sh`
- Modify: `deploy-ids.sh`

The Meta Publisher will need its own S3 bucket + CloudFront distribution. For now, create the deploy script with placeholder IDs that can be filled in after the infrastructure is created.

**Step 1: Create deploy script**

Create `web-apps/meta-publisher/deploy.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$SCRIPT_DIR/../.."

source "$REPO_ROOT/deploy-ids.sh"

BUCKET_NAME="$PUBLISHER_S3_BUCKET"
DISTRIBUTION_ID="$PUBLISHER_CF_ID"
SITE_URL="https://publisher.comejoinus.app"

export AWS_PROFILE="dinner-app-deploy"

echo "Deploying publisher SPA to s3://$BUCKET_NAME"

aws s3 sync "$SCRIPT_DIR" "s3://$BUCKET_NAME" \
  --delete \
  --exclude "start.sh" \
  --exclude "deploy.sh" \
  --cache-control "max-age=300"

aws s3 cp "s3://$BUCKET_NAME/index.html" "s3://$BUCKET_NAME/index.html" \
  --content-type "text/html" \
  --cache-control "no-cache" \
  --metadata-directive REPLACE

echo "Creating CloudFront invalidation..."
INVALIDATION_ID=$(aws cloudfront create-invalidation \
  --distribution-id "$DISTRIBUTION_ID" \
  --paths "/*" \
  --query 'Invalidation.Id' \
  --output text)

echo "Invalidation $INVALIDATION_ID — waiting..."
while true; do
  STATUS=$(aws cloudfront get-invalidation \
    --distribution-id "$DISTRIBUTION_ID" \
    --id "$INVALIDATION_ID" \
    --query 'Invalidation.Status' \
    --output text)
  [ "$STATUS" = "Completed" ] && break
  sleep 7
done

echo "Deploy complete. Site: $SITE_URL"
```

**Step 2: Add placeholder IDs to deploy-ids.sh**

Append to `deploy-ids.sh`:

```bash
PUBLISHER_S3_BUCKET="comejoinus-publisher-spa"
PUBLISHER_CF_ID="PLACEHOLDER"
```

**Step 3: Commit**

```bash
chmod +x web-apps/meta-publisher/deploy.sh
git add web-apps/meta-publisher/deploy.sh deploy-ids.sh
git commit -m "Add Meta Publisher deploy script and deploy IDs"
```

---

### Task 5: Set Secrets + Deploy Edge Function

**Step 1: Set Meta secrets**

The user needs to provide these values. Run interactively:

```bash
supabase secrets set META_ACCESS_TOKEN=<your-token>
supabase secrets set META_AD_ACCOUNT_ID=act_<your-account-id>
supabase secrets set META_PAGE_ID=<your-page-id>
```

If the user doesn't have these yet, skip this step — the function will return clear error messages when called without them.

**Step 2: Deploy the edge function**

```bash
supabase functions deploy meta-sync --no-verify-jwt
```

**Step 3: Verify deployment**

```bash
supabase functions list
```

Expected: `meta-sync` appears in the list.

**Step 4: Commit any remaining changes**

```bash
git add -A
git commit -m "Deploy meta-sync Edge Function" --allow-empty
```

---

### Task 6: Verification

**Step 1: Serve the SPA locally**

```bash
cd web-apps/meta-publisher && npx serve . -l 8643
```

Open `http://localhost:8643` in the browser.

**Step 2: Verify login**

- Login screen appears
- Magic link login works (same auth as creative SPA)

**Step 3: Verify Ad Sets tab**

- Shows ad sets from the database
- Each card shows name, ad count, sync badge
- Tapping a card shows the detail view with ads

**Step 4: Verify Unassigned tab**

- Shows ads not assigned to any ad set (with desired_status != draft)
- "Assign" button opens bottom sheet with ad set options
- Selecting an ad set assigns the ad

**Step 5: Verify Sync Log tab**

- Shows sync_log entries (empty if no syncs yet)

**Step 6: Verify status changes**

- In detail view, changing the desired_status dropdown updates the ad in the database
- "Sync" button appears when ads need syncing
- Sync button calls the edge function and shows results

**Step 7: Deploy the SPA (when S3/CloudFront are ready)**

```bash
bash web-apps/meta-publisher/deploy.sh
```

---

## Summary of New Files

| File | Purpose |
|------|---------|
| `supabase/functions/_shared/meta.ts` | Meta Marketing API wrapper (fetch-based) |
| `supabase/functions/meta-sync/index.ts` | Edge Function: reconcile desired vs actual state |
| `web-apps/meta-publisher/index.html` | Publisher SPA (HTML + CSS + JS) |
| `web-apps/meta-publisher/start.sh` | Local dev server script |
| `web-apps/meta-publisher/deploy.sh` | S3/CloudFront deploy script |

## Modified Files

| File | Change |
|------|--------|
| `supabase/config.toml` | Add `[functions.meta-sync]` JWT config |
| `deploy-ids.sh` | Add publisher S3 bucket + CF ID placeholders |

## Secrets Required

| Secret | Purpose |
|--------|---------|
| `META_ACCESS_TOKEN` | Long-lived access token with `ads_management` permission |
| `META_AD_ACCOUNT_ID` | Ad account ID (format: `act_XXXXXXXXX`) |
| `META_PAGE_ID` | Facebook Page ID for ad creatives |
