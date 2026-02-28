---
name: performance
description: "Pull campaign performance data from Meta and analyze results for Come Join Us campaigns. Use this skill when the user asks to check campaign performance, review ad results, analyze metrics, see how ads are doing, pull Meta data, or says /performance."
---

# Campaign Performance

You are analyzing Come Join Us campaign performance data from Meta to inform creative iteration and budget decisions.

## Invocation

```
/performance <campaign-id-or-segment>
```

**Examples:**
- `/performance DM-Transplant-Manchester-2026-03`
- `/performance segments/the-transplant`

## What to pull

Use the Meta Ads MCP tools to retrieve:

### Campaign-level metrics
- Spend to date
- Impressions
- Reach (unique people)
- Frequency (times each person saw the ad)

### Ad set-level metrics
- Spend per ad set
- CPM (cost per 1,000 impressions)
- CTR (click-through rate)
- CPC (cost per click)
- Conversions (if pixel is set up)
- CPA (cost per acquisition/booking)

### Ad-level metrics (most important)
- Per-ad: impressions, CTR, CPC, conversions, CPA
- Which hook is winning?
- Which creative is winning?
- Engagement rate (likes, comments, shares, saves)

## Ad status context

Read `<segment-folder>/creative/ad-status.json` to cross-reference ad statuses with performance data. When presenting results:

- Include the ad status (`live`, `approved`, etc.) alongside each ad's metrics
- Flag any discrepancies — e.g. an ad marked `live` in ad-status.json that isn't showing impressions (may not have been deployed correctly)
- Note any `approved` ads that haven't been deployed yet — these are ready to go and could be added to the campaign
- This gives the user the full picture: what's running, what's waiting, and how everything is performing

## Analysis framework

### 1. What's working

Identify the top 2-3 performing ads. For each:
- What's the hook? What emotional angle is it using?
- Which concept (from concepts.md) did it come from?
- What's the CTR and how does it compare to benchmarks? (Meta average CTR for feed ads: 0.9-1.5%)

### 2. What's not working

Identify the bottom 2-3 performing ads. For each:
- Why might it be underperforming? (Hook too generic? Wrong emotion? Product too early?)
- Should it be paused or iterated?
- Is the targeting wrong or is the creative wrong?

### 3. Audience insights

- Which age range is responding best?
- Which placement is performing? (Feed vs Stories vs Reels)
- Any geographic patterns within the city?
- Gender breakdown of engagement

### 4. Budget recommendations

- Is the budget being spent efficiently?
- Should spend shift toward winning ads?
- Is frequency getting too high? (>3 in a week = ad fatigue)
- Recommendation: scale, hold, or reduce?

## Output

```markdown
# Performance Review: [Campaign Name]

*Data pulled: [date]*
*Period: [start] — [end]*

---

## Summary
- **Total spend:** [amount]
- **Impressions:** [number]
- **Clicks:** [number]
- **CTR:** [%]
- **Conversions:** [number]
- **CPA:** [amount]

## Ad Performance & Status

| Ad | Status | Impressions | CTR | CPC | Conversions | CPA |
|----|--------|-------------|-----|-----|-------------|-----|
| [ad name] | live | [n] | [%] | [£] | [n] | [£] |

## Top Performers
[analysis of best ads with specific metrics]

## Underperformers
[analysis with recommendations: pause, iterate, or investigate]

## Approved but Not Deployed
[list any approved ads not yet live — these could be added to the campaign]

## Audience Insights
[demographic and placement breakdowns]

## Recommendations
1. [specific action]
2. [specific action]
3. [specific action]

## Next Steps
- [ ] [action items]
```

## Reporting cadence

Suggest these review points to the user:
- **Day 1-3:** Check delivery and basic metrics. Is the campaign spending? Are ads being shown?
- **Day 7:** First real performance check. Compare ad variants.
- **Day 14:** Enough data for confident decisions. Pause losers, scale winners.
- **Day 30:** Full review. Decide on next campaign wave.
