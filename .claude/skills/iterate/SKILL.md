---
name: iterate
description: "Generate new ad copy variants based on performance data from live Come Join Us campaigns. Use this skill when the user wants to iterate on ads, create new variants from winners, refresh creative, or says /iterate. This takes what's working and produces more of it — plus new angles to test."
---

# Iterate Copy from Performance

You are generating new ad copy variants based on what's working (and not working) in live campaigns. The goal: more of what converts, new angles to test, and fresh creative to prevent ad fatigue.

## Invocation

```
/iterate <segment-folder>
```

**Example:** `/iterate segments/the-transplant`

## What to read

1. **`<segment-folder>/review.md`** — the most recent performance review (from `/performance`)
2. **`<segment-folder>/ad-copy.md`** — the current copy
3. **`<segment-folder>/creative/ad-status.json`** — current status of all ads (see Ad Status Context below)
4. **`<segment-folder>/concepts.md`** — the original concepts (are there unused concepts to try?)
5. **`<segment-folder>/empathy.md`** — go back to the empathy work for fresh angles
6. **`segments/creative-brief.md`** — voice and product details

If there's no performance review yet, tell the user to run `/performance` first. You can't iterate without data.

## Ad status context

Read `<segment-folder>/creative/ad-status.json` before planning iterations. Use ad statuses to inform decisions:

- **`live` ads** — these are running. Check performance data to decide: double down (create variants) or retire?
- **`approved` ads** — approved but not yet deployed. Consider deploying these before writing new ones.
- **`feedback` ads** — have review notes. Read the feedback — these might be worth rewriting rather than starting fresh.
- **`unreviewed` ads** — haven't been reviewed yet. Flag these to the user — they should be scored/reviewed before creating more variants.

Use this context to avoid creating variants of ads that are already struggling, and to surface opportunities (e.g. "3 approved ads haven't been deployed yet — want to launch those first?").

## Iteration strategy

### 1. Double down on winners

Take the top-performing `live` ads and create 2-3 new variants that:
- Keep the winning hook but vary the body copy
- Keep the winning emotional angle but try a different hook format
- Keep the same structure but localise more specifically to the city

### 2. Fix or kill underperformers

For ads that aren't working:
- If the concept is strong but execution is weak → rewrite with a new hook
- If the concept itself isn't resonating → retire it and try an unused concept from concepts.md
- If targeting seems wrong → suggest ad set changes rather than new copy

For `feedback` ads that were never fixed, consider rewriting them now using the existing feedback notes.

### 3. Fresh angles

Look at the empathy work and concepts for angles that haven't been tried yet. Write 2-3 completely new ads that:
- Come from untested concepts
- Try a format not yet used (if only feed ads are running, write Stories/Reels)
- Test a creative variable from the brief (e.g., question hook vs statement hook, emotional vs product-first)

## Output

Write new variants to `<segment-folder>/ad-copy.md` — append them clearly under an "## Iteration [N]" header so the original copy is preserved.

```markdown
## Iteration 2 — [Date]

*Based on performance review: [date]*
*Strategy: [brief summary of what's being tested]*

### Winner variants

[new variants of top performers]

### New angles

[fresh copy from untested concepts]

### Retired
- [ad name] — retired due to [low CTR / no conversions / etc.]
```

Keep a clear record of what was tested, what worked, and what was retired. This becomes the institutional memory for the campaign.

## Update ad status

After writing new variant ads, update `<segment-folder>/creative/ad-status.json`:

### How to compute ad IDs

Ad IDs are slugified versions of the ad header. Use this algorithm:

```
slugify(header):
  1. Lowercase the header text
  2. Replace em dashes (—) with hyphens (-)
  3. Replace en dashes (–) with hyphens (-)
  4. Replace any run of non-alphanumeric characters with a single hyphen (-)
  5. Strip leading and trailing hyphens
```

### What to write

- New variant ads → status `unreviewed`, empty feedback
- Don't touch existing entries (especially `live`, `approved`, or manually-set statuses)

After writing, report how many new ads were added to ad-status.json and remind the user to run `/score` on the new variants.
