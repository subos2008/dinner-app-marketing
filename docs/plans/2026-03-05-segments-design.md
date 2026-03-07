# Segments — Design

## Problem

Tags are freeform labels but don't give a persistent, always-visible way to organise creative by audience niche. We need a first-class "segment" concept that's always on screen, filterable, and assignable to all entity types.

## Segments

Audience niches like "Digital Nomad", "Vegans", "Sober People". Separate from tags — segments are always visible in the UI even if empty, tags are freeform metadata.

Starting segments: Digital Nomad, Vegans, Sober People.

## Data Model

New table + four M2M join tables in the `marketing` schema:

```sql
segment (id uuid PK, name text UNIQUE NOT NULL, created_at timestamptz)

base_image_segment (base_image_id uuid FK, segment_id uuid FK, PK(both))
caption_segment    (caption_id uuid FK, segment_id uuid FK, PK(both))
body_copy_segment  (body_copy_id uuid FK, segment_id uuid FK, PK(both))
ad_segment         (ad_id uuid FK, segment_id uuid FK, PK(both))
```

All FKs cascade on delete.

## UI: Persistent Filter Bar

Horizontal bar below the library tab row, always visible:

```
[ All ] [ Generic ] [ Digital Nomad ] [ Vegans ] [ Sober People ]  [ + ]
```

### Filter modes

- **All** — shows everything, no filter
- **Generic** — virtual filter, shows items with no segment assigned (`NOT IN any join table`)
- **[Segment name]** — shows items belonging to that segment

Active filter is visually highlighted. Clicking a segment pill toggles the filter. When active, all four library panels (Images, Captions, Body Copy, Ads) filter to match.

### Segment management

- `[ + ]` button — inline text input to add a new segment
- Right-click or hover menu on a segment pill — rename / delete

## Assignment

### Drag-and-drop

Drag an image/caption/body copy card onto a segment pill in the filter bar to assign it. Visual feedback (pill highlights) on drag hover.

### Card-level chips

Each card shows small segment chips (like existing tag chips but distinct style). Click `x` on a chip to remove the segment assignment.

## API Routes

```
GET    /api/segments
POST   /api/segments          { name }
PUT    /api/segments/:id      { name }
DELETE /api/segments/:id

POST   /api/images/:id/segments      { segment_id }
DELETE /api/images/:id/segments/:sid
POST   /api/captions/:id/segments    { segment_id }
DELETE /api/captions/:id/segments/:sid
POST   /api/body-copy/:id/segments   { segment_id }
DELETE /api/body-copy/:id/segments/:sid
POST   /api/ads/:id/segments         { segment_id }
DELETE /api/ads/:id/segments/:sid
```

## Filtering Logic

When a segment is active, each `loadData` fetch adds the segment filter. Two approaches:

1. **Client-side** — fetch all data, filter in JS based on segment join data already loaded
2. **Server-side** — pass `?segment=<id>` or `?segment=generic` query param, filter in DB queries

**Recommendation: Client-side.** The dataset is small (hundreds of items max), data is already loaded with joins, and it avoids duplicating filter logic across every API endpoint. The segment assignments come back as nested arrays on each entity (like tags do today).

## What This Doesn't Cover

- Segment colours/icons (can add later)
- Segment ordering/priority
- Segment-level analytics or performance tracking
