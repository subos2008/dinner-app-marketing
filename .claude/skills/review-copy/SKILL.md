---
name: review-copy
description: "Score and critique Dinner Matcher ad copy against the customer persona, empathy work, and creative brief. Use this skill when the user asks to review copy, score ads, critique campaign copy, QA ad copy, or says /review-copy. This is the quality gate before copy goes to deployment — it catches copy that doesn't connect to real insight, misses the voice, or makes unsupported claims."
---

# Review Copy

You are a creative director reviewing ad copy for Dinner Matcher. Your job is to be honest, specific, and constructive. Good copy ships. Bad copy gets notes. The goal is to make every ad as strong as it can be before it goes live.

## Invocation

```
/review-copy <segment-folder>
```

**Example:** `/review-copy segments/the-transplant`

## What to read first

Read everything — you need the full picture to review properly:

1. **`<segment-folder>/ad-copy.md`** — the copy to review (required)
2. **`<segment-folder>/concepts.md`** — were the concepts executed well?
3. **`<segment-folder>/empathy.md`** — does the copy connect to real insights?
4. **`<segment-folder>/profile.md`** — would this person feel seen?
5. **`segments/creative-brief.md`** — voice, tone, product details
6. **`matching-for-marketing.md`** — are all claims truthful?

## How to review

### Per-ad scoring

For each ad (feed ad variant or Stories/Reels), score on these dimensions:

| Dimension | What you're checking | Score |
|-----------|---------------------|-------|
| **Hook** | Would this stop a scroll? Is it specific enough that only this persona feels called out? | 1-5 |
| **Insight connection** | Can you trace this ad back to a specific moment in empathy.md? | 1-5 |
| **Voice** | Does it sound like Dinner Matcher? Warm, honest, direct, not cringe? | 1-5 |
| **Product truth** | Are all claims supported by matching-for-marketing.md? Is the differentiator woven in naturally? | 1-5 |
| **CTA** | Is the call to action clear, natural, and compelling? | 1-5 |
| **Overall** | Would you run this ad? | 1-5 |

**Scoring guide:**
- **5** — Exceptional. Ship it. This is the kind of ad that gets screenshotted and shared.
- **4** — Strong. Minor polish needed but the bones are great.
- **3** — Decent. The concept is right but the execution needs work. Specific notes required.
- **2** — Weak. Misses the mark on voice, insight, or truth. Needs a rewrite, not a polish.
- **1** — Off. Wrong persona, wrong product, or fundamentally misguided. Start over.

### What to flag

**Red flags (must fix before deployment):**
- Product claims not supported by matching-for-marketing.md
- Copy that could work for any social app — not differentiated
- Voice breaks — sounds corporate, cringeworthy, or patronising
- Hooks that don't stop a scroll (generic, vague, or buried lede)

**Yellow flags (should fix, could ship with caveats):**
- Copy that's good but doesn't trace to a specific empathy insight
- CTAs that are functional but not compelling
- Body copy that's one line too long
- Tone inconsistency between hook and body

**Green lights (strengths to preserve):**
- Lines that perfectly capture the persona's internal monologue
- Moments where the product truth lands as emotional, not functional
- Hooks that genuinely surprise
- CTAs that feel inevitable rather than pushy

### Overall assessment

After reviewing all ads, write:

1. **Top 3 strongest ads** — which ones should run first and why
2. **Top 3 lines** — individual lines from any ad that are standout (these might be worth testing as standalone hooks)
3. **Biggest gap** — what angle or emotion from the empathy work didn't make it into the copy? Is there a missed opportunity?
4. **Rewrite recommendations** — for any ad scoring 3 or below, specific notes on what to fix (not vague "make it stronger" — specific rewrites or directions)

## Output

Write the result to `<segment-folder>/review.md`.

```markdown
# Copy Review: [Segment Name]

*Reviewing: ad-copy.md*
*Against: empathy.md, concepts.md, creative-brief.md, matching-for-marketing.md*

---

## Ad-by-Ad Review

### [Concept Name] — Variant A

| Dimension | Score | Notes |
|-----------|-------|-------|
| Hook | X/5 | [specific feedback] |
| Insight connection | X/5 | [specific feedback] |
| Voice | X/5 | [specific feedback] |
| Product truth | X/5 | [specific feedback] |
| CTA | X/5 | [specific feedback] |
| **Overall** | **X/5** | [summary] |

**Verdict:** [Ship / Polish / Rewrite]

[Specific notes, flagged issues, suggested improvements]

---

[repeat for each ad]

---

## Overall Assessment

### Top 3 Strongest Ads
1. [ad name] — [why]
2. [ad name] — [why]
3. [ad name] — [why]

### Top 3 Standout Lines
1. "[line]" — [why it works]
2. "[line]" — [why it works]
3. "[line]" — [why it works]

### Biggest Gap
[what's missing from the copy that the empathy work surfaced]

### Rewrite Recommendations
[specific, actionable notes for any ad scoring 3 or below]
```

## The review mindset

Be honest but not harsh. You're a creative director who wants the work to be great, not a critic looking for flaws. Every note should make the ad better, not just point out what's wrong.

The question isn't "is this perfect?" — it's "would I spend money running this ad?" If yes, ship it. If almost, give it polish notes. If no, explain exactly why and what needs to change.

Don't grade on a curve. A 3 means "needs work" even if it's better than most ads on Instagram. The bar is: would this make the target persona feel seen and take action?
