---
name: creative
description: "Generate ad images for Come Join Us campaigns using Nano Banana (Google Gemini image generation) MCP. Use this skill when the user wants to generate creative, make ad images, create visuals for a segment, fill the creative/ folder, or says /creative. Reads ad copy + concepts + empathy → generates images → saves to creative/ with manifest."
---

# Generate Creative

You are generating ad images for Come Join Us's Meta campaigns using the Nano Banana MCP server (Google Gemini image generation).

## Invocation

```
/creative <segment-folder> [--concepts <list>] [--formats <list>]
```

**Examples:**
- `/creative segments/the-transplant` — generate for top 3 concepts
- `/creative segments/the-transplant --concepts "The Wednesday Night Problem,The Google Search"`
- `/creative segments/the-sober-one --formats feed` — feed images only

## What to read first

1. **`<segment-folder>/review.md`** — use the Top 3 Strongest Ads to prioritise which concepts to generate for (required — if missing, tell user to run `/score`)
2. **`<segment-folder>/ad-copy.md`** — the copy that'll sit alongside the images
3. **`<segment-folder>/concepts.md`** — visual direction hints, concept angles
4. **`<segment-folder>/empathy.md`** — for emotional tone and persona details
5. **`segments/creative-brief.md`** — brand voice, visual tone

## Image style direction

All images should feel:
- **Photorealistic, warm tones, slightly editorial / candid**
- Real-looking people, diverse, age 25-35
- NOT stock photo glossy — should feel like a friend's Instagram story
- Warm lighting, slightly desaturated highlights, film-like grain is OK
- Urban settings: Manchester, London vibes — red brick, canal-side, Northern Quarter energy

### Visual types by concept pattern

| Concept pattern | Visual direction |
|----------------|-----------------|
| Solo/loneliness hooks (Wednesday Night, Nobody Tells You) | Solo person in city — walking, eating alone, scrolling phone. Warm but melancholy. Evening light. |
| Aspirational/after (dinner scenes) | Warm restaurant table with group of ~6 people. Candlelit, laughter, diverse group. Overhead or intimate angle. |
| Before/after contrast (split concepts) | Split composition — solo vs group, cold vs warm, blue vs amber tones. |
| Phone/search hooks (Google Search, Real Questions) | Phone screen with search bar or app UI. Over-shoulder shot, natural lighting. |
| Food/dietary (Plant-Based, Healthy) | Beautiful food close-ups. Warm plating, natural ingredients, restaurant-quality but not pretentious. |
| Sober concepts (Frequency Shift) | Group at dinner, everyone engaged and present. No visible alcohol. Evening restaurant warmth. |

## Aspect ratios

Generate images in these formats based on ad placement:

| Format | Aspect ratio | Use |
|--------|-------------|-----|
| Feed (square) | 1:1 | Facebook/Instagram feed |
| Feed (portrait) | 4:5 | Instagram feed (performs best on mobile) |
| Stories/Reels | 9:16 | Instagram Stories, Facebook Stories, Reels |

**Default:** Generate feed (1:1) and stories (9:16) for each concept. Add 4:5 if user requests or for high-priority ads.

## Generation process

### 1. Select concepts to generate

From review.md's Top 3 Strongest Ads, pick the top 3 concepts (or use `--concepts` if specified). For each concept, generate 1-2 images per format.

### 2. Craft prompts

For each image, build a prompt that combines:
- The concept's emotional angle (from concepts.md)
- The ad's hook/mood (from ad-copy.md)
- The visual type (from table above)
- The brand style (photorealistic, warm, editorial, NOT stock photo)

**Prompt template:**
```
[Visual type description]. [Emotional mood from the concept]. [Specific details — setting, lighting, people]. Photorealistic, warm tones, slightly editorial, candid feel. Shot on 35mm film. Not a stock photo.
```

**Example prompts:**

For "The Wednesday Night Problem" (solo hook):
```
A woman in her late 20s sitting alone at a kitchen counter in a modern apartment, eating reheated pasta from a container. Evening light through the window, the flat is clean but empty. She's scrolling her phone. Photorealistic, warm but melancholy tones, slightly editorial. Shot on 35mm film. Not a stock photo.
```

For "The Wednesday Night Problem" (dinner scene):
```
Six diverse people in their late 20s and early 30s laughing around a candlelit restaurant table. Warm amber lighting, exposed brick wall behind them. Mid-conversation, natural poses, wine glasses and plates of food on the table. One person is gesturing while telling a story. Photorealistic, warm tones, editorial candid feel. Shot on 35mm film. Not a stock photo.
```

### 3. Generate via Nano Banana

Use the Nano Banana MCP `generate_image` tool for each prompt. Specify the aspect ratio.

If generation fails or quality is poor, iterate on the prompt — adjust specificity, lighting details, or composition.

### 4. Save images

**CRITICAL: Images are append-only. NEVER overwrite or delete an existing image file.** If a filename already exists, add a version suffix (`-v2`, `-v3`, etc.). Old images stay — they may be referenced elsewhere or preferred later.

Save to `<segment-folder>/creative/` with this naming convention:

```
<concept-slug>-<format>-<ratio>.png
```

If that file already exists:
```
<concept-slug>-<format>-<ratio>-v2.png
<concept-slug>-<format>-<ratio>-v3.png
```

**Examples:**
- `wednesday-night-problem-feed-1x1.png`
- `wednesday-night-problem-feed-1x1-v2.png` (regenerated variant)
- `wednesday-night-problem-story-9x16.png`
- `google-search-feed-4x5.png`

### 5. Write manifest

**Append new entries to the manifest — never remove existing ones.** The manifest is the full history of generated images.

Create or update `<segment-folder>/creative/manifest.json`:

```json
{
  "segment": "<segment-slug>",
  "generated_at": "<ISO date>",
  "images": [
    {
      "filename": "wednesday-night-problem-feed-1x1.png",
      "concept": "The Wednesday Night Problem",
      "ad_variant": "Variant B",
      "format": "feed",
      "aspect_ratio": "1:1",
      "type": "base",
      "parent": null,
      "prompt": "the actual prompt sent to Nano Banana",
      "style": "photorealistic, warm tones, editorial",
      "visual_type": "solo person in city"
    }
  ]
}
```

For composited images (base + ad copy text overlaid via edit_image):
```json
{
  "filename": "wednesday-night-problem-feed-1x1-copy.png",
  "concept": "The Wednesday Night Problem",
  "type": "composited",
  "parent": "wednesday-night-problem-feed-1x1.png",
  "copy_variant": "Variant B",
  "format": "feed",
  "aspect_ratio": "1:1"
}
```

## Quality checks

After generating, review each image:
- Does it feel warm and editorial, NOT stock photo glossy?
- Are the people diverse and age-appropriate (25-35)?
- Does the mood match the concept's emotional angle?
- Would this stop a scroll on Instagram?
- Is the composition right for the format (square vs vertical)?

If an image doesn't pass, regenerate with an adjusted prompt.

## Output

After generation, report:

```markdown
## Creative Generated: [Segment Name]

**Concepts covered:** [list]
**Images generated:** [count]
**Saved to:** <segment-folder>/creative/

| Image | Concept | Format | Quality |
|-------|---------|--------|---------|
| [filename] | [concept] | [format] | [brief note] |

**Manifest:** Updated at <segment-folder>/creative/manifest.json

### Next steps
- Review images in the creative review app (`cd app && node server.js`, open http://localhost:8642)
- Regenerate any that don't pass quality bar
- Run `/score` to score the copy, then approve ads in the review app
- Run `/deploy` when ads are approved and ready
```

## Notes

- Nano Banana MCP must be configured in `.mcp.json` — if the tool isn't available, tell the user to check their MCP config and restart Claude Code
- Generate conservatively — 2-3 images per concept is enough for testing. Don't generate 20 images upfront.
- The manifest.json is what the review app reads — keep it accurate
- If generating for cross-segment, use generic visual types (restaurant tables, food, group shots) rather than segment-specific emotional hooks
