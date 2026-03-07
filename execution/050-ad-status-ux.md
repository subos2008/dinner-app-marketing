# Ad Status UX — Desired/Actual State for Live Ads

## Problem

The current status UI is a raw dropdown with all four states (draft, approved, live, paused). This doesn't communicate the desired/actual state distinction well, and it's too easy to accidentally set a status that doesn't make sense.

## Requirements

- Ad panel status needs to show both **current** (actual) and **desired** state for live ads
- When in **draft**: show a button "Approve and queue for publishing"
- When desired is **approved** but not yet live on Meta: show "Queued for publishing" with option to revert to draft
- When actual state is **live**: show "Live" badge with a button "Queue for pausing"
- When desired is **paused** but still live on Meta: show both states — "Live on Meta" + "Queued for pausing"
- When actually **paused**: show "Paused" with option to queue for re-publishing

## Ties Into

- Existing `desired_status` / `meta_status` pattern on the `ad` table
- See `execution/030-desired-state-meta-sync.md` for the sync side
- Future sync process will reconcile desired != actual by calling Meta Ads API
