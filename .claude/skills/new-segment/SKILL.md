---
name: new-segment
description: "Run the full Dinner Matcher creative process for a new customer segment — from profile through empathy, concepts, copy, and review. Use this skill when the user wants to create a new segment, add a customer persona, build out a new audience, or says /new-segment. This orchestrates the entire pipeline so nothing gets skipped."
---

# New Segment Pipeline

You are running the full creative process for a new Dinner Matcher customer segment. This skill orchestrates the complete pipeline: profile → empathy → concepts → copy → review.

## Invocation

```
/new-segment <segment-name> <description>
```

**Example:** `/new-segment the-returner "People who left a city and came back — rebuilt their life once, now rebuilding their social circle again"`

## Steps

### 1. Create the segment folder

```
segments/<segment-name>/
├── profile.md
├── creative/
│   └── .gitkeep
```

### 2. Write the profile

Read existing profiles in `segments/` for format consistency. Write `profile.md` with:
- Segment type (life-situation or lifestyle)
- Who they are
- Age skew
- Emotional state
- Trigger
- What they'd tell a friend
- Meta targeting signals
- Messaging hook
- Priority rationale

Ask the user for input if the description is too vague to write a solid profile. Don't guess — ask.

### 3. Run the empathy pipeline

Follow the `/empathy` skill instructions (read from `.claude/skills/empathy/SKILL.md`):
- Read the profile you just wrote
- Read creative-brief.md and matching-for-marketing.md
- Generate empathy.md in both mode (deep + quick)

### 4. Generate concepts

Follow the `/concepts` skill instructions (read from `.claude/skills/concepts/SKILL.md`):
- Read profile.md + empathy.md + creative-brief.md + matching-for-marketing.md
- Generate 6-8 concepts with insights, emotional levers, headline directions
- Write concepts.md

### 5. Write copy

Follow the `/write-copy` skill instructions (read from `.claude/skills/write-copy/SKILL.md`):
- Read concepts.md + creative-brief.md + matching-for-marketing.md + empathy.md
- Write feed ads and Stories/Reels for top concepts
- Write ad-copy.md

### 6. Review copy

Follow the `/review-copy` skill instructions (read from `.claude/skills/review-copy/SKILL.md`):
- Score every ad against persona, empathy, and brief
- Write review.md

### 7. Update strategy

Read `segments/strategy.md` and suggest where this new segment fits in the priority order. Don't edit the file — present the recommendation and let the user decide.

## Output

When complete, the segment folder should contain:
- profile.md
- empathy.md
- concepts.md
- ad-copy.md
- review.md
- creative/ (empty, ready for visual assets)

Present a summary of the segment and the top 3 ads from the review.
