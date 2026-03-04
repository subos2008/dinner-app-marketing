# App Simplification Design

## Goal

Replace the segment-centric marketing app with a simpler model: base images, captions, body copy, and ads. Mirror Meta's campaign hierarchy (campaign → ad set → ad). Enable drag-and-drop ad creation where combining an image with a caption generates a composited image via Nano Banana.

## Current State

4 tables in `marketing` schema: `segment`, `creative_image`, `image_review`, `ad_campaign_status`. Everything organized by segment. Complex pipeline (profile → empathy → concepts → copy → score → review → deploy).

## New Data Model

### Core tables

**`tag`** — freeform labels (replaces segments as an organizing concept)
- `id` uuid PK
- `name` text, unique

**`base_image`** — standalone creative images
- `id` uuid PK
- `filename` text, unique
- `storage_path` text
- `prompt` text (nullable) — generation prompt used to create it
- `created_at` timestamptz

**`caption`** — short overlay text for images
- `id` uuid PK
- `text` text
- `created_at` timestamptz

**`body_copy`** — text below the image in a Meta feed ad
- `id` uuid PK
- `text` text
- `headline` text (nullable) — Meta's headline field
- `created_at` timestamptz

**`ad_set`** — targeting container (minimal for now, fields added later)
- `id` uuid PK
- `name` text
- `status` text — active/paused
- `created_at` timestamptz

**`ad`** — the creative unit, combines building blocks
- `id` uuid PK
- `ad_set_id` uuid FK to ad_set (nullable — can be unassigned)
- `base_image_id` uuid FK to base_image
- `caption_id` uuid FK to caption (nullable)
- `body_copy_id` uuid FK to body_copy (nullable)
- `composited_image_path` text (nullable — filled after generation)
- `generation_prompt` text (nullable — actual prompt sent to Nano Banana)
- `desired_status` text — draft/approved/live/paused
- `meta_status` text (nullable — actual state on Meta)
- `meta_ad_id` text (nullable — Meta's ID for this ad)
- `feedback` text (nullable)
- `created_at` timestamptz

### Join tables (many-to-many tagging)

- **`base_image_tag`** — `base_image_id` uuid FK, `tag_id` uuid FK, composite PK
- **`caption_tag`** — `caption_id` uuid FK, `tag_id` uuid FK, composite PK
- **`body_copy_tag`** — `body_copy_id` uuid FK, `tag_id` uuid FK, composite PK

### Dropped tables

- `segment` — replaced by `tag`
- `creative_image` — replaced by `base_image`
- `image_review` — review state moves to `ad.desired_status` + `ad.feedback`
- `ad_campaign_status` — replaced by `ad.desired_status` / `ad.meta_status`

## Migration

- Migrate `creative_image` rows → `base_image` (filename, storage_path, prompt)
- Migrate old segment slugs → `tag` rows + `base_image_tag` entries
- Drop old tables

## App Architecture

### Server

Same Express app, rewritten for new entities. Key routes:

- CRUD for base_image, caption, body_copy, ad, ad_set
- `POST /api/ads/:id/generate` — composites image + caption via Claude Code
- SSE for realtime updates on ad changes

### Generation (image compositing)

Frontend triggers generation → server endpoint → shells out to `claude -p` with a prompt that invokes Nano Banana's `edit_image` tool → composited image saved to Supabase Storage → `ad.composited_image_path` updated.

The generation prompt is stored on the ad row so it can be inspected and tweaked. Different prompt styles can be tried by varying the prompt sent to Claude Code.

### Frontend

Three library panels: images, captions, body copy. Drag a caption onto an image to create an ad. Review, approve, assign to ad sets, deploy.

### Desired state / actual state

See `execution/030-desired-state-meta-sync.md`. Ads track both `desired_status` (what we want) and `meta_status` (what Meta says). A future sync process reconciles them.

## What Gets Removed

- Segment-centric organization (profile, empathy, concepts, review pipeline)
- `app/build.js` markdown parsers (no longer needed)
- Most CLI commands (ad-status, reviews — replaced by ad table)
- Segment sidebar in UI
- Complex skill pipeline (/score, /deploy gates on segment statuses)
