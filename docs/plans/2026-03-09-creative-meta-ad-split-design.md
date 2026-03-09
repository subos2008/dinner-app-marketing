# Design: Split Creative from Meta Ad

## Problem

The current `ad` table conflates two concepts:
1. **Image creative** — a composited image (base_image + captions baked in)
2. **Meta ad instance** — a deployment of that creative with body copy into an ad set on Meta

This prevents deploying the same creative to multiple ad sets and A/B testing different body copy against the same image.

## Solution

Rename `ad` → `image_creative` (the visual unit) and create a new `meta_ad` table (the deployment unit). Move `body_copy_id`, `ad_set_id`, and Meta-specific fields to `meta_ad`.

## Data Model

### `image_creative` (renamed from `ad`)

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| base_image_id | uuid FK → base_image | required |
| composited_image_path | text | set by composite function |
| generation_prompt | text | prompt used for compositing |
| feedback | text | creative direction notes |
| status | text | `draft` ↔ `ready` → `deployed` |
| archived_at | timestamptz | soft delete |
| created_at, updated_at | timestamptz | |

### `image_creative_caption` (renamed from `ad_caption`)

| Column | Type |
|--------|------|
| image_creative_id | uuid FK → image_creative |
| caption_id | uuid FK → caption |

### `image_creative_segment` (renamed from `ad_segment`)

| Column | Type |
|--------|------|
| image_creative_id | uuid FK → image_creative |
| segment_id | uuid FK → segment |

### `meta_ad` (new)

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| image_creative_id | uuid FK → image_creative | required |
| body_copy_id | uuid FK → body_copy | optional |
| ad_set_id | uuid FK → ad_set | required |
| desired_status | text | draft / queued / live / paused |
| meta_ad_id | text | populated after sync |
| meta_status | text | ACTIVE / PAUSED from Meta |
| created_at, updated_at | timestamptz | |

## Status Rules

### image_creative.status
- `draft` ↔ `ready`: free to toggle
- `ready` → `deployed`: set when first meta_ad is created referencing it
- `deployed` is immutable — no edits to image, captions, or composited path
- Constraint: `CHECK (status IN ('draft', 'ready', 'deployed'))`

### meta_ad.desired_status
- `draft`: assembling locally (picking body copy)
- `queued`: ready to push to Meta
- `live`: synced and active
- `paused`: synced but paused
- Constraint: once synced (`meta_ad_id IS NOT NULL`), can't go back to draft/queued
- Can only be created when image_creative is `ready` or `deployed`

## Impact

### Creative SPA
- Table references: `ad` → `image_creative`, `ad_caption` → `image_creative_caption`, `ad_segment` → `image_creative_segment`
- Remove body copy assignment from ad builder (body copy attaches in Publisher)
- Show draft/ready/deployed badge on cards
- Lock UI when deployed — disable re-composite, caption editing

### Meta Publisher
- Main workflow: browse ready image_creatives, deploy into ad sets with body copy
- Creating a meta_ad: pick image_creative + body_copy + ad_set → draft meta_ad
- Status controls on meta_ad (desired_status dropdown)
- Sync pushes queued meta_ads to Meta

### Edge Functions
- `composite`: `ad` → `image_creative` references
- `meta-sync`: reads from `meta_ad` joined to `image_creative` + `body_copy`

### Desktop SPA
- Same table renames, no meta_ad interaction

## Naming

- "Creative" in the UI = an image_creative (the visual)
- "Ad" in the UI = a meta_ad (creative + body copy deployed to an ad set)
- Table name is `meta_ad` not `ad` to leave room for future multi-platform support
- `image_creative` (not just `creative`) to leave room for `video_creative` later
