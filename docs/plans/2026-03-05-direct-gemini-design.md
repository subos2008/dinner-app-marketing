# Direct Gemini API Integration

## Problem
Image generation uses claude -p → Nano Banana MCP → Gemini API. The subprocess chain is slow, fragile, and we can't control where images are saved. Nano Banana is just a thin MCP wrapper around `@google/genai`.

## Solution
Call Gemini directly from the server via `@google/genai` SDK. Replace all 3 claude -p subprocess calls.

## New module: `app/gemini.js`
- `generateImage(prompt)` → returns `{ buffer, text }`
- `editImage(imageBuffer, prompt)` → returns `{ buffer, text }`
- `generateCaptions(prompt)` → returns `string[]`
- All use model `gemini-2.5-flash-image`
- API key from `GOOGLE_AI_API_KEY` env var

## server.js changes
- Remove `runClaude()`, `parseImagePath()`, `child_process` requires
- Image gen: `gemini.generateImage()` → get buffer → upload to Storage
- Compositing: `gemini.editImage()` → get buffer → upload to Storage
- Captions: `gemini.generateCaptions()` → create DB rows
- OTel spans wrap Gemini calls

## Env
- `GOOGLE_AI_API_KEY` in `.env.local`, exported from `start.sh`

## Package
- `@google/genai` in `app/`
