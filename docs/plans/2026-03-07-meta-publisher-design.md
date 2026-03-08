# Meta Publisher SPA — Design

**Goal:** New standalone SPA for pushing ads from the Creative SPA to Meta ad sets via the Meta Marketing API.

**MVP scope:** Push ads to existing ad sets. No ad set creation, no campaign management, no bidirectional sync.

---

## Architecture

```
Creative SPA              Meta Publisher SPA           Edge Function         Meta API
────────────              ──────────────────           ─────────────         ────────
Creates ads →             Views ads by ad set          meta-sync
desired_status='draft'    User sets desired_status     Reconciles diffs  →   Create/update ads
                          Clicks "Sync"          →     Uploads creative  →   Returns meta IDs
                          ← Shows results              ← Updates DB
```

- **SPA:** Vanilla JS, mobile-optimized, same auth pattern as Creative SPA
- **Sync:** Single `meta-sync` Edge Function handles all reconciliation
- **SDK:** `facebook-nodejs-business-sdk` via esm.sh in the Edge Function
- **Auth:** Meta access token stored as Supabase secret (`META_ACCESS_TOKEN`)
- **Ad account:** Stored as Supabase secret (`META_AD_ACCOUNT_ID`)

## SPA Views

### 1. Ad Sets view (default)

List of ad sets from DB. Each card shows:
- Name
- Ad count (total, synced, pending)
- Sync status summary (all synced / N pending)

Tap → drill into ad set detail.

### 2. Ad Set detail

Ads assigned to this ad set, each showing:
- Composited image thumbnail
- Caption text
- Desired status (editable dropdown: draft / approved / live / paused)
- Meta status (read-only: null / ACTIVE / PAUSED)
- Meta ad ID (if synced)

**Actions:**
- Change desired_status per ad
- "Sync This Ad Set" button → calls `meta-sync` for this ad set

### 3. Unassigned ads

Ads with `desired_status = 'approved'` but no `ad_set_id`. Tap to assign to an ad set.

### 4. Sync Log

Chronological list of sync actions from `sync_log` table. Shows: timestamp, entity, action, status, error (if any).

**Header tabs:** Ad Sets | Unassigned | Sync Log

## Sync Process (meta-sync Edge Function)

**Input:** `{ ad_set_id: uuid }` (sync one ad set at a time)

**Flow:**
1. Read ads in ad set where `desired_status != meta_status`
2. For each ad:
   - **New ad (no `meta_ad_id`):**
     1. Download composited image from Supabase Storage
     2. Upload image to Meta (AdImage endpoint)
     3. Create AdCreative (image hash + body copy + headline)
     4. Create Ad in ad set with AdCreative
     5. Save `meta_ad_id`, set `meta_status` to match `desired_status`
   - **Status change (has `meta_ad_id`):**
     1. Update ad status on Meta (ACTIVE ↔ PAUSED)
     2. Update `meta_status`
3. Write `sync_log` entry for each action
4. Return `{ synced: [...], errors: [...] }`

**Error handling:** Per-ad errors don't block other ads. Each ad's result is independent. Errors logged to `sync_log` and returned to SPA.

## Data Model (existing)

All tables already exist:

- `campaign` — meta_campaign_id, desired_status, meta_status
- `ad_set` — meta_ad_set_id, campaign_id, targeting fields, desired_status, meta_status
- `ad` — meta_ad_id, ad_set_id, desired_status, meta_status, composited_image_path
- `sync_log` — entity_type, entity_id, action, status, meta_id, error

No new tables needed for MVP.

## Immutability

Once an ad has a `meta_ad_id`:
- Image and caption are immutable (enforced in Creative SPA UI)
- Only `desired_status` can be changed (to pause/reactivate)
- Meta Publisher shows "Published" badge

## Secrets Required

- `META_ACCESS_TOKEN` — long-lived user access token with `ads_management` permission
- `META_AD_ACCOUNT_ID` — the ad account ID (format: `act_XXXXXXXXX`)

Both set via `supabase secrets set`.

## Not in MVP

- Campaign creation/management (use Meta's UI)
- Ad set creation (use Meta's UI)
- Import ad sets from Meta into local DB
- Bidirectional sync (pulling changes from Meta)
- Scheduled/automated sync
- Budget management from SPA
