import { GoogleGenAI } from 'https://esm.sh/@google/genai'

const MODELS: Record<string, string> = {
  fast: 'veo-3.1-fast-generate-preview',
  standard: 'veo-3.1-generate-preview',
}

let genAI: GoogleGenAI | null = null

function getClient(): GoogleGenAI {
  if (!genAI) {
    const apiKey = Deno.env.get('GOOGLE_AI_API_KEY')
    if (!apiKey) throw new Error('GOOGLE_AI_API_KEY not set')
    genAI = new GoogleGenAI({ apiKey })
  }
  return genAI
}

/** Encode Uint8Array to base64 string */
function base64Encode(data: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < data.length; i++) {
    binary += String.fromCharCode(data[i])
  }
  return btoa(binary)
}

export interface SubmitVideoOpts {
  prompt: string
  aspectRatio: string
  durationSeconds: number
  modelTier: 'fast' | 'standard'
  sourceImageData?: Uint8Array
  sourceImageMimeType?: string
}

// deno-lint-ignore no-explicit-any
export async function submitVideoGeneration(opts: SubmitVideoOpts): Promise<any> {
  const client = getClient()
  const model = MODELS[opts.modelTier]
  if (!model) throw new Error('Invalid model tier: ' + opts.modelTier)

  // deno-lint-ignore no-explicit-any
  const params: any = {
    model,
    prompt: opts.prompt,
    config: {
      numberOfVideos: 1,
      aspectRatio: opts.aspectRatio,
      durationSeconds: opts.durationSeconds,
    },
  }

  // Image-to-video: pass source image
  if (opts.sourceImageData && opts.sourceImageMimeType) {
    params.image = {
      imageBytes: base64Encode(opts.sourceImageData),
      mimeType: opts.sourceImageMimeType,
    }
  }

  const operation = await client.models.generateVideos(params)
  return operation
}

export async function checkVideoOperation(operationName: string): Promise<{
  done: boolean
  videoUrl?: string
  error?: string
}> {
  // Poll via REST API directly — the SDK's getVideosOperation requires
  // the original operation object (not just the name string)
  const apiKey = Deno.env.get('GOOGLE_AI_API_KEY')!
  const url = `https://generativelanguage.googleapis.com/v1beta/${operationName}?key=${apiKey}`

  const resp = await fetch(url)
  if (!resp.ok) {
    const text = await resp.text()
    return { done: true, error: `Poll failed (${resp.status}): ${text}` }
  }

  const data = await resp.json()
  console.log('[veo] poll response:', JSON.stringify(data).slice(0, 2000))

  if (data.error) {
    const errMsg = typeof data.error === 'string'
      ? data.error
      : (data.error.message || JSON.stringify(data.error))
    return { done: true, error: errMsg }
  }

  if (!data.done) {
    return { done: false }
  }

  // Extract video URL — REST API uses generateVideoResponse.generatedSamples
  const videos = data.response?.generateVideoResponse?.generatedSamples
    || data.response?.generatedVideos
  if (!videos || videos.length === 0) {
    return { done: true, error: 'No videos generated (may have been filtered by safety)' }
  }

  const videoUri = videos[0]?.video?.uri
  if (!videoUri) {
    return { done: true, error: 'No video URI in response' }
  }

  const videoUrl = videoUri.includes('?') ? `${videoUri}&key=${apiKey}` : `${videoUri}?key=${apiKey}`
  return { done: true, videoUrl }
}
