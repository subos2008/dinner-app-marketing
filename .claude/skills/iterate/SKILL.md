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

1. **`<segment-folder>/review.md`** — the most recent performance review (from `/review-performance`)
2. **`<segment-folder>/ad-copy.md`** — the current copy
3. **`<segment-folder>/concepts.md`** — the original concepts (are there unused concepts to try?)
4. **`<segment-folder>/empathy.md`** — go back to the empathy work for fresh angles
5. **`segments/creative-brief.md`** — voice and product details

If there's no performance review yet, tell the user to run `/review-performance` first. You can't iterate without data.

## Iteration strategy

### 1. Double down on winners

Take the top-performing ads and create 2-3 new variants that:
- Keep the winning hook but vary the body copy
- Keep the winning emotional angle but try a different hook format
- Keep the same structure but localise more specifically to the city

### 2. Fix or kill underperformers

For ads that aren't working:
- If the concept is strong but execution is weak → rewrite with a new hook
- If the concept itself isn't resonating → retire it and try an unused concept from concepts.md
- If targeting seems wrong → suggest ad set changes rather than new copy

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
