import { corsHeaders } from '../_shared/cors.ts'
import { createUserClient, createServiceClient } from '../_shared/supabase.ts'
import { editImage } from '../_shared/gemini.ts'

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

    const { adId } = await req.json()
    if (!adId) return jsonResponse({ error: 'adId is required' }, 400)

    // 1. Fetch the ad with joins
    const { data: ads, error: fetchError } = await userClient
      .from('ad')
      .select('*, base_image:base_image_id(*), ad_caption(caption_id, caption:caption_id(*))')
      .eq('id', adId)

    if (fetchError) return jsonResponse({ error: fetchError.message }, 500)
    if (!ads || ads.length === 0) return jsonResponse({ error: 'Ad not found' }, 404)

    const ad = ads[0]
    const captions = (ad.ad_caption || []).map((jc: { caption: unknown }) => jc.caption).filter(Boolean)

    // 2. Validate
    if (!ad.base_image) return jsonResponse({ error: 'Ad has no base image assigned' }, 400)
    if (captions.length === 0) return jsonResponse({ error: 'Ad has no captions assigned' }, 400)

    // 3. Download the base image from Storage
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const imgUrl = `${supabaseUrl}/storage/v1/object/public/creative/${ad.base_image.storage_path}`
    const imgResponse = await fetch(imgUrl)
    if (!imgResponse.ok) {
      return jsonResponse({ error: `Failed to download base image: ${imgResponse.status}` }, 502)
    }
    const imgBuffer = new Uint8Array(await imgResponse.arrayBuffer())
    const ext = (ad.base_image.storage_path as string).split('.').pop() || 'png'
    const mimeType = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : 'image/png'

    // 4. Build the compositing prompt
    const roleHints: Record<string, string> = {
      headline: 'large, bold, upper area',
      subline: 'medium, below headline',
      cta: 'button style, lower area, accent color',
      tagline: 'small, bottom edge',
    }

    // deno-lint-ignore no-explicit-any
    const overlayLines = captions.map((cap: any) => {
      const role = cap.role
      if (role && roleHints[role]) {
        return `- ${role.toUpperCase()} (${roleHints[role]}): "${cap.text}"`
      }
      return `- OVERLAY TEXT: "${cap.text}"`
    }).join('\n')

    const feedbackNote = ad.feedback ? `\nAdditional creative direction: ${ad.feedback}` : ''
    const prompt = `Add the following text overlays to this image:\n${overlayLines}\nKeep the image composition intact. Use white text with subtle shadows for readability.${feedbackNote}`

    // 5. Call Gemini to edit the image
    console.log(`[composite] Ad ${adId}: calling Gemini...`)
    let compositedData: Uint8Array
    try {
      const result = await editImage(imgBuffer, mimeType, prompt)
      compositedData = result.data
    } catch (err) {
      console.error('[composite] Gemini failed:', (err as Error).message)
      return jsonResponse({ error: 'Image compositing failed', detail: (err as Error).message }, 500)
    }

    // 6. Upload the composited image
    const serviceClient = createServiceClient()
    const compositedStoragePath = `composited/${adId}.png`

    const { error: uploadError } = await serviceClient.storage
      .from('creative')
      .upload(compositedStoragePath, compositedData, {
        contentType: 'image/png',
        upsert: true,
      })

    if (uploadError) {
      console.error('[composite] Storage upload failed:', uploadError)
      return jsonResponse({ error: 'Failed to upload composited image', detail: uploadError.message }, 500)
    }

    // 7. Update the ad row
    const { data: updatedAd, error: updateError } = await userClient
      .from('ad')
      .update({ composited_image_path: compositedStoragePath, generation_prompt: prompt })
      .eq('id', adId)
      .select()
      .single()

    if (updateError) {
      return jsonResponse({ error: 'Failed to update ad', detail: updateError.message }, 500)
    }

    console.log(`[composite] Ad ${adId}: uploaded to ${compositedStoragePath}`)
    return jsonResponse({
      ad: updatedAd,
      composited_image_path: compositedStoragePath,
      composited_image_url: `${supabaseUrl}/storage/v1/object/public/creative/${compositedStoragePath}`,
    })
  } catch (err) {
    console.error('composite error:', err)
    return jsonResponse({ error: (err as Error).message }, 500)
  }
})

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
