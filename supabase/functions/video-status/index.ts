import { corsHeaders } from '../_shared/cors.ts'
import { createUserClient, createServiceClient } from '../_shared/supabase.ts'
import { checkVideoOperation } from '../_shared/veo.ts'

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

    const { operationName, generationPromptId, prompt, aspect_ratio, duration, model_tier, source_image_id } = await req.json()
    if (!operationName) return jsonResponse({ error: 'operationName is required' }, 400)

    console.log('[video-status] checking operation:', operationName)

    const result = await checkVideoOperation(operationName)

    if (!result.done) {
      return jsonResponse({ status: 'pending' })
    }

    if (result.error) {
      console.error('[video-status] operation failed:', result.error)
      return jsonResponse({ status: 'error', error: result.error })
    }

    // Download the video from Google's URL
    console.log('[video-status] downloading video...')
    const videoResp = await fetch(result.videoUrl!)
    if (!videoResp.ok) {
      return jsonResponse({ status: 'error', error: 'Failed to download generated video' })
    }
    const videoBytes = new Uint8Array(await videoResp.arrayBuffer())

    // Upload to Storage
    const serviceClient = createServiceClient()
    const timestamp = Date.now()
    const storagePath = `generated/${timestamp}.mp4`
    const filename = `generated-${timestamp}.mp4`

    const { error: uploadError } = await serviceClient.storage
      .from('creative')
      .upload(storagePath, videoBytes, {
        contentType: 'video/mp4',
        upsert: true,
      })

    if (uploadError) {
      console.error('[video-status] Storage upload failed:', uploadError)
      return jsonResponse({ status: 'error', error: 'Failed to upload video: ' + uploadError.message })
    }

    // Create base_video row
    const { data: video, error: insertError } = await userClient
      .from('base_video')
      .insert({
        filename,
        storage_path: storagePath,
        prompt: prompt || null,
        source_image_id: source_image_id || null,
        generation_prompt_id: generationPromptId || null,
        aspect_ratio: aspect_ratio || '9:16',
        duration_seconds: duration || 8,
        model_tier: model_tier || 'fast',
      })
      .select()
      .single()

    if (insertError) {
      console.error('[video-status] DB insert failed:', insertError)
      return jsonResponse({ status: 'error', error: 'Failed to save video: ' + insertError.message })
    }

    console.log(`[video-status] video created: ${video.id}`)
    return jsonResponse({ status: 'done', video })

  } catch (err) {
    console.error('video-status error:', err)
    return jsonResponse({ error: (err as Error).message }, 500)
  }
})

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
