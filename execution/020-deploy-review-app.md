# Deploy Creative Review App

## Context

The creative review app (`app/`) was local-only with JSON file state. Ported to Supabase so it can run anywhere without the git repo present.

## What Was Done (Phase 1)

### Supabase Project

- Fresh Supabase project (separate from dinner-matcher product)
- `supabase/` initialised in this repo with config + migrations
- `marketing` schema with 4 tables:
  - `segment` — parsed markdown content as JSONB
  - `creative_image` — image metadata (replaces manifest.json)
  - `image_review` — review status + notes (replaces reviews.json)
  - `ad_campaign_status` — ad pipeline status (replaces ad-status.json)
- `creative` Storage bucket (public read for `<img>` tags)
- Realtime enabled on `image_review` and `ad_campaign_status`

### Auth

- Magic link sign-in via Supabase Auth
- Signups disabled — users created via admin API only
- Current user: `ryan@ryancocks.net`
- RLS: authenticated users can read all tables, write reviews + ad status
- Service role key only used by sync script (never loaded by the server)
- Per-request Supabase clients using user's JWT — RLS enforced on every query

### Dual-Mode Architecture

- `app/db.js` — data access layer, dispatches to Supabase or filesystem
- No `SUPABASE_URL` env var = filesystem mode (local dev, no auth, no Supabase)
- Set `SUPABASE_URL` + `SUPABASE_ANON_KEY` = Supabase mode (auth required)

### Sync Script

```bash
# Push all data + images from git to Supabase
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node app/sync.js

# Data only (skip image upload)
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node app/sync.js --data-only

# Images only
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node app/sync.js --images-only
```

Service role key stored in `.env.local` (gitignored), not in `.env`.

### Files Changed

| Action | File |
|--------|------|
| Create | `supabase/config.toml` |
| Create | `supabase/migrations/00001_marketing_schema.sql` |
| Create | `supabase/migrations/00002_marketing_grants.sql` |
| Create | `app/db.js` |
| Create | `app/sync.js` |
| Create | `.env.example` |
| Modify | `app/server.js` — async handlers, auth middleware, per-request db clients |
| Modify | `app/index.html` — login UI, auth flow, image URL helper |
| Modify | `app/package.json` — added `@supabase/supabase-js` |

## Still TODO (Phase 2)

- [ ] Deploy app to a host (Railway / Vercel / EC2) — just needs `SUPABASE_URL` + `SUPABASE_ANON_KEY` env vars - AWS s3 buckets and SPAs has been used for the other apps
- [ ] Point `marketing.comejoin.us` at it
- [x] Remove filesystem fallbacks — app is Supabase-only
- [ ] Add more team members via admin API
