# Come Join Us - Marketing

## What is this?
Marketing repo for Come Join Us — an app that solves loneliness by connecting people over dinner. Groups of 6 strangers are matched and booked into dinners together.

## The Problem
Loneliness. People struggle to meet the *right* people who can move their lives forward.

## The Product
- Onboarding app asks meaningful matching questions
- Dinners of 6 strangers, matched intentionally
- Questions that actually matter: alcohol preferences, dietary requirements, "what do you want more of in your life?"

## Key Differentiator
Competitors ask "psychology" questions they don't actually use for matching. We ask practical, meaningful questions that directly inform who you're seated with.

## Brand Voice
- Honest, warm, direct
- Anti-corporate, anti-gimmick
- We're solving a real problem, not gamifying loneliness

## Repo Purpose
This is NOT the tech/product repo. Apps, websites, and product code live elsewhere.

This repo is for:
- **Marketing strategy** — customer profiling, audience research, positioning
- **Idea exploration** — kick around concepts, build on them, iterate
- **Ad copy generation** — write and refine copy for campaigns
- **Ad creative generation & review** — generate, iterate, and approve visual/video creative here before it goes live
- **Marketing automation** — build tools/skills to connect AI to Meta's ad platform
- **Launch materials** — campaign assets and collateral

## Platform
- Primary ad platform: **Meta** (Facebook/Instagram)
- Need to connect AI tooling to Meta's marketing APIs for automation

## Database Migrations
- Migrations live in `supabase/migrations/` with sequential numbering (`00001_`, `00002_`, etc.)
- **Always apply migrations with `supabase db push --linked`** — do NOT use `psql` directly
- The Supabase CLI is installed and the project is already linked

## Running the Apps
- SPAs live under `web-apps/` — each is a standalone static SPA with its own `start.sh`
- **Desktop ad manager:** `cd web-apps/desktop-spa && npx serve . -l 8642`
- **Creative SPA:** `cd web-apps/creative-spa && npx serve .`
- All data access goes directly to Supabase via the JS client (config is inlined in each `index.html`)

## Deploying
- **Creative SPA:** `bash web-apps/creative-spa/deploy.sh` — syncs to S3 + CloudFront invalidation → https://creative.comejoinus.app
- **Edge Functions:** `supabase functions deploy <function-name>` (e.g. `generate-image`, `composite`, `generate-captions`, `suggest-captions`)
- Edge Function source: `supabase/functions/` with shared modules in `supabase/functions/_shared/`
- Secrets: `GOOGLE_AI_API_KEY` set via `supabase secrets set` (SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY are auto-available)
- AWS profile for deploy: `dinner-app-deploy` (set in deploy.sh)

## Testing Edge Functions (Getting a User JWT)
To test edge functions via curl, you need a real user JWT (not the anon or service role key). Steps:
1. Get the JWT-format keys: `supabase projects api-keys --project-ref pqrhphvbyjqhntqjzljc`
2. Generate a magic link: `curl -s -X POST "https://pqrhphvbyjqhntqjzljc.supabase.co/auth/v1/admin/generate_link" -H "apikey: $ANON_KEY" -H "Authorization: Bearer $SERVICE_KEY" -H "Content-Type: application/json" -d '{"type":"magiclink","email":"ryan@ryancocks.net"}'`
3. Extract the `action_link` from the response
4. Follow it with curl: `curl -s -L -o /dev/null -w '%{url_effective}' "$ACTION_LINK"` — the redirect URL fragment contains `access_token=...`
5. Use that access token as `Authorization: Bearer $ACCESS_TOKEN`

Note: The keys in `.env` / `.env.local` are short-format keys (`sb_publishable_...` / `sb_secret_...`), NOT JWTs. Use `supabase projects api-keys` to get the JWT-format keys needed for the admin API.

## Edge Function Logs
The Supabase CLI doesn't support `functions logs`. View logs in the dashboard or query via the Management API:
```
curl -s -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  "https://api.supabase.com/v1/projects/pqrhphvbyjqhntqjzljc/analytics/endpoints/logs.edge-functions?iso_timestamp_start=$(date -u -v-1H +%Y-%m-%dT%H:%M:%SZ)" \
  | python3 -m json.tool
```
Or just open: https://supabase.com/dashboard/project/pqrhphvbyjqhntqjzljc/functions

## Edge Function Error Responses
All edge functions return errors as `{ "error": "Human-readable message" }` with an appropriate HTTP status code. One field only — no `detail`, `code`, or debug fields. The `error` string should be self-contained and suitable for displaying to the user (e.g. "Image generation failed: model timeout"). Both SPAs use an `fnError(error, data)` helper to extract the message from `supabase.functions.invoke` responses.

## Error Display Rule
**Every error MUST be shown to the user in the UI.** Never swallow errors silently. Every `catch` block and error response must render the error message visibly — use `renderGenerateError()` in the Creative SPA, `alert()`, or an inline error element. Also `console.error()` the raw error for debugging. If the user has to open DevTools to see what went wrong, that's a bug.

## Ways of Working
This repo is a thinking space. We explore ideas, refine them, and produce actionable marketing output. Not everything here ships — some of it is just us working through the problem.
