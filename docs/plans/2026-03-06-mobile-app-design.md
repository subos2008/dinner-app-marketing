# Mobile App Design

## Overview

A mobile-first content creation app for Come Join Us ad campaigns. Focused on quick content generation and ad assembly — not a port of the desktop ad manager.

**Primary use case:** Generate images and captions, then assemble them into ads from your phone.

**What's NOT in scope:** Ad review/approval, body copy, mixed aspect ratios, tag management. These stay on desktop or get added later.

## Navigation

Two bottom tabs + a persistent top bar.

**Top bar (shared across tabs):**
- Active segment as a dropdown pill (e.g. "Sober People"). Persists in localStorage across sessions.
- Everything you create auto-assigns to the active segment.
- Minimal brand mark.

**Bottom tab bar (iOS-style, fixed):**
- Generate (sparkle/wand icon) — create images + captions
- Library (grid icon) — browse content + assemble ads

## Generate Tab

### Layout (top to bottom)

1. **Type toggle:** Image | Caption — separate generation modes, separate code paths.
2. **Segment prompt hint** — shown if active segment has a `prompt_hint`. Subtle hint text.
3. **Creative brief** — collapsible viewer/editor. Reads/writes from Supabase Storage (`creative-brief.md`). Hidden by default.
4. **Prompt textarea** — persisted per type in localStorage (`generate-prompt-image` / `generate-prompt-caption`).
5. **Generate button** — disabled until prompt is non-empty.

### Image Generation Results

- Generated image appears as a card below the prompt area.
- A second call fires automatically to `suggest-captions` (new type on the `generate` Edge Function). Returns 3-4 caption suggestions.
- Suggestions are **ephemeral** — not saved to the database.
- Each suggestion has a "Keep" button. Tapping saves it to the `caption` table, auto-assigned to the active segment.
- Un-kept suggestions disappear on next generation or navigation.

### Caption Generation Results

- Captions saved directly to the `caption` table (same as desktop behaviour).
- Displayed as cards with role badges (Headline, Subline, CTA, Tagline).
- Auto-assigned to active segment.

## Library Tab

### Sub-navigation

Toggle at the top of the tab: **Images | Ads**. One grid visible at a time.

### Images View

- Camera-roll style photo grid. 3 columns, square thumbnails.
- Filtered by active segment.
- Most recent first, grouped by generation prompt (subtle dividers).
- **Tap image** → fullscreen view.
- **Swipe left/right** in fullscreen to browse other images in the current filter.
- **"Build Ad" button** in fullscreen view → opens ad builder bottom sheet.

### Ads View

- Grid of composited ad images. Same 3-column layout.
- Filtered by active segment.
- **Tap ad** → fullscreen composited image.
- **Swipe left/right** to browse.
- **"Regenerate" button** to re-composite if layout isn't right.

## Ad Builder

Triggered from "Build Ad" on an image in fullscreen. Bottom sheet slides up.

### Layout

- Selected base image preview at top (small).
- Available captions filtered by active segment, grouped by role (Headline, Subline, CTA, Tagline).
- Tap captions to select/deselect (checkmark or highlight).

### Adaptive Button

The primary action button changes based on selection:

- **No captions selected:** "Use as Ad" — creates the ad and copies the base image as the composited image. No Edge Function call. For images where text is baked into the AI-generated image itself.
- **Captions selected:** "Generate Ad" — creates the ad and triggers compositing via the `generate` Edge Function (`type: 'composite'`).

Both paths create an `ad` row in the database. The first path just skips compositing.

## Edge Function Changes

New type `suggest-captions` on the existing `generate` Edge Function.

**Input:**
```json
{
  "type": "suggest-captions",
  "brief": "creative brief text",
  "segment_hint": "segment's prompt_hint",
  "image_prompt": "the prompt used to generate the image"
}
```

**Output:**
```json
{
  "suggestions": [
    { "text": "Wednesday nights used to look like this", "role": "headline" },
    { "text": "What if Wednesday had plans for you?", "role": "subline" },
    { "text": "Book your first dinner", "role": "cta" }
  ]
}
```

Not persisted server-side. The frontend decides what to keep.

## Visual Design

Fresh mobile aesthetic — not the same design tokens as the desktop app. Should feel like a native app, not a responsive website. Specific visual direction to be determined during implementation.

## Data Flow

All data access via Supabase JS client (same as desktop — config inlined in `index.html`).

- **Auth:** Magic link login (same pattern as desktop).
- **Schema:** `marketing` schema via `supabaseClient.schema('marketing')`.
- **Storage:** Images from `creative` bucket.
- **Realtime:** Subscribe to `ad` table changes (same as desktop).
- **Generation:** Via `supabaseClient.functions.invoke('generate', { body })`.

## Segment Model

- Segment picker in top bar. Dropdown, persists in localStorage.
- Active segment auto-assigns to all created content.
- Can reassign segments on individual items (future, not v1).
- "All" option shows everything regardless of segment.
