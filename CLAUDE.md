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
- **Desktop ad manager:** `cd web-apps/desktop-spa && npx serve .`
- **Mobile app:** `cd web-apps/mobile-spa && npx serve .`
- All data access goes directly to Supabase via the JS client (config is inlined in each `index.html`)
- Generation (images, captions, ad compositing) uses the `generate` Supabase Edge Function
- Edge Function source: `supabase/functions/generate/index.ts` with shared modules in `supabase/functions/_shared/`
- Deploy Edge Function: `supabase functions deploy generate`
- Secrets: `GOOGLE_AI_API_KEY` set via `supabase secrets set` (SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY are auto-available)

## Ways of Working
This repo is a thinking space. We explore ideas, refine them, and produce actionable marketing output. Not everything here ships — some of it is just us working through the problem.
