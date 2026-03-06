import { corsHeaders } from '../_shared/cors.ts'
import { createUserClient, createServiceClient } from '../_shared/supabase.ts'
import { generateImage, editImage, generateCaptions } from '../_shared/gemini.ts'

Deno.serve(async (req) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Auth: validate user
    const userClient = createUserClient(req)
    const { data: { user }, error: authError } = await userClient.auth.getUser()
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const body = await req.json()
    const { type } = body

    if (type === 'image') {
      return await handleImageGeneration(body, userClient)
    } else if (type === 'caption') {
      return await handleCaptionGeneration(body, userClient)
    } else if (type === 'composite') {
      return await handleComposite(body, userClient)
    } else {
      return jsonResponse({ error: 'type must be "image", "caption", or "composite"' }, 400)
    }
  } catch (err) {
    console.error('generate function error:', err)
    return jsonResponse({ error: (err as Error).message }, 500)
  }
})

// --- Image Generation ---

// deno-lint-ignore no-explicit-any
async function handleImageGeneration(body: any, userClient: any) {
  const { prompt, brief, segment_hint } = body
  if (!prompt) return jsonResponse({ error: 'prompt is required' }, 400)

  // Create generation_prompt row (reuse if exists)
  const genPromptId = await upsertGenerationPrompt(userClient, 'image', prompt, brief)

  // Build Gemini prompt
  const geminiPrompt = [
    brief ? `Context — creative brief:\n${brief}\n\n---\n\n` : '',
    segment_hint ? `Segment style hint: ${segment_hint}\n\n` : '',
    `Generate an ad image based on this request: ${prompt}\n\n`,
    'Make the image suitable for a social media ad (Instagram/Facebook). ',
    'Do NOT include any text, words, letters, captions, headlines, or watermarks in the image. The image should be purely visual with no text overlay — text will be added separately later.',
  ].join('')

  console.log('[generate] Image: calling Gemini...')
  let imageData: Uint8Array
  try {
    const result = await generateImage(geminiPrompt)
    imageData = result.data
  } catch (err) {
    console.error('[generate] Gemini image generation failed:', (err as Error).message)
    return jsonResponse({ error: 'Image generation failed', detail: (err as Error).message }, 500)
  }

  // Upload to Storage via service client
  const serviceClient = createServiceClient()
  const timestamp = Date.now()
  const storagePath = `generated/${timestamp}.png`
  const filename = `generated-${timestamp}.png`

  const { error: uploadError } = await serviceClient.storage
    .from('creative')
    .upload(storagePath, imageData, {
      contentType: 'image/png',
      upsert: true,
    })

  if (uploadError) {
    console.error('[generate] Storage upload failed:', uploadError)
    return jsonResponse({ error: 'Failed to upload image', detail: uploadError.message }, 500)
  }

  // Create base_image row
  const { data: image, error: insertError } = await userClient
    .from('base_image')
    .insert({ filename, storage_path: storagePath, prompt, generation_prompt_id: genPromptId })
    .select()
    .single()

  if (insertError) {
    return jsonResponse({ error: 'Failed to create image row', detail: insertError.message }, 500)
  }

  console.log(`[generate] Image created: ${image.id}`)
  return jsonResponse({ image })
}

// --- Caption Generation ---

// deno-lint-ignore no-explicit-any
async function handleCaptionGeneration(body: any, userClient: any) {
  const { prompt, brief, segment_hint } = body
  if (!prompt) return jsonResponse({ error: 'prompt is required' }, 400)

  const genPromptId = await upsertGenerationPrompt(userClient, 'caption', prompt, brief)

  const geminiPrompt = [
    brief ? `Context — creative brief:\n${brief}\n\n---\n\n` : '',
    segment_hint ? `Segment style hint: ${segment_hint}\n\n` : '',
    `Generate short ad caption text based on this request: ${prompt}\n\n`,
    'Output ONLY a JSON array of caption strings. Each caption should be short (suitable for overlaying on an image). ',
    'Generate 3-5 captions. Output raw JSON with no markdown fences, no explanation — just the array.',
  ].join('')

  console.log('[generate] Captions: calling Gemini...')
  let geminiOutput: string
  try {
    geminiOutput = await generateCaptions(geminiPrompt)
  } catch (err) {
    console.error('[generate] Gemini caption generation failed:', (err as Error).message)
    return jsonResponse({ error: 'Caption generation failed', detail: (err as Error).message }, 500)
  }

  // Parse JSON array
  let captions: string[]
  try {
    const jsonMatch = geminiOutput.match(/\[[\s\S]*\]/)
    if (!jsonMatch) throw new Error('No JSON array found in output')
    captions = JSON.parse(jsonMatch[0])
    if (!Array.isArray(captions)) throw new Error('Parsed value is not an array')
    captions = captions.filter((c: unknown) => typeof c === 'string' && (c as string).trim().length > 0)
  } catch {
    console.error(`[generate] Failed to parse captions. Output:\n${geminiOutput.slice(0, 500)}`)
    return jsonResponse({
      error: 'Failed to parse generated captions',
      geminiOutput: geminiOutput.slice(0, 500),
    }, 500)
  }

  // Create caption rows
  const created = []
  for (const text of captions) {
    const { data: cap, error } = await userClient
      .from('caption')
      .insert({ text: text.trim(), generation_prompt_id: genPromptId })
      .select()
      .single()
    if (!error && cap) created.push(cap)
  }

  console.log(`[generate] Created ${created.length} captions`)
  return jsonResponse({ captions: created })
}

// --- Ad Compositing ---

// deno-lint-ignore no-explicit-any
async function handleComposite(body: any, userClient: any) {
  const { adId } = body
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
  console.log(`[generate] Ad ${adId}: calling Gemini for compositing...`)
  let compositedData: Uint8Array
  try {
    const result = await editImage(imgBuffer, mimeType, prompt)
    compositedData = result.data
  } catch (err) {
    console.error('[generate] Gemini compositing failed:', (err as Error).message)
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
    console.error('[generate] Storage upload failed:', uploadError)
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

  console.log(`[generate] Ad ${adId}: composited image uploaded to ${compositedStoragePath}`)
  return jsonResponse({
    ad: updatedAd,
    composited_image_path: compositedStoragePath,
    composited_image_url: `${supabaseUrl}/storage/v1/object/public/creative/${compositedStoragePath}`,
  })
}

// --- Helpers ---

// deno-lint-ignore no-explicit-any
async function upsertGenerationPrompt(client: any, type: string, prompt: string, brief?: string): Promise<string> {
  // Reuse existing prompt if type + prompt text match
  const { data: existing } = await client
    .from('generation_prompt')
    .select('*')
    .eq('type', type)
    .eq('prompt', prompt)
    .limit(1)
    .single()

  if (existing) return existing.id

  const { data, error } = await client
    .from('generation_prompt')
    .insert({ type, prompt, brief: brief || null })
    .select()
    .single()

  if (error) throw error
  return data.id
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
