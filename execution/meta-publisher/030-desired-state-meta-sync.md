# Desired State / Actual State Meta Sync

## Concept

Each ad has two status fields:

- **`desired_status`** — what we want the ad's state to be (draft, approved, live, paused)
- **`meta_status`** — what the ad's actual state is on Meta (null if never deployed)

This decouples intent from execution. A user or skill sets `desired_status = live` in the review app. A separate sync process reads ads where desired != actual and pushes changes to Meta via the Meta Ads API.

## Why

- Review and approval happen in our app without touching Meta
- Deployment becomes a reconciliation loop, not a one-shot action
- Easy to pause/unpause — just flip desired_status, sync picks it up
- Can see at a glance what's out of sync

## Implementation (later)

1. Sync process reads ads where `desired_status != meta_status`
2. For each, calls Meta Ads API to create/update/pause the ad
3. On success, updates `meta_status` to match + stores `meta_ad_id`
4. Could run as a CLI command (`deno task cli meta-sync`) or a scheduled job
5. The `/deploy` skill becomes: set `desired_status = live`, then run sync

## Not Yet

- The sync process itself — just the data model for now
- Meta Ads API integration details
- Error handling / retry logic for failed syncs
