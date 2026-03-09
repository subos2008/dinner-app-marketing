# Creative / Meta Ad Split — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Rename the `ad` table to `image_creative` and create a new `meta_ad` table, separating visual creative from Meta deployment instances.

**Architecture:** New migration renames `ad` → `image_creative`, moves Meta-specific fields to a new `meta_ad` table, and updates all join tables. Frontend SPAs and edge functions update their table references. No data loss — existing ads become image_creatives, and existing Meta-synced ads also get a meta_ad row.

**Tech Stack:** PostgreSQL (Supabase), vanilla JS SPAs, Deno edge functions

**Design doc:** `docs/plans/2026-03-09-creative-meta-ad-split-design.md`

---

### Task 1: Write and apply the migration

**Files:**
- Create: `~/dinner-matcher/supabase/migrations/00042_creative_meta_ad_split.sql`

**Step 1: Write the migration**

```sql
-- ============================================================
-- Rename ad → image_creative
-- ============================================================

-- Drop triggers and constraints that reference 'ad' by name
DROP TRIGGER IF EXISTS ad_set_updated_at ON marketing.ad;

-- Rename tables
ALTER TABLE marketing.ad RENAME TO image_creative;
ALTER TABLE marketing.ad_caption RENAME TO image_creative_caption;
ALTER TABLE marketing.ad_segment RENAME TO image_creative_segment;

-- Rename columns in join tables
ALTER TABLE marketing.image_creative_caption RENAME COLUMN ad_id TO image_creative_id;
ALTER TABLE marketing.image_creative_segment RENAME COLUMN ad_id TO image_creative_id;

-- Add status column (replaces desired_status for creative)
-- Map existing: draft→draft, everything else→ready
ALTER TABLE marketing.image_creative ADD COLUMN status text NOT NULL DEFAULT 'draft'
  CHECK (status IN ('draft', 'ready', 'deployed'));
UPDATE marketing.image_creative SET status = CASE
  WHEN desired_status = 'draft' THEN 'draft'
  ELSE 'ready'
END;

-- Drop old columns that move to meta_ad
ALTER TABLE marketing.image_creative DROP CONSTRAINT IF EXISTS ad_no_draft_after_sync;
ALTER TABLE marketing.image_creative DROP COLUMN ad_set_id;
ALTER TABLE marketing.image_creative DROP COLUMN body_copy_id;
ALTER TABLE marketing.image_creative DROP COLUMN desired_status;
ALTER TABLE marketing.image_creative DROP COLUMN meta_status;
ALTER TABLE marketing.image_creative DROP COLUMN meta_ad_id;

-- Recreate updated_at trigger with new name
CREATE TRIGGER image_creative_set_updated_at
  BEFORE UPDATE ON marketing.image_creative
  FOR EACH ROW EXECUTE FUNCTION marketing.set_updated_at();

-- ============================================================
-- Create meta_ad table
-- ============================================================

CREATE TABLE marketing.meta_ad (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  image_creative_id   uuid NOT NULL REFERENCES marketing.image_creative(id),
  body_copy_id        uuid REFERENCES marketing.body_copy(id) ON DELETE SET NULL,
  ad_set_id           uuid NOT NULL REFERENCES marketing.ad_set(id) ON DELETE CASCADE,
  desired_status      text NOT NULL DEFAULT 'draft'
    CHECK (desired_status IN ('draft', 'queued', 'live', 'paused')),
  meta_ad_id          text,
  meta_status         text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT meta_ad_no_draft_after_sync
    CHECK (meta_ad_id IS NULL OR desired_status NOT IN ('draft', 'queued'))
);

CREATE TRIGGER meta_ad_set_updated_at
  BEFORE UPDATE ON marketing.meta_ad
  FOR EACH ROW EXECUTE FUNCTION marketing.set_updated_at();

-- ============================================================
-- RLS + policies for new/renamed tables
-- ============================================================

-- image_creative already has RLS from the old 'ad' table (ALTER TABLE carries over on rename)
-- But policies reference the old table name internally — recreate them

DROP POLICY IF EXISTS "auth_all" ON marketing.image_creative;
CREATE POLICY "auth_all" ON marketing.image_creative FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "auth_all" ON marketing.image_creative_caption;
CREATE POLICY "auth_all" ON marketing.image_creative_caption FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "auth_all" ON marketing.image_creative_segment;
CREATE POLICY "auth_all" ON marketing.image_creative_segment FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE marketing.meta_ad ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all" ON marketing.meta_ad FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================================
-- Migrate existing synced ads to meta_ad rows
-- ============================================================

-- For any image_creative that was previously synced to Meta (had meta_ad_id and ad_set_id),
-- we need to reconstruct meta_ad rows. But we already dropped those columns above.
-- So we need to do this BEFORE dropping columns. Let's restructure...
--
-- ACTUALLY: This migration needs to create meta_ad rows BEFORE dropping columns.
-- See revised order below.
```

**IMPORTANT:** The migration order matters. Here's the corrected sequence:

```sql
-- ============================================================
-- 00042_creative_meta_ad_split.sql
-- Split ad table into image_creative + meta_ad
-- ============================================================

BEGIN;

-- 1. Create meta_ad table first (before we lose the columns)
CREATE TABLE marketing.meta_ad (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  image_creative_id   uuid NOT NULL,  -- FK added after rename
  body_copy_id        uuid REFERENCES marketing.body_copy(id) ON DELETE SET NULL,
  ad_set_id           uuid NOT NULL REFERENCES marketing.ad_set(id) ON DELETE CASCADE,
  desired_status      text NOT NULL DEFAULT 'draft'
    CHECK (desired_status IN ('draft', 'queued', 'live', 'paused')),
  meta_ad_id          text,
  meta_status         text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT meta_ad_no_draft_after_sync
    CHECK (meta_ad_id IS NULL OR desired_status NOT IN ('draft', 'queued'))
);

-- 2. Migrate existing synced/assigned ads into meta_ad
INSERT INTO marketing.meta_ad (image_creative_id, body_copy_id, ad_set_id, desired_status, meta_ad_id, meta_status, created_at, updated_at)
SELECT id, body_copy_id, ad_set_id, desired_status, meta_ad_id, meta_status, created_at, updated_at
FROM marketing.ad
WHERE ad_set_id IS NOT NULL;

-- 3. Drop trigger on old table
DROP TRIGGER IF EXISTS ad_set_updated_at ON marketing.ad;

-- 4. Rename tables
ALTER TABLE marketing.ad RENAME TO image_creative;
ALTER TABLE marketing.ad_caption RENAME TO image_creative_caption;
ALTER TABLE marketing.ad_segment RENAME TO image_creative_segment;

-- 5. Rename columns in join tables
ALTER TABLE marketing.image_creative_caption RENAME COLUMN ad_id TO image_creative_id;
ALTER TABLE marketing.image_creative_segment RENAME COLUMN ad_id TO image_creative_id;

-- 6. Add FK on meta_ad now that table is renamed
ALTER TABLE marketing.meta_ad
  ADD CONSTRAINT meta_ad_image_creative_id_fkey
  FOREIGN KEY (image_creative_id) REFERENCES marketing.image_creative(id);

-- 7. Add status column to image_creative
ALTER TABLE marketing.image_creative ADD COLUMN status text NOT NULL DEFAULT 'draft'
  CHECK (status IN ('draft', 'ready', 'deployed'));

-- Set status: if it had a meta_ad_id → deployed, if not draft → ready, else draft
UPDATE marketing.image_creative SET status =
  CASE
    WHEN meta_ad_id IS NOT NULL THEN 'deployed'
    WHEN desired_status != 'draft' THEN 'ready'
    ELSE 'draft'
  END;

-- 8. Drop columns that moved to meta_ad
ALTER TABLE marketing.image_creative DROP CONSTRAINT IF EXISTS ad_no_draft_after_sync;
ALTER TABLE marketing.image_creative DROP COLUMN ad_set_id;
ALTER TABLE marketing.image_creative DROP COLUMN body_copy_id;
ALTER TABLE marketing.image_creative DROP COLUMN desired_status;
ALTER TABLE marketing.image_creative DROP COLUMN meta_status;
ALTER TABLE marketing.image_creative DROP COLUMN meta_ad_id;

-- 9. Recreate triggers
CREATE TRIGGER image_creative_set_updated_at
  BEFORE UPDATE ON marketing.image_creative
  FOR EACH ROW EXECUTE FUNCTION marketing.set_updated_at();

CREATE TRIGGER meta_ad_set_updated_at
  BEFORE UPDATE ON marketing.meta_ad
  FOR EACH ROW EXECUTE FUNCTION marketing.set_updated_at();

-- 10. RLS on new/renamed tables
DROP POLICY IF EXISTS "auth_all" ON marketing.image_creative;
CREATE POLICY "auth_all" ON marketing.image_creative FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "auth_all" ON marketing.image_creative_caption;
CREATE POLICY "auth_all" ON marketing.image_creative_caption FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "auth_all" ON marketing.image_creative_segment;
CREATE POLICY "auth_all" ON marketing.image_creative_segment FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE marketing.meta_ad ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all" ON marketing.meta_ad FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 11. Enable realtime on meta_ad (image_creative inherits from old ad table)
ALTER PUBLICATION supabase_realtime ADD TABLE marketing.meta_ad;

COMMIT;
```

**Step 2: Apply the migration**

```bash
cd ~/dinner-matcher && supabase db push --linked
```

Expected: Migration applies cleanly. Existing ads with `ad_set_id` become meta_ad rows.

**Step 3: Verify**

```bash
cd ~/dinner-matcher && supabase db push --linked --dry-run
```

Expected: "No migrations to apply" (already up to date).

**Step 4: Commit**

```bash
cd ~/dinner-matcher
git add supabase/migrations/00042_creative_meta_ad_split.sql
git commit -m "Migration: split ad into image_creative + meta_ad"
```

---

### Task 2: Update the `composite` edge function

**Files:**
- Modify: `~/dinner-matcher/supabase/functions/composite/index.ts`

**Step 1: Update table references**

Change all `.from('ad')` to `.from('image_creative')`. Change `ad_caption` joins to `image_creative_caption`. The select query changes from:
```typescript
.from('ad')
.select('*, base_image:base_image_id(*), ad_caption(caption_id, caption:caption_id(*))')
```
to:
```typescript
.from('image_creative')
.select('*, base_image:base_image_id(*), image_creative_caption(caption_id, caption:caption_id(*))')
```

Also update the update call:
```typescript
.from('image_creative').update({ composited_image_path, generation_prompt }).eq('id', adId)
```

The parameter name can stay `adId` in the function body — it's the request param name. But the variable semantically represents a creative ID now.

**Step 2: Deploy**

```bash
cd ~/dinner-matcher && supabase functions deploy composite --project-ref kcovnnebeowyrgbnnrof --no-verify-jwt
```

**Step 3: Commit**

```bash
cd ~/dinner-matcher
git add supabase/functions/composite/index.ts
git commit -m "Update composite function: ad → image_creative"
```

---

### Task 3: Update the `meta-sync` edge function

**Files:**
- Modify: `~/dinner-matcher/supabase/functions/meta-sync/index.ts`

**Step 1: Update table references**

The sync function now reads from `meta_ad` instead of `ad`. The key query changes:

Old:
```typescript
.from('ad')
.select('*, base_image:base_image_id(*), ad_caption(caption:caption_id(*)), body_copy:body_copy_id(*)')
.eq('ad_set_id', ad_set_id)
.in('desired_status', ['queued', 'live', 'paused'])
```

New:
```typescript
.from('meta_ad')
.select('*, image_creative:image_creative_id(*, base_image:base_image_id(*), image_creative_caption(caption:caption_id(*))), body_copy:body_copy_id(*)')
.eq('ad_set_id', ad_set_id)
.in('desired_status', ['queued', 'live', 'paused'])
```

The image/caption data now comes through the `image_creative` join. Update all field access paths:
- `ad.composited_image_path` → `metaAd.image_creative.composited_image_path`
- `ad.base_image` → `metaAd.image_creative.base_image`
- `ad.ad_caption` → `metaAd.image_creative.image_creative_caption`
- `ad.body_copy` → `metaAd.body_copy` (still direct)

Update calls:
- `.from('ad').update(...)` → `.from('meta_ad').update(...)`
- `entity_type: 'ad'` → `entity_type: 'meta_ad'` in sync_log entries

**Step 2: Deploy**

```bash
cd ~/dinner-matcher && supabase functions deploy meta-sync --project-ref kcovnnebeowyrgbnnrof --no-verify-jwt
```

**Step 3: Commit**

```bash
cd ~/dinner-matcher
git add supabase/functions/meta-sync/index.ts
git commit -m "Update meta-sync function: read from meta_ad + image_creative"
```

---

### Task 4: Update Creative SPA

**Files:**
- Modify: `web-apps/creative-spa/index.html`

**Step 1: Rename all table references**

Search and replace in the JS code:
- `from('ad')` → `from('image_creative')`
- `from('ad_caption')` → `from('image_creative_caption')`
- `from('ad_segment')` → `from('image_creative_segment')`
- `ad_id:` → `image_creative_id:` (in insert objects for join tables)
- `ad_caption` in select strings → `image_creative_caption`
- `ad_segment` in select strings → `image_creative_segment`

**Step 2: Update realtime subscription**

```javascript
// Old
.on('postgres_changes', { event: '*', schema: 'marketing', table: 'ad' }, () => loadData())

// New
.on('postgres_changes', { event: '*', schema: 'marketing', table: 'image_creative' }, () => loadData())
```

**Step 3: Remove body copy from ad builder**

In the ad builder flow, remove the body copy picker. Body copy assignment moves to the Publisher. The creative insert becomes:

```javascript
const insertData = { base_image_id: builderImageId, status: 'ready' };
if (creativeDirection) insertData.feedback = creativeDirection;
```

No `body_copy_id` in the insert.

**Step 4: Update status handling**

Replace `desired_status` references with `status` for image_creative. Remove `queued`/`live`/`paused` options — creatives only have `draft`/`ready`/`deployed`.

**Step 5: Deploy and commit**

```bash
bash web-apps/creative-spa/deploy.sh
git add web-apps/creative-spa/index.html
git commit -m "Update Creative SPA: ad → image_creative"
```

---

### Task 5: Update Desktop SPA

**Files:**
- Modify: `web-apps/desktop-spa/index.html`

**Step 1: Rename all table references**

Same pattern as Creative SPA:
- `from('ad')` → `from('image_creative')`
- `from('ad_caption')` → `from('image_creative_caption')`
- `from('ad_segment')` → `from('image_creative_segment')`
- `ad_id:` → `image_creative_id:` in join table inserts
- `ad_caption` in selects → `image_creative_caption`

**Step 2: Update status handling**

Replace `desired_status` with `status`. Remove Meta-specific status options. Desktop SPA doesn't do Meta sync so this is simpler.

**Step 3: Commit**

```bash
git add web-apps/desktop-spa/index.html
git commit -m "Update Desktop SPA: ad → image_creative"
```

---

### Task 6: Update Meta Publisher

**Files:**
- Modify: `web-apps/meta-publisher/index.html`

This is the biggest change. The publisher now works with `meta_ad` for its main workflow.

**Step 1: Update data loading**

The ads query changes to load from `meta_ad` with joins:

```javascript
// Old
db().from('ad').select('*, base_image:base_image_id(*), body_copy:body_copy_id(*), ad_caption(caption_id, caption:caption_id(*))')

// New
db().from('meta_ad').select('*, image_creative:image_creative_id(*, base_image:base_image_id(*), image_creative_caption(caption_id, caption:caption_id(*))), body_copy:body_copy_id(*)')
```

**Step 2: Update field access in render functions**

All field access paths change:
- `ad.composited_image_path` → `ad.image_creative.composited_image_path`
- `ad.base_image` → `ad.image_creative.base_image`
- `ad.ad_caption` → `ad.image_creative.image_creative_caption`
- `ad.body_copy` stays the same (direct FK on meta_ad)

**Step 3: Update status changes**

```javascript
// Old
db().from('ad').update({ desired_status: newStatus }).eq('id', adId)

// New
db().from('meta_ad').update({ desired_status: newStatus }).eq('id', adId)
```

**Step 4: Update the "Unassigned" tab**

This changes from "ads without an ad_set_id" to "image_creatives that are ready but not yet deployed as meta_ads". The concept shifts from assignment to deployment.

Query ready creatives:
```javascript
db().from('image_creative')
  .select('*, base_image:base_image_id(*), image_creative_caption(caption_id, caption:caption_id(*))')
  .eq('status', 'ready')
  .order('created_at', { ascending: false })
```

The "Assign" button becomes "Deploy" — it creates a `meta_ad` row:
```javascript
const { data, error } = await db().from('meta_ad').insert({
  image_creative_id: creativeId,
  ad_set_id: selectedAdSetId,
  desired_status: 'draft'
}).select().single();
```

**Step 5: Update sync calls**

The sync button reads from `meta_ad` (the meta-sync edge function handles the join).

**Step 6: Deploy and commit**

```bash
bash web-apps/meta-publisher/deploy.sh
git add web-apps/meta-publisher/index.html
git commit -m "Update Publisher: work with meta_ad + image_creative"
```

---

### Task 7: Update CLI tool

**Files:**
- Modify: `cli/` — check for `ads` command that references the `ad` table

**Step 1: Check what CLI commands reference ad**

```bash
grep -rn "'ad'" cli/ --include="*.ts"
```

**Step 2: Update table references**

- `ads list/create/update/delete` → update to use `image_creative` or `meta_ad` as appropriate
- Or split into `creatives` and `meta-ads` subcommands

**Step 3: Commit**

```bash
git add cli/
git commit -m "Update CLI: ad → image_creative / meta_ad"
```

---

### Task 8: Update memory and docs

**Files:**
- Modify: `CLAUDE.md` — update data model section
- Modify: `~/.claude/projects/-Users-ryan-dinner-matcher-marketing/memory/MEMORY.md` — update data model

**Step 1: Update references to the old `ad` table throughout docs**

Replace references to `ad` table with `image_creative` and document the new `meta_ad` table.

**Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "Update docs for image_creative / meta_ad data model"
```
