import { corsHeaders } from '../_shared/cors.ts'
import { createUserClient, createServiceClient } from '../_shared/supabase.ts'
import { submitVideoGeneration } from '../_shared/veo.ts'

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

    const { prompt, brief, segment_hint, aspect_ratio, duration, model_tier, source_image_id, source_image_path } = await req.json()
    if (!prompt) return jsonResponse({ error: 'prompt is required' }, 400)
    if (!aspect_ratio) return jsonResponse({ error: 'aspect_ratio is required' }, 400)
    if (!duration) return jsonResponse({ error: 'duration is required' }, 400)
    if (!model_tier || !['fast', 'standard'].includes(model_tier)) {
      return jsonResponse({ error: 'model_tier must be fast or standard' }, 400)
    }

    // Create generation_prompt row
    const genPromptId = await upsertGenerationPrompt(userClient, 'video', prompt, brief)

    // Build enhanced prompt
    const veoPrompt = [
      brief ? `Context — creative brief:\n${brief}\n\n---\n\n` : '',
      segment_hint ? `Segment style hint: ${segment_hint}\n\n` : '',
      prompt,
    ].join('')

    // Download source image from storage (by id or direct path)
    let sourceImageData: Uint8Array | undefined
    let sourceImageMimeType: string | undefined
    const storagePath = source_image_path || (source_image_id ? null : undefined)

    if (source_image_id && !source_image_path) {
      // Look up base_image by id
      const { data: imgRow, error: imgError } = await userClient
        .from('base_image')
        .select('storage_path')
        .eq('id', source_image_id)
        .single()
      if (imgError || !imgRow) {
        return jsonResponse({ error: 'Source image not found' }, 404)
      }

      const serviceClient = createServiceClient()
      const { data: fileData, error: dlError } = await serviceClient.storage
        .from('creative')
        .download(imgRow.storage_path)
      if (dlError || !fileData) {
        return jsonResponse({ error: 'Failed to download source image' }, 500)
      }

      sourceImageData = new Uint8Array(await fileData.arrayBuffer())
      sourceImageMimeType = 'image/png'
    } else if (source_image_path) {
      // Download directly by storage path (for composited images)
      const serviceClient = createServiceClient()
      const { data: fileData, error: dlError } = await serviceClient.storage
        .from('creative')
        .download(source_image_path)
      if (dlError || !fileData) {
        return jsonResponse({ error: 'Failed to download source image' }, 500)
      }

      sourceImageData = new Uint8Array(await fileData.arrayBuffer())
      sourceImageMimeType = 'image/png'
    }

    console.log('[generate-video] submitting to Veo...')
    let operation
    try {
      operation = await submitVideoGeneration({
        prompt: veoPrompt,
        aspectRatio: aspect_ratio,
        durationSeconds: duration,
        modelTier: model_tier,
        sourceImageData,
        sourceImageMimeType,
      })
    } catch (err) {
      console.error('[generate-video] Veo submit failed:', (err as Error).message)
      return jsonResponse({ error: 'Video generation failed: ' + (err as Error).message }, 500)
    }

    console.log('[generate-video] operation submitted:', operation.name)
    return jsonResponse({
      operationName: operation.name,
      generationPromptId: genPromptId,
    }, 202)

  } catch (err) {
    console.error('generate-video error:', err)
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
