# Image Archive — Design

## Problem

Every image generation auto-saves to `base_image` + Storage. This is good (no lost images), but experimental/playground generations clutter the Images tab. Need a way to cull without permanent deletion.

## Decisions

- **Soft delete** via `archived_at` timestamp on `base_image` — reversible, images stay in Storage
- **Select mode** for bulk archive/restore — tap "Select", multi-select images, then "Archive" or "Restore"
- **Archived filter** in the Images tab — toggle between active and archived views
- **Both SPAs** get the feature (Creative + Desktop)

## Schema

```sql
ALTER TABLE marketing.base_image ADD COLUMN archived_at timestamptz;
```

NULL = active, non-NULL = archived. Ads referencing archived images keep working (no FK issues).

## UX — Select Mode

### Entering select mode
- "Select" button at top of Images grid (next to ratio filter)
- Tapping enters select mode

### In select mode
- Checkbox overlay appears top-right of each image cell
- Tap image = toggle selection (not open viewer)
- Bottom action bar: "[N] selected" + action button + "Cancel"
- Action depends on view:
  - Active view → "Archive" button
  - Archived view → "Restore" button

### Actions
- **Archive:** Sets `archived_at = now()` on selected images, reloads data
- **Restore:** Sets `archived_at = NULL` on selected images, reloads data
- **Cancel:** Exits select mode, clears selection

## UX — Archived Filter

- Toggle/pill in the Images tab header area (alongside ratio filter)
- Two states: "Active" (default) and "Archived"
- Active view: `WHERE archived_at IS NULL`
- Archived view: `WHERE archived_at IS NOT NULL`

## Query Changes

Current `loadData()` fetches all images with `select('*')`. Add filter:

- Default: `.is('archived_at', null)` — only active images
- Archived view: `.not('archived_at', 'is', null)` — only archived images

## Both SPAs

Same feature in Creative SPA and Desktop SPA. Same interaction pattern, adapted to each app's styling.
