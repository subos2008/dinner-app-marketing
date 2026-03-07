---
name: sync
description: Sync ads to Meta — plan/apply workflow. Shows what would change, then pushes to Meta's Marketing API.
user_invocable: true
---

# /sync — Meta Ads Sync

Terraform-like sync: define desired state in the app, push to Meta.

## Quick Reference

```bash
# See what would change (no API calls)
deno task cli sync plan

# Push changes to Meta
deno task cli sync apply

# Scope to one ad set
deno task cli sync plan --ad-set <uuid>
deno task cli sync apply --ad-set <uuid>
```

## Prerequisites

These must be set in `.env.local`:
- `META_ACCESS_TOKEN` — System User long-lived token
- `META_AD_ACCOUNT_ID` — e.g. `act_123456789`
- `META_PAGE_ID` — Facebook Page ID for ad creatives

## How It Works

1. **Plan** reads Supabase and compares `desired_status` vs `meta_status` across campaigns, ad sets, and ads
2. **Apply** executes the plan in dependency order: campaigns → ad sets → ads
3. After each Meta API call, `meta_*_id` and `meta_status` are updated in Supabase
4. All actions are logged to `marketing.sync_log`

## Workflow

1. Define targeting in the desktop app (Ad Sets tab)
2. Approve ads in the desktop app
3. Run `deno task cli sync plan` to preview
4. Run `deno task cli sync apply` to push

## Ad-Hoc Queries

Use the Meta Ads MCP server for debugging:
- Check campaign status
- Verify ad delivery
- Look up targeting specs

## Architecture

- Shared library: `lib/meta-sync/` (meta-api.ts, plan.ts, apply.ts, types.ts)
- CLI entry: `cli/commands/sync.ts`
- Future: Edge Function wrapper for SPA "Sync" button
