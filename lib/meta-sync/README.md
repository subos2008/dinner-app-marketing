# Meta Sync

Terraform-like declarative sync: define desired state in the app, push to Meta's Marketing API.

## How It Works

```
Desktop App (desired state) → sync plan (diff) → sync apply (push to Meta)
```

1. Define targeting in the Ad Sets tab (budget, geo, age, placements)
2. Approve ads in the desktop app
3. `deno task cli sync plan` — preview what would change (no API calls)
4. `deno task cli sync apply` — push to Meta, update `meta_status` in DB

Everything syncs in dependency order: **campaigns → ad sets → ads**.

## Architecture

```
lib/meta-sync/
  types.ts      — shared types (plan actions, DB rows, Meta API shapes)
  meta-api.ts   — Meta Graph API client (fetch-based, no SDK)
  plan.ts       — reads DB, diffs desired vs actual, returns action list
  apply.ts      — executes actions, updates DB, writes to sync_log

cli/commands/
  sync.ts       — CLI entry point (plan/apply subcommands)
  campaigns.ts  — campaign CRUD
  ad-sets.ts    — ad set CRUD with targeting flags

.claude/skills/sync/SKILL.md  — /sync skill for Claude Code
```

The shared library is pure Deno with no env reads — callers pass in the access token and Supabase client. This means the same code works from the CLI today and an Edge Function later.

## CLI Usage

```bash
# Preview changes
deno task cli sync plan

# Push to Meta
deno task cli sync apply

# Scope to one ad set
deno task cli sync plan --ad-set <uuid>
deno task cli sync apply --ad-set <uuid>

# Campaign management
deno task cli campaigns list
deno task cli campaigns create --name "CJU-Manchester-March"

# Ad set targeting
deno task cli ad-sets create --name "Transplant 25-32" \
  --campaign <id> --budget 15 --age-min 25 --age-max 32 \
  --geo '{"cities":[{"key":"2643123","name":"Manchester"}]}'

deno task cli ad-sets update <id> --desired-status active
```

## Required Env Vars

Set these in `.env.local`:

| Variable | Example | Notes |
|----------|---------|-------|
| `META_ACCESS_TOKEN` | `EAAx...` | System User long-lived token |
| `META_AD_ACCOUNT_ID` | `act_123456789` | Ad account ID |
| `META_PAGE_ID` | `123456789` | Facebook Page for ad creatives |

These are only read server-side (CLI / future Edge Function). Never in the browser.

## Data Model

Three levels, mirroring Meta's hierarchy:

| Table | Key Fields | Meta Counterpart |
|-------|-----------|-----------------|
| `campaign` | name, objective, desired_status, meta_campaign_id | Campaign |
| `ad_set` | name, campaign_id, budget, targeting, desired_status, meta_ad_set_id | Ad Set |
| `ad` | base_image_id, body_copy_id, composited_image_path, desired_status, meta_ad_id | Ad |

Each entity has `desired_status` (what we want) and `meta_status` (what Meta reports). The sync engine reconciles the gap.

### Desired Status Values

| Value | Meaning |
|-------|---------|
| `draft` | Not ready — ignored by sync |
| `approved` | Ready to publish — sync will create on Meta |
| `paused` | Pause on Meta (or skip if never published) |

All entities are created as `PAUSED` on Meta. Activation is a separate step.

## Desktop App

### Ad Sets Tab
Inline targeting form per ad set: campaign, budget, geo, age, gender, dates, placements, interests. Click the summary line to expand/collapse.

### Status Badges
Contextual buttons instead of a raw dropdown:

| State | Shows |
|-------|-------|
| Draft, never published | Draft badge + **Approve** button |
| Approved, not on Meta | Queued badge + warnings + Revert link |
| Live on Meta | Live badge + **Pause** button |
| Paused on Meta | Paused badge + **Re-activate** button |

### Sync Indicator
Top bar badge shows "3 changes pending" or "In sync". Counts entities where desired != actual.

### Pre-publish Validation
On approve, warns if: no composited image, no ad set, ad set missing budget/geo/campaign.

## Sync Log

All Meta API interactions are logged to `marketing.sync_log`:

```sql
SELECT * FROM marketing.sync_log ORDER BY synced_at DESC LIMIT 10;
```

## Future

- **Edge Function** (`supabase/functions/meta-sync/`) — thin wrapper around the shared library for a "Sync" button in the SPA
- **Bidirectional sync** — poll Meta for status changes and update `meta_status`
- **Interest search UI** — replace JSON textarea with Meta's targeting search API
