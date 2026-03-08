/**
 * Meta Marketing API wrapper.
 * Uses fetch() directly against the Graph API.
 * Access token from Supabase secret: META_ACCESS_TOKEN
 * Ad account from Supabase secret: META_AD_ACCOUNT_ID
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
 * Update a campaign's status.
 */
export async function updateCampaignStatus(metaCampaignId: string, status: 'ACTIVE' | 'PAUSED'): Promise<void> {
  await graphPost(`/${metaCampaignId}`, { status })
}

/**
 * Fetch basic ad account info to verify connection.
 */
// deno-lint-ignore no-explicit-any
export async function fetchAccountInfo(): Promise<any> {
  const accountId = getAdAccountId()
  return await graphGet(`/${accountId}`, {
    fields: 'id,name,account_status,currency,timezone_name,amount_spent',
  })
}

/**
 * Fetch campaigns from the ad account.
 */
// deno-lint-ignore no-explicit-any
export async function fetchCampaigns(): Promise<any[]> {
  const accountId = getAdAccountId()
  const data = await graphGet(`/${accountId}/campaigns`, {
    fields: 'id,name,status,effective_status,objective,daily_budget,start_time,stop_time',
    limit: '100',
  })
  return data.data || []
}

/**
 * Fetch ad sets from the ad account.
 */
// deno-lint-ignore no-explicit-any
export async function fetchAdSets(): Promise<any[]> {
  const accountId = getAdAccountId()
  const data = await graphGet(`/${accountId}/adsets`, {
    fields: 'id,name,status,effective_status,daily_budget,start_time,end_time,campaign_id',
    limit: '100',
  })
  return data.data || []
}
