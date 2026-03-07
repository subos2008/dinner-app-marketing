# Aspect Ratio Support — Design

## Problem

All generated images come out at 1:1 because we pass no aspect ratio config to Gemini. This is suboptimal for Meta placements:

- **Feed (IG/FB):** 4:5 outperforms 1:1 — takes up more vertical screen space
- **Stories & Reels:** 9:16 is native full-screen; 1:1 gets pillar-boxed with blurred bars
- **Grindr Interstitial:** 2:3 (960x1440, resized to 320x480)

Additionally, the composite step (adding text overlays via Gemini's editImage) doesn't preserve aspect ratio — 9:16 inputs come back as 1:1 squares.

## Decisions

- **Target ratios:** 4:5 (feed), 9:16 (stories/reels), 2:3 (Grindr interstitial)
- **Ratio selection:** Per-image dropdown at generation time (not tied to ad sets)
- **Data model:** Simple `aspect_ratio` text column on `base_image`, no default — must be specified
- **Compositing:** Keep Gemini for creative output; pass `aspectRatio` to fix the squashing
- **Baked-in text:** New option to include overlay text in the initial generation prompt (alongside the existing two-step composite flow)

## Schema

Migration `00013_aspect_ratio.sql`:

```sql
ALTER TABLE marketing.base_image ADD COLUMN aspect_ratio text NOT NULL DEFAULT '1:1';

-- Backfill existing images (all generated at 1:1)
-- Default handles backfill, then remove the default so future inserts must specify
ALTER TABLE marketing.base_image ALTER COLUMN aspect_ratio DROP DEFAULT;
```

No changes to `ad` table — composited images inherit the ratio from their base image.

## Generation Flow

### UI (both desktop + mobile SPAs)

Generate tab gets a **dropdown** below the type toggle:

- Feed (4:5)
- Story / Reels (9:16)
- Grindr Interstitial (2:3)

Selected ratio is passed to the Edge Function and stored on the `base_image` row.

### Edge Function (`generate-image`)

Accepts new `aspect_ratio` parameter in the request body. Passes it to `gemini.generateImage()`.

### Gemini module (`_shared/gemini.ts`)

`generateImage(prompt)` → `generateImage(prompt, aspectRatio?)`

Uses `config.imageConfig.aspectRatio` on the `generateContent` call:

```typescript
const response = await ai.models.generateContent({
  model: MODEL,
  contents: prompt,
  config: {
    imageConfig: { aspectRatio },
    responseModalities: ['image', 'text'],
  },
});
```

## Compositing

### Existing two-step flow (fix)

The `composite` Edge Function looks up the ad's base image `aspect_ratio` and passes it to `editImage()` via `config.imageConfig.aspectRatio`. This prevents Gemini from squashing non-square images back to 1:1.

`editImage(imageData, mimeType, prompt)` → `editImage(imageData, mimeType, prompt, aspectRatio?)`

### New: baked-in text mode

Generate tab gets a mode toggle: **Image only** (current) | **Image + Text**

In "Image + Text" mode, overlay text is included in the initial generation prompt. Gemini generates the image with text already composited — one step, more creative output. The result is a `base_image` that can be used directly as an ad without a separate composite step.

**Text source by platform:**
- **Desktop:** Uses captions from the active builder state (headline, subline, CTA, tagline)
- **Mobile:** Shows a caption picker (similar to post-generation suggestion list) to select text to bake in

## UI Library

### Image display

Images display at their natural aspect ratio instead of being forced to `aspect-ratio: 1` with `object-fit: cover`. The grid adapts to mixed ratios.

### Ratio filter

Add a ratio filter in the Images tab (dropdown or pills) so you can view just feed images, just story images, etc.

## Supported Ratios

All supported by Gemini's API:

| Label | Ratio | Use Case | Pixel Dimensions |
|-------|-------|----------|-----------------|
| Feed | 4:5 | IG/FB Feed | 1080x1350 |
| Story / Reels | 9:16 | IG/FB Stories & Reels | 1080x1920 |
| Grindr Interstitial | 2:3 | Grindr interstitial ad | 960x1440 |
