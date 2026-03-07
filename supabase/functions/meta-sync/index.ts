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

    // Fetch ads that need syncing: desired_status is live or paused
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
