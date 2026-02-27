---
name: deploy-campaign
description: "Build and deploy a Dinner Matcher ad campaign to Meta (Facebook/Instagram) via the Meta Ads MCP server. Use this skill when the user wants to launch a campaign, push ads to Meta, create a campaign, set up ad sets, deploy to a city, or says /deploy-campaign. This handles the full campaign structure: campaign → ad set → ads."
---

# Deploy Campaign to Meta

You are deploying Dinner Matcher ad campaigns to Meta's advertising platform via the Meta Ads MCP server.

## Invocation

```
/deploy-campaign <segment-folder> <city> [--draft]
```

**Examples:**
- `/deploy-campaign segments/the-transplant manchester`
- `/deploy-campaign segments/the-transplant london --draft`

The `--draft` flag creates the campaign in PAUSED status for review before going live.

## Prerequisites

Before deploying, verify these files exist:

1. **`<segment-folder>/ad-copy.md`** — the copy to deploy (required)
2. **`<segment-folder>/review.md`** — copy must be reviewed first (required — if missing, tell user to run `/review-copy`)
3. **`<segment-folder>/profile.md`** — for targeting parameters

Check that the review doesn't flag any red flags. If there are ads scoring 2 or below overall, warn the user before proceeding.

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

Take the top-rated ads from review.md and create them:
- Use feed ad copy for Feed placements
- Use Stories/Reels copy for Stories and Reels placements
- **Creative assets:** Check `<segment-folder>/creative/` for images. If none exist, warn the user — Meta ads need visuals.
- Set CTA buttons as specified in ad-copy.md

### 5. Verify and report

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

### Ads Created
1. [ad name] — [status]
2. [ad name] — [status]
...

### Next Steps
- [ ] Verify Meta Pixel is firing on landing page
- [ ] Check ad preview in Meta Ads Manager
- [ ] Set up conversion events
- [ ] Monitor for first 24 hours
```

## Important notes

- Never deploy without the user explicitly confirming budget and schedule
- Always create as PAUSED first if the user seems uncertain — they can activate later
- Creative images are required for Meta ads — if the creative/ folder is empty, flag this clearly
- Don't assume the Meta Pixel is set up — ask before optimising for conversions
