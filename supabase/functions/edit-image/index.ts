import { corsHeaders } from '../_shared/cors.ts'
import { createUserClient, createStorageClient } from  '../_shared/supabase.ts'
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

    const { base_image_id, prompt } = await req.json()
    if (!base_image_id) return jsonResponse({ error: 'base_image_id is required' }, 400)
    if (!prompt) return jsonResponse({ error: 'prompt is required' }, 400)

    // 1. Fetch source image metadata
    const { data: sourceImage, error: fetchError } = await userClient
      .from('base_image')
      .select('*')
      .eq('id', base_image_id)
      .single()

    if (fetchError || !sourceImage) {
      return jsonResponse({ error: 'Source image not found' }, 404)
    }

    // 2. Download original from Storage
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const imgUrl = `${supabaseUrl}/storage/v1/object/public/creative/${sourceImage.storage_path}`
    const imgResponse = await fetch(imgUrl)
    if (!imgResponse.ok) {
      return jsonResponse({ error: `Failed to download source image: ${imgResponse.status}` }, 502)
    }
    const imgBuffer = new Uint8Array(await imgResponse.arrayBuffer())
    const ext = (sourceImage.storage_path as string).split('.').pop() || 'png'
    const mimeType = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : 'image/png'

    // 3. Call Gemini editImage
    console.log(`[edit-image] Editing ${base_image_id}: calling Gemini...`)
    let editedData: Uint8Array
    try {
      const result = await editImage(imgBuffer, mimeType, prompt, sourceImage.aspect_ratio || undefined)
      editedData = result.data
    } catch (err) {
      console.error('[edit-image] Gemini failed:', (err as Error).message)
      return jsonResponse({ error: 'Image editing failed: ' + (err as Error).message }, 500)
    }

    // 4. Upload to Storage
    const serviceClient = createStorageClient()
    const timestamp = Date.now()
    const storagePath = `generated/${timestamp}.png`
    const filename = `edited-${timestamp}.png`

    const { error: uploadError } = await serviceClient.storage
      .from('creative')
      .upload(storagePath, editedData, {
        contentType: 'image/png',
        upsert: true,
      })

    if (uploadError) {
      console.error('[edit-image] Storage upload failed:', uploadError)
      return jsonResponse({ error: 'Failed to upload edited image: ' + uploadError.message }, 500)
    }

    // 5. Create new base_image row
    const { data: newImage, error: insertError } = await userClient
      .from('base_image')
      .insert({
        filename,
        storage_path: storagePath,
        prompt,
        aspect_ratio: sourceImage.aspect_ratio,
      })
      .select()
      .single()

    if (insertError) {
      return jsonResponse({ error: 'Failed to create image row: ' + insertError.message }, 500)
    }

    console.log(`[edit-image] Created: ${newImage.id} from ${base_image_id}`)
    return jsonResponse({ image: newImage })
  } catch (err) {
    console.error('edit-image error:', err)
    return jsonResponse({ error: (err as Error).message }, 500)
  }
})

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
