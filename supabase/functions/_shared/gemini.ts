import { GoogleGenAI } from 'https://esm.sh/@google/genai'

/** Encode Uint8Array to base64 string */
function base64Encode(data: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < data.length; i++) {
    binary += String.fromCharCode(data[i])
  }
  return btoa(binary)
}

const MODEL = 'gemini-2.5-flash-image'

let genAI: GoogleGenAI | null = null

function getClient(): GoogleGenAI {
  if (!genAI) {
    const apiKey = Deno.env.get('GOOGLE_AI_API_KEY')
    if (!apiKey) throw new Error('GOOGLE_AI_API_KEY not set')
    genAI = new GoogleGenAI({ apiKey })
  }
  return genAI
}

interface ImageResult {
  data: Uint8Array
  text: string | null
}

/** Generate a new image from a text prompt */
export async function generateImage(prompt: string): Promise<ImageResult> {
  const client = getClient()
  const response = await client.models.generateContent({
    model: MODEL,
    contents: prompt,
  })
  return extractImage(response)
}

/** Edit an existing image with a text prompt */
export async function editImage(
  imageData: Uint8Array,
  mimeType: string,
  prompt: string
): Promise<ImageResult> {
  const client = getClient()
  const response = await client.models.generateContent({
    model: MODEL,
    contents: [
      {
        parts: [
          {
            inlineData: {
              data: base64Encode(imageData),
              mimeType,
            },
          },
          { text: prompt },
        ],
      },
    ],
  })
  return extractImage(response)
}

/** Generate captions (text-only response) */
export async function generateCaptions(prompt: string): Promise<string> {
  const client = getClient()
  const response = await client.models.generateContent({
    model: MODEL,
    contents: prompt,
  })

  let text = ''
  if (response.candidates && response.candidates[0]?.content?.parts) {
    for (const part of response.candidates[0].content.parts) {
      if (part.text) text += part.text
    }
  }
  if (!text) throw new Error('No text in Gemini response')
  return text
}

// deno-lint-ignore no-explicit-any
function extractImage(response: any): ImageResult {
  let data: Uint8Array | null = null
  let text: string | null = null

  if (response.candidates && response.candidates[0]?.content?.parts) {
    for (const part of response.candidates[0].content.parts) {
      if (part.text) {
        text = (text || '') + part.text
      }
      if (part.inlineData?.data) {
        // Decode base64 string to Uint8Array
        const binaryStr = atob(part.inlineData.data)
        const bytes = new Uint8Array(binaryStr.length)
        for (let i = 0; i < binaryStr.length; i++) {
          bytes[i] = binaryStr.charCodeAt(i)
        }
        data = bytes
      }
    }
  }

  if (!data) throw new Error('No image in Gemini response')
  return { data, text }
}
