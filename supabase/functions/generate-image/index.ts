import { corsHeaders } from '../_shared/cors.ts'
import { createUserClient, createServiceClient } from '../_shared/supabase.ts'
import { generateImage } from '../_shared/gemini.ts'

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

    const { prompt, brief, segment_hint } = await req.json()
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

    console.log('[generate-image] calling Gemini...')
    let imageData: Uint8Array
    try {
      const result = await generateImage(geminiPrompt)
      imageData = result.data
    } catch (err) {
      console.error('[generate-image] Gemini failed:', (err as Error).message)
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
      console.error('[generate-image] Storage upload failed:', uploadError)
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

    console.log(`[generate-image] created: ${image.id}`)
    return jsonResponse({ image })
  } catch (err) {
    console.error('generate-image error:', err)
    return jsonResponse({ error: (err as Error).message }, 500)
  }
})

// deno-lint-ignore no-explicit-any
async function upsertGenerationPrompt(client: any, type: string, prompt: string, brief?: string): Promise<string> {
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
