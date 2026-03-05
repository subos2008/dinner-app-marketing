'use strict';

const { GoogleGenAI } = require('@google/genai');

const MODEL = 'gemini-2.5-flash-image';

let genAI;

function getClient() {
  if (!genAI) {
    const apiKey = process.env.GOOGLE_AI_API_KEY;
    if (!apiKey) throw new Error('GOOGLE_AI_API_KEY not set');
    genAI = new GoogleGenAI({ apiKey });
  }
  return genAI;
}

// Generate a new image from a text prompt.
// Returns { buffer: Buffer, text: string|null }
async function generateImage(prompt) {
  const client = getClient();
  const response = await client.models.generateContent({
    model: MODEL,
    contents: prompt,
  });

  return extractImage(response);
}

// Edit an existing image with a text prompt.
// imageBuffer: Buffer of the source image
// mimeType: e.g. 'image/png'
// prompt: text describing the edit
// Returns { buffer: Buffer, text: string|null }
async function editImage(imageBuffer, mimeType, prompt) {
  const client = getClient();
  const response = await client.models.generateContent({
    model: MODEL,
    contents: [
      {
        parts: [
          {
            inlineData: {
              data: imageBuffer.toString('base64'),
              mimeType,
            },
          },
          { text: prompt },
        ],
      },
    ],
  });

  return extractImage(response);
}

// Generate captions (text-only response).
// Returns the raw text response.
async function generateCaptions(prompt) {
  const client = getClient();
  const response = await client.models.generateContent({
    model: MODEL,
    contents: prompt,
  });

  let text = '';
  if (response.candidates && response.candidates[0]?.content?.parts) {
    for (const part of response.candidates[0].content.parts) {
      if (part.text) text += part.text;
    }
  }
  if (!text) throw new Error('No text in Gemini response');
  return text;
}

function extractImage(response) {
  let buffer = null;
  let text = null;

  if (response.candidates && response.candidates[0]?.content?.parts) {
    for (const part of response.candidates[0].content.parts) {
      if (part.text) {
        text = (text || '') + part.text;
      }
      if (part.inlineData?.data) {
        buffer = Buffer.from(part.inlineData.data, 'base64');
      }
    }
  }

  if (!buffer) throw new Error('No image in Gemini response');
  return { buffer, text };
}

module.exports = { generateImage, editImage, generateCaptions };
