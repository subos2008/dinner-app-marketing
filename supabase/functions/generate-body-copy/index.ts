import { corsHeaders } from '../_shared/cors.ts'
import { generateCaptions } from '../_shared/gemini.ts'

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
    console.error('generate-body-copy error:', err)
    return jsonResponse({ error: (err as Error).message }, 500)
  }
})

// --- Generate body copy (ephemeral, no DB writes) ---

// deno-lint-ignore no-explicit-any
async function handleGenerate(body: any) {
  const { prompt, brief, segment_hint } = body
  if (!prompt) return jsonResponse({ error: 'prompt is required' }, 400)

  const geminiPrompt = [
    brief ? `Context — creative brief:\n${brief}\n\n---\n\n` : '',
    segment_hint ? `Segment style hint: ${segment_hint}\n\n` : '',
    `Ad copy request: ${prompt}\n\n`,
    `Generate 5 ad body copy variants for Meta (Facebook/Instagram) ads.\n`,
    `Each variant should have:\n`,
    `- "headline": A short punchy headline (3-6 words) that appears bold below the image\n`,
    `- "text": The main body text (1-3 sentences) that appears above the image in the feed\n\n`,
    `The body text should hook the reader, build emotion, and make the product feel like the obvious next step.\n`,
    `The headline should be direct and action-oriented.\n\n`,
    `Keep copy warm, honest, direct. Not corporate. Not cringey.\n\n`,
    `Return a JSON array of objects with "headline" and "text" fields.\n`,
    `Return ONLY the JSON array, no other text.`,
  ].join('')

  console.log('[generate-body-copy] generate: calling Gemini...')
  let geminiOutput: string
  try {
    geminiOutput = await generateCaptions(geminiPrompt)
  } catch (err) {
    console.error('[generate-body-copy] Gemini failed:', (err as Error).message)
    return jsonResponse({ error: 'Body copy generation failed: ' + (err as Error).message }, 500)
  }

  let suggestions
  try {
    const jsonMatch = geminiOutput.match(/\[[\s\S]*\]/)
    if (!jsonMatch) throw new Error('No JSON array found in output')
    suggestions = JSON.parse(jsonMatch[0])
    if (!Array.isArray(suggestions)) throw new Error('Parsed value is not an array')
  } catch {
    console.error(`[generate-body-copy] Failed to parse. Output:\n${geminiOutput.slice(0, 500)}`)
    return jsonResponse({ error: 'Failed to parse generated body copy', geminiOutput: geminiOutput.slice(0, 500) }, 500)
  }

  console.log(`[generate-body-copy] generate: returned ${suggestions.length} suggestions`)
  return jsonResponse({ suggestions })
}

// --- Suggest body copy after image gen (ephemeral, no DB writes) ---

// deno-lint-ignore no-explicit-any
async function handleSuggest(body: any) {
  const { brief, segment_hint, image_prompt } = body
  if (!image_prompt) return jsonResponse({ error: 'image_prompt is required' }, 400)

  const geminiPrompt = [
    brief ? `Context — creative brief:\n${brief}\n\n---\n\n` : '',
    segment_hint ? `Segment style hint: ${segment_hint}\n\n` : '',
    `An ad image was generated with this prompt: "${image_prompt}"\n\n`,
    `Generate 3 body copy variants for a Meta (Facebook/Instagram) ad using this image.\n`,
    `Each variant should have:\n`,
    `- "headline": A short punchy headline (3-6 words) shown bold below the image\n`,
    `- "text": Main body text (1-3 sentences) shown above the image in the feed\n\n`,
    `Keep copy warm, honest, direct. Not corporate. Not cringey.\n`,
    `Return ONLY a JSON array of objects with "headline" and "text" fields, no other text.`,
  ].join('')

  console.log('[generate-body-copy] suggest: calling Gemini...')
  let geminiOutput: string
  try {
    geminiOutput = await generateCaptions(geminiPrompt)
  } catch (err) {
    console.error('[generate-body-copy] suggest failed:', (err as Error).message)
    return jsonResponse({ error: 'Failed to generate body copy suggestions' }, 500)
  }

  let suggestions
  try {
    const jsonMatch = geminiOutput.match(/\[[\s\S]*\]/)
    if (!jsonMatch) throw new Error('No JSON array found')
    suggestions = JSON.parse(jsonMatch[0])
  } catch {
    console.error(`[generate-body-copy] Failed to parse suggestions:\n${geminiOutput.slice(0, 500)}`)
    return jsonResponse({ error: 'Failed to parse body copy suggestions' }, 500)
  }

  console.log(`[generate-body-copy] suggest: returned ${suggestions.length} suggestions`)
  return jsonResponse({ suggestions })
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
