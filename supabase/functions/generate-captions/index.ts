import { corsHeaders } from '../_shared/cors.ts'
import { generateCaptions } from '../_shared/gemini.ts'

const ROLE_PROMPTS: Record<string, string> = {
  headline: 'Generate 5 short, punchy headlines (5-8 words each). Bold, attention-grabbing.',
  subline: 'Generate 5 supporting sublines (8-12 words each). Expand on the hook, add context.',
  cta: 'Generate 5 calls to action (3-5 words each). Direct, action-oriented.',
  tagline: 'Generate 5 brand taglines (5-8 words each). Warm, honest, memorable.',
}

const VALID_ROLES = Object.keys(ROLE_PROMPTS)

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body = await req.json()
    const { mode } = body

    if (mode === 'suggest') {
      return await handleSuggest(body)
    }

    return await handleGenerate(body)
  } catch (err) {
    console.error('generate-captions error:', err)
    return jsonResponse({ error: (err as Error).message }, 500)
  }
})

// --- Generate captions (ephemeral, no DB writes) ---

// deno-lint-ignore no-explicit-any
async function handleGenerate(body: any) {
  const { role, brief, segment_hint } = body
  if (!role || !VALID_ROLES.includes(role)) {
    return jsonResponse({ error: `role is required and must be one of: ${VALID_ROLES.join(', ')}` }, 400)
  }

  const geminiPrompt = [
    brief ? `Context — creative brief:\n${brief}\n\n---\n\n` : '',
    segment_hint ? `Segment style hint: ${segment_hint}\n\n` : '',
    `${ROLE_PROMPTS[role]}\n\n`,
    `Keep copy warm, honest, direct. Not corporate. Not cringey.\n\n`,
    `Return a JSON array of objects with "text" and "role" fields. The "role" field should be "${role}" for all items.\n`,
    `Return ONLY the JSON array, no other text.`,
  ].join('')

  console.log(`[generate-captions] generate role=${role}: calling Gemini...`)
  let geminiOutput: string
  try {
    geminiOutput = await generateCaptions(geminiPrompt)
  } catch (err) {
    console.error('[generate-captions] Gemini failed:', (err as Error).message)
    return jsonResponse({ error: 'Caption generation failed', detail: (err as Error).message }, 500)
  }

  let suggestions
  try {
    const jsonMatch = geminiOutput.match(/\[[\s\S]*\]/)
    if (!jsonMatch) throw new Error('No JSON array found in output')
    suggestions = JSON.parse(jsonMatch[0])
    if (!Array.isArray(suggestions)) throw new Error('Parsed value is not an array')
  } catch {
    console.error(`[generate-captions] Failed to parse. Output:\n${geminiOutput.slice(0, 500)}`)
    return jsonResponse({ error: 'Failed to parse generated captions', geminiOutput: geminiOutput.slice(0, 500) }, 500)
  }

  console.log(`[generate-captions] generate: returned ${suggestions.length} suggestions`)
  return jsonResponse({ suggestions })
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

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
