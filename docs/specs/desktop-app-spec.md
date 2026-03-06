# Desktop Ad Manager — Functional Spec

Reference spec for the desktop SPA at `web-apps/desktop-spa/index.html`.

## Layout

Two-column fixed layout (55% left / 45% right) with a 52px fixed top bar.

**Top bar:** Brand ("Come Join Us — Ad Manager"), user email, sign out button.

**Left panel (Library):**
- 6 tabs: Images, Captions, Body Copy, Ads, Segments, Generate
- Segment filter bar below tabs (All | Generic | segment pills | + add)
- Tab content area (scrollable)
- Caption strip at bottom (horizontal scrollable list, draggable)

**Right panel (Ad Manager):**
- Ad builder (drop zones for image + captions + body copy select)
- Ads list (scrollable, most recent ad always visible)

## Authentication

- Magic link via Supabase OTP (`signInWithOtp`)
- Session checked on boot via `getSession()`
- Auth state change listener for sign-in/sign-out events

## Data Entities (marketing schema)

| Table | Key Fields |
|-------|-----------|
| `base_image` | id, filename, storage_path, generation_prompt_id |
| `caption` | id, text, role (headline/subline/cta/tagline), generation_prompt_id |
| `body_copy` | id, text, headline |
| `ad` | id, base_image_id, body_copy_id, desired_status, meta_status, feedback, composited_image_path |
| `ad_set` | id, name, status |
| `segment` | id, name, prompt_hint |
| `tag` | id, name |
| `generation_prompt` | id, type, prompt |

Join tables: `base_image_tag`, `caption_tag`, `body_copy_tag`, `base_image_segment`, `caption_segment`, `body_copy_segment`, `ad_segment`, `ad_caption`.

## CRUD by Entity

### Base Images
- Grid display (3 columns, grouped by generation prompt)
- Click → lightbox (fullscreen)
- Delete (hover ✕, blocked if used by an ad)
- Drag to ad builder image zone
- Drag to segment pill to assign

### Captions
- Cards grouped by generation prompt
- Add form: text input + role dropdown
- Delete (hover ✕)
- Drag to ad builder headline/CTA zones
- Drag to segment pill to assign
- Also shown in caption strip at bottom of library panel

### Body Copy
- Cards with optional headline + text
- Add form: headline input + textarea
- Delete (hover ✕)
- Drag to segment pill to assign
- Selected via dropdown in ad builder

### Ads
- Shown in both Ads tab (left, filtered) and Ads panel (right, most recent unfiltered)
- Created via ad builder: drop image + captions + optional body copy → "Create Ad"
- Status dropdown: draft | approved | live | paused (updates `desired_status`)
- Meta status badge (read-only)
- Feedback textarea (saves on blur)
- Generate/Regenerate composite button
- Delete (hover ✕)
- Drag to segment pill to assign

### Segments
- Filter bar pills: All | Generic | segment names | + add
- Click pill to filter all library items
- Right-click pill → context menu (Rename | Delete)
- Segments tab: inline edit name, edit prompt_hint textarea, delete, add
- Drag any item to segment pill → assigns via join table

### Tags
- Read-only display on cards (created via CLI)

## Generation

### Generate Tab
- Creative brief (collapsible, fetched from Storage, editable, cached in localStorage)
- Type toggle: Image | Caption
- Segment prompt hint shown if active segment has one
- Prompt textarea (persisted per type in localStorage)
- Generate button → calls `generate` Edge Function
- Re-use prompt button on generation prompt group headers (↻)

### Generation Types
- `type: 'image'` → generates base image via Gemini
- `type: 'caption'` → generates captions, saved to DB
- `type: 'composite'` → composites ad (image + caption overlays)

### Results
- Image: appears in Images tab, auto-assigned to active segment
- Captions: appear in Captions tab, auto-assigned to active segment
- Composite: updates ad's `composited_image_path`, cache-busted display

## Drag & Drop

| Source | Target | Result |
|--------|--------|--------|
| Image card | Ad builder image zone | Sets builder image |
| Caption card/chip | Ad builder headline zone | Adds to headline/subline |
| Caption card/chip | Ad builder CTA zone | Adds to CTA/tagline |
| Image/Caption/Body/Ad | Segment pill | Assigns segment (M2M join) |

## Realtime

- Supabase Realtime subscription on `marketing.ad` table (all events)
- Any change triggers full data reload

## Image Handling

- Storage bucket: `creative` (public read)
- URL pattern: `{SUPABASE_URL}/storage/v1/object/public/creative/{storage_path}`
- Ad cards show composited image if exists, else base image with caption overlay
- Composited images cache-busted with `?t={updated_at}`

## Local Storage

- `generate-brief`: creative brief text
- `generate-prompt-image`: image generation prompt
- `generate-prompt-caption`: caption generation prompt
