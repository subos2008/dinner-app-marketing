import { corsHeaders } from '../_shared/cors.ts'
import { createUserClient } from '../_shared/supabase.ts'
import { generateCaptions } from '../_shared/gemini.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body = await req.json()
    const { mode } = body // 'generate' or 'suggest'

    if (mode === 'suggest') {
      return await handleSuggest(body)
    }

    // Default: generate and persist captions
    const userClient = createUserClient(req)
    const { data: { user }, error: authError } = await userClient.auth.getUser()
    if (authError || !user) {
      return jsonResponse({ error: 'Unauthorized' }, 401)
    }

    return await handleGenerate(body, userClient)
  } catch (err) {
    console.error('generate-captions error:', err)
    return jsonResponse({ error: (err as Error).message }, 500)
  }
})

// --- Generate & persist captions ---

// deno-lint-ignore no-explicit-any
async function handleGenerate(body: any, userClient: any) {
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

  console.log('[generate-captions] calling Gemini...')
  let geminiOutput: string
  try {
    geminiOutput = await generateCaptions(geminiPrompt)
  } catch (err) {
    console.error('[generate-captions] Gemini failed:', (err as Error).message)
    return jsonResponse({ error: 'Caption generation failed', detail: (err as Error).message }, 500)
  }

  let captions: string[]
  try {
    const jsonMatch = geminiOutput.match(/\[[\s\S]*\]/)
    if (!jsonMatch) throw new Error('No JSON array found in output')
    captions = JSON.parse(jsonMatch[0])
    if (!Array.isArray(captions)) throw new Error('Parsed value is not an array')
    captions = captions.filter((c: unknown) => typeof c === 'string' && (c as string).trim().length > 0)
  } catch {
    console.error(`[generate-captions] Failed to parse. Output:\n${geminiOutput.slice(0, 500)}`)
    return jsonResponse({
      error: 'Failed to parse generated captions',
      geminiOutput: geminiOutput.slice(0, 500),
    }, 500)
  }

  const created = []
  for (const text of captions) {
    const { data: cap, error } = await userClient
      .from('caption')
      .insert({ text: text.trim(), generation_prompt_id: genPromptId })
      .select()
      .single()
    if (!error && cap) created.push(cap)
  }

  console.log(`[generate-captions] created ${created.length} captions`)
  return jsonResponse({ captions: created })
}

// --- Suggest captions (ephemeral, no DB writes) ---

// deno-lint-ignore no-explicit-any
async function handleSuggest(body: any) {
  const { brief, segment_hint, image_prompt } = body
  if (!image_prompt) return jsonResponse({ error: 'image_prompt is required' }, 400)

  const geminiPrompt = [
    brief ? `Context — creative brief:\n${brief}\n\n---\n\n` : '',
    segment_hint ? `Segment style hint: ${segment_hint}\n\n` : '',
    `An ad image was generated with this prompt: "${image_prompt}"\n\n`,
    `Generate 4 short ad caption suggestions for this image. Return a JSON array of objects with "text" and "role" fields.\n`,
    `Roles should be: 1 headline (punchy, 5-8 words), 1 subline (supporting, 8-12 words), 1 cta (call to action, 3-5 words), 1 tagline (brand voice, 5-8 words).\n`,
    `Keep copy warm, honest, direct. Not corporate. Not cringey.\n`,
    `Return ONLY the JSON array, no other text.`,
  ].join('')

  console.log('[generate-captions] suggest: calling Gemini...')
  let geminiOutput: string
  try {
    geminiOutput = await generateCaptions(geminiPrompt)
  } catch (err) {
    console.error('[generate-captions] suggest failed:', (err as Error).message)
    return jsonResponse({ error: 'Failed to generate caption suggestions' }, 500)
  }

  let suggestions
  try {
    const jsonMatch = geminiOutput.match(/\[[\s\S]*\]/)
    if (!jsonMatch) throw new Error('No JSON array found')
    suggestions = JSON.parse(jsonMatch[0])
  } catch {
    console.error(`[generate-captions] Failed to parse suggestions:\n${geminiOutput.slice(0, 500)}`)
    return jsonResponse({ error: 'Failed to parse caption suggestions' }, 500)
  }

  console.log(`[generate-captions] suggest: returned ${suggestions.length} suggestions`)
  return jsonResponse({ suggestions })
}

// --- Helpers ---

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
