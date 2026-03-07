# Image Editing & Ad Builder — Design

## Problem
The Creative SPA (mobile) lacks two capabilities the desktop has:
1. No way to provide creative direction when generating ads — the desktop has a feedback textarea on ad cards that flows into the composite prompt
2. No way to edit/tweak a generated base image — if you like an image but want to change something (remove an object, adjust colours), you have to regenerate from scratch

## Design

### Feature A: Ad Builder Screen

Replace the current "Build Ad" bottom sheet with a full-screen Ad Builder.

**Flow:**
1. Tap "Build Ad" in the base image viewer
2. Opens full-screen Ad Builder:
   - Base image preview at top (smaller, controls below)
   - Caption pickers by role (headline, subline, CTA, tagline)
   - Creative direction textarea (optional, e.g. "white text, bottom third, minimal overlay")
   - "Generate Ad" button
3. Composite runs → result shown as a preview in the builder
4. From preview:
   - **Accept** → ad saved, navigate to ad library/viewer
   - **Regenerate** → tweak creative direction or captions, hit Generate again
5. Remove Regenerate button from the ad viewer — it becomes purely for viewing

**Data:** Creative direction saved to existing `ad.feedback` column. The composite edge function already reads this field and appends it as "Additional creative direction" to the Gemini prompt. No backend changes needed for this feature.

### Feature B: Base Image Editing

Add the ability to edit an existing base image from the image viewer, creating a new image without overwriting the original.

**Image Viewer changes:**
- Add "Edit" button alongside "Build Ad"
- Tapping reveals an inline text input + submit button below the image
- User types an edit prompt (e.g. "remove the tree", "make colours warmer")
- On submit: calls `edit-image` edge function
- On success: viewer navigates to the newly created image
- Original image is untouched

**New Edge Function: `edit-image`**
- Path: `supabase/functions/edit-image/index.ts`
- Auth: per-request user client (JWT from request)
- Parameters: `base_image_id` (required), `prompt` (required)
- Flow:
  1. Fetch `base_image` row to get `storage_path` and `aspect_ratio`
  2. Download original image from Storage (public URL)
  3. Call `editImage(imageData, mimeType, prompt, aspectRatio)` via shared gemini module
  4. Upload result to `generated/{timestamp}.png` using service role client
  5. Create new `base_image` row with: filename, storage_path, prompt (the edit prompt), aspect_ratio (from original)
  6. Return the new base_image row

**No lineage tracking** — edited images stand alone as new base images. The edit prompt text provides enough context.

## Files Modified
- `web-apps/creative-spa/index.html` — Ad Builder screen, image viewer Edit button + inline input, remove Regenerate from ad viewer
- `supabase/functions/edit-image/index.ts` — new edge function
- `supabase/functions/edit-image/deno.json` — new function config (if needed by Supabase convention)

## No DB Schema Changes
- `ad.feedback` already exists for creative direction
- `base_image` table already has everything needed for edited images
- Shared gemini module already has `editImage()` function

## Verification
1. Open Creative SPA, generate a base image
2. Tap the image → viewer opens with "Build Ad" and "Edit" buttons
3. **Test Edit:** Tap Edit, type a prompt, submit → new image appears in viewer, original still in library
4. **Test Ad Builder:** Tap Build Ad → full-screen builder opens, pick captions, add creative direction, Generate → preview shown → Accept → ad appears in library
5. **Test Regeneration loop:** In ad builder preview, tweak creative direction, hit Generate again → new preview
6. **Test ad viewer:** Open an ad from library → view only, no Regenerate button
