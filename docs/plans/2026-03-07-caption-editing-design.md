# Caption Editing & Segment Assignment — Design

## Problem

1. **No way to edit captions** — once created, captions can't be modified or have segments assigned
2. **Caption list isn't filtered by segment** — `renderCaptionsList()` uses `STATE.captions` instead of `filteredCaptions()`, so the segment filter bar does nothing for captions
3. **No immutability protection** — captions used by ads can be changed, which would silently alter live ads

## Design

### Long-press to edit

Long-press (500ms) on a caption card opens a full-screen edit view with:
- **Text input** — editable textarea with the caption text
- **Role picker** — toggle between `headline` and `tagline`
- **Segment chips** — current segments shown as removable chips, plus an "add" button to assign new segments
- **Save / Cancel** buttons

### Immutability for in-use captions

When a caption is referenced by any ad (exists in `ad_caption`):
- The text field and role picker are **read-only** (visually greyed out)
- A notice explains: "This caption is used by an ad"
- The save button becomes **"Duplicate & Save"** — creates a new caption with the edits, leaves the original untouched
- Segment assignment is always editable (changing segments doesn't affect the ad creative)

### Fix caption list filtering

`renderCaptionsList()` currently renders `STATE.captions` (all captions). Change it to use `filteredCaptions()` so the segment filter bar works for captions the same way it works for images.

### Segment assignment UX

Within the edit view:
- Current segments shown as chips with × to remove
- "+" button opens the segment picker (same pattern as other entity types)
- Uses `caption_segment` M2M table
- Segment changes save immediately (don't wait for the main Save button)

## Scope

- Captions only — images stay mutable for now
- No inline editing — always full-screen edit view
- No batch operations — one caption at a time

## Data flow

1. Long-press caption → query `ad_caption` to check if in use → open edit view
2. Edit text/role/segments → if not in use: UPDATE caption; if in use: INSERT new caption with edits
3. On save → refresh caption list, close edit view
