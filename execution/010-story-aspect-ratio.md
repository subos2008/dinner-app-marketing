# Fix: Story/Reel aspect ratios lost during compositing

## Problem

Nano Banana's `edit_image` (Gemini) doesn't preserve the original aspect ratio. All 9:16 story images come back as 1:1 squares after text is composited onto them.

ED: Also the more general issue that we seem to be always generating 1x1 aspect ratio which I don't think is going to be great for instagram

Affected images (The Transplant):
- `wednesday-night-problem-story-9x16-copy.png` — came back square
- `google-search-story-9x16-copy.png` — came back square
- `nobody-tells-you-story-9x16-copy.png` — came back square

Feed 1:1 images are unaffected since they're already square.

## Options

1. **Crop the square outputs to 9:16** — lose the sides but keep the composited text. Quick fix, may cut important content.
2. **Generate new 9:16 base images with text baked into the prompt** — use `generate_image` instead of `edit_image`, include the copy in the generation prompt so the aspect ratio is set fresh.
3. **Use ImageMagick for text compositing** — keeps the base image dimensions intact, precise text placement. Less art-directed but no aspect ratio issues.

## Also noted

Minor text rendering issues from Gemini during compositing:
- `wednesday-night-problem-story-9x16-copy.png` — "Same Same thing as last week" (bad line break)
- `nobody-tells-you-story-9x16-copy.png` — "moving moving to a new city" (word duplication)
- `google-search-feed-1x1-copy.png` — mismatched quote marks (" vs ')
