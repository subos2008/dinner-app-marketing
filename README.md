# Come Join Us — Marketing

Marketing repo for **Come Join Us**, an app that solves loneliness by connecting groups of 6 strangers over dinner.

This is NOT the product/tech repo. This is where marketing strategy, ad copy, creative assets, and campaign automation live.

## How it works

Everything runs through Claude Code skills. The workflow:

```
/empathy → /concepts → /write → /score → /creative → /deploy → /performance → /iterate
```

Each skill reads the previous step's output, does its job, and writes to the next file. The creative review app and CLI tool connect everything to Supabase so humans can review and approve before anything goes live.

## Repo structure

```
segments/                    Customer segments (8 + cross-segment)
  the-transplant/            Each segment has:
    profile.md                 Customer profile
    empathy.md                 Deep empathy work + key phrases
    concepts.md                Hook and angle concepts
    ad-copy.md                 Ad copy variants
    review.md                  Scored copy review
    creative/                  Generated ad images (.png)
  strategy.md                Segment prioritisation
  creative-brief.md          Brand voice, product details, test variables

cli/                         Deno TypeScript CLI for Supabase data
app/                         Creative review web app (Express + Supabase)
supabase/                    Supabase migrations (marketing schema)
execution/                   Execution tasks and notes
docs/                        Reference docs
launch-plan.md               4-phase launch roadmap
matching-for-marketing.md    How matching works (for truthful ad claims)
```

## Segments

| Segment | Type |
|---------|------|
| The Transplant | Life-situation |
| The Explorer | Life-situation |
| The Outgrower | Life-situation |
| The Quiet One | Life-situation |
| The Sober One | Lifestyle |
| The Plant-Based One | Lifestyle |
| The Healthy One | Lifestyle |
| The Hippy | Lifestyle |
| Cross-Segment | Format-selling (not persona-specific) |

## Skills

All skills live in `.claude/skills/` and are invoked as slash commands in Claude Code.

### Build

| Skill | Command | What it does |
|-------|---------|-------------|
| Empathy | `/empathy <segment>` | Deep persona work — empathy maps, day-in-the-life, emotional journeys, key phrases |
| Concepts | `/concepts <segment>` | Generate hook and angle concepts from empathy work |
| Write | `/write <segment>` | Write ad copy variants from approved concepts |
| Score | `/score <segment>` | Score and critique copy (1-5 per dimension), set ad statuses |
| Creative | `/creative <segment>` | Generate ad images via Nano Banana (Gemini), register in Supabase |

### Ship & learn

| Skill | Command | What it does |
|-------|---------|-------------|
| Deploy | `/deploy <segment> <city>` | Build Meta campaign — gates on approved ads only |
| Performance | `/performance <segment>` | Pull Meta metrics, cross-reference with ad statuses |
| Iterate | `/iterate <segment>` | New variants from winners, fix underperformers, fresh angles |

### Expand

| Skill | Command | What it does |
|-------|---------|-------------|
| New Segment | `/new-segment <name>` | Full pipeline for a new customer persona |
| New City | `/new-city <segment> <city>` | Localise copy and targeting for a new city |
| Audience | `/audience <segment>` | Research Meta targeting options and audience sizes |

## CLI tool

Deno TypeScript CLI that reads/writes Supabase directly. Used by skills and humans.

```bash
# Tags
deno task cli tags list
deno task cli tags create --name <n>
deno task cli tags delete <id>

# Images
deno task cli images list
deno task cli images add --filename <f> --storage-path <p> [--prompt <p>]

# Captions
deno task cli captions list
deno task cli captions add --text <t>
deno task cli captions delete <id>

# Body copy
deno task cli body-copy list
deno task cli body-copy add --text <t> [--headline <h>]
deno task cli body-copy delete <id>

# Ads
deno task cli ads list
deno task cli ads create --image <id> [--caption <id>] [--body-copy <id>]
deno task cli ads update <id> --desired-status <s> [--feedback <f>]
deno task cli ads delete <id>

# Ad sets
deno task cli ad-sets list
deno task cli ad-sets create --name <n>

# Sync filesystem images to Supabase Storage
deno task cli sync [--images-only]
```

All output is JSON to stdout. Errors go to stderr.

## Creative review app

Web app for reviewing ad copy and images. Approve, reject, flag, or annotate.

```bash
./app/start.sh        # starts on http://localhost:8642
```

- Supabase-only (no filesystem state)
- Real-time updates via Supabase Realtime
- Auth: magic link sign-in

## Supabase

Separate Supabase project from the product app. Marketing schema with core tables:

- `base_image` — ad images with storage paths and generation prompts
- `caption` — primary text variants
- `body_copy` — body text + optional headline
- `ad` — combines image + caption + body copy, tracks desired/meta status
- `ad_set` — groups of ads for campaigns
- `tag` — freeform tags (e.g. segment names), linked via join tables

Storage: `creative` bucket for ad images (public read).

## MCP servers

Configured in `.mcp.json`:

- **Nano Banana** — Google Gemini image generation (needs `configure_gemini_token` each session)
- **Meta Ads** — campaign management via Pipeboard

## Setup

Requires:
- Node.js (for review app)
- Deno (for CLI tool)
- `.env` with `SUPABASE_URL` and `SUPABASE_ANON_KEY`
- `.env.local` with `SUPABASE_SERVICE_ROLE_KEY`

## Platform

Primary ad platform: **Meta** (Facebook + Instagram). Launch targets: Manchester first, then London.
