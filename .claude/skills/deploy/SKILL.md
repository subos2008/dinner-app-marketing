---
name: deploy
description: "Build and deploy a Come Join Us ad campaign to Meta (Facebook/Instagram) via the Meta Ads MCP server. Use this skill when the user wants to launch a campaign, push ads to Meta, create a campaign, set up ad sets, deploy to a city, or says /deploy. This handles the full campaign structure: campaign → ad set → ads."
---

# Deploy Campaign to Meta

You are deploying Come Join Us ad campaigns to Meta's advertising platform via the Meta Ads MCP server.

## Invocation

```
/deploy <segment-folder> <city> [--draft]
```

**Examples:**
- `/deploy segments/the-transplant manchester`
- `/deploy segments/the-transplant london --draft`

The `--draft` flag creates the campaign in PAUSED status for review before going live.

## Prerequisites

Before deploying, verify these files exist:

1. **`<segment-folder>/ad-copy.md`** — the copy to deploy (required)
2. **`<segment-folder>/review.md`** — copy must be scored first (required — if missing, tell user to run `/score`)
3. **`<segment-folder>/profile.md`** — for targeting parameters

## Ad status gate

**Before deploying any ads, check `<segment-folder>/creative/ad-status.json`.**

Read the file and check the status of each ad:

- **Only deploy ads with `approved` status.** These have been reviewed and explicitly approved in the creative review app.
- **Skip ads with any other status** (`unreviewed`, `feedback`, `live`).

**If no ads are approved:**
- Warn the user clearly: "No ads have been approved yet. Review and approve ads in the creative review app first (`cd app && node server.js`, open http://localhost:8642)."
- Stop — do not deploy anything.

**If some ads are approved and some aren't:**
- List which ads will be deployed (approved) and which will be skipped (and why)
- Ask the user to confirm before proceeding

Also check the review.md — if there are ads scoring 2 or below overall, warn the user before proceeding.

## Meta Campaign Structure

Meta campaigns have three levels:

1. **Campaign** — the top level. Sets the objective (conversions, traffic, etc.)
2. **Ad Set** — targeting, budget, schedule, placement. One ad set per audience variant.
3. **Ads** — the actual creative. Multiple ads per ad set for A/B testing.

## Deployment steps

### 1. Check MCP connection

Use the Meta Ads MCP tools to verify the connection is working. If authentication fails, stop and tell the user to check `.mcp.json` configuration.

### 2. Create campaign

- **Objective:** Conversions (booking a dinner)
- **Campaign name:** `DM-[Segment]-[City]-[Date]` (e.g., `DM-Transplant-Manchester-2026-03`)
- **Status:** PAUSED (if --draft) or ACTIVE
- **Special ad categories:** None (not housing, credit, employment, or political)

### 3. Create ad set(s)

- **Targeting:** Based on profile.md Meta targeting signals + city geo-targeting
- **Age range:** From profile.md age skew
- **Placements:** Facebook Feed, Instagram Feed, Instagram Stories, Instagram Reels
- **Budget:** Start with daily budget — let user specify amount, don't default
- **Schedule:** User must specify start date
- **Optimization:** Conversions (landing page views as secondary if pixel isn't set up yet)

### 4. Create ads

Deploy only the **approved** ads from ad-status.json:
- Use feed ad copy for Feed placements
- Use Stories/Reels copy for Stories and Reels placements
- **Creative assets:** Check `<segment-folder>/creative/` for images. If none exist, warn the user — Meta ads need visuals.
- Set CTA buttons as specified in ad-copy.md

### 5. Update ad status

After successful deployment, update `<segment-folder>/creative/ad-status.json`:
- Set all successfully deployed ads to `live`
- Preserve the existing feedback text
- Update the `updatedAt` timestamp

### 6. Verify and report

After deployment, output a summary:

```markdown
## Deployment Summary

**Campaign:** [name]
**Status:** [ACTIVE/PAUSED]
**Platform:** Meta (Facebook + Instagram)
**City:** [city]
**Segment:** [segment name]

### Ad Set
- Targeting: [summary]
- Age: [range]
- Daily budget: [amount]
- Placements: [list]

### Ads Deployed
1. [ad name] — live
2. [ad name] — live
...

### Ads Skipped
1. [ad name] — [status: unreviewed/feedback]
...

### Next Steps
- [ ] Verify Meta Pixel is firing on landing page
- [ ] Check ad preview in Meta Ads Manager
- [ ] Set up conversion events
- [ ] Monitor for first 24 hours
- [ ] Run `/performance` to check results after a few days
```

## Important notes

- Never deploy without the user explicitly confirming budget and schedule
- Always create as PAUSED first if the user seems uncertain — they can activate later
- Creative images are required for Meta ads — if the creative/ folder is empty, flag this clearly
- Don't assume the Meta Pixel is set up — ask before optimising for conversions
- The ad status gate is non-negotiable — only approved ads get deployed
