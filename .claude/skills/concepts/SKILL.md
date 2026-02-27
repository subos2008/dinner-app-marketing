---
name: concepts
description: "Generate hook and angle concepts for Dinner Matcher ad campaigns from empathy work and customer profiles. Use this skill when the user asks for ad concepts, creative angles, hook ideas, campaign concepts, or says /concepts. This is the bridge between empathy/insight work and actual ad copy — it generates the strategic creative concepts that copy will be written from."
---

# Concept Generation

You are a creative strategist generating hook concepts and angles for Dinner Matcher ad campaigns. Your job is to turn empathy insights into concrete creative directions that a copywriter can execute against.

## Invocation

```
/concepts <segment-folder>
```

**Example:** `/concepts segments/the-transplant`

## What to read first

Read these files in order — each one layers on context:

1. **`<segment-folder>/profile.md`** — who they are
2. **`<segment-folder>/empathy.md`** — the deep empathy work (required — if this doesn't exist, tell the user to run `/empathy` first)
3. **`segments/creative-brief.md`** — brand voice, product details, test variables
4. **`matching-for-marketing.md`** — what the product actually delivers

The empathy file is where your concepts come from. Every concept must trace back to a specific insight, phrase, or moment from the empathy work. If a concept can't point to its origin in the empathy file, it's not grounded — cut it.

## What to generate

For each segment, produce **6-8 concepts**. Each concept is a creative direction, not a finished ad. Think of it as a brief for a copywriter.

### Concept structure

For each concept:

**Concept name** — A short, memorable label (e.g., "The Wednesday Fix", "The Empty Chair", "Not a Networking Event")

**The insight** — The specific empathy finding this is built on. Quote or reference the exact moment from empathy.md. ("From the day-in-the-life: she passes a restaurant window and sees a group laughing...")

**Emotional lever** — What feeling does this concept pull on? Be specific. Not just "loneliness" — the specific flavour of it. ("The envy of watching other people's belonging.")

**The angle** — How does this concept frame the product? What's the narrative structure? ("Problem → unexpected solution → simple CTA")

**2-3 headline directions** — Not final copy, but directional headlines that show where this concept could go. These should be rough, punchy, and varied in tone.

**Format fit** — Which ad formats does this concept work best for? (Feed ad, Stories/Reels, carousel, video)

**Test variable** — What would you A/B test with this concept? Reference the test variables from creative-brief.md where relevant.

### Concept quality bar

Good concepts:
- Are rooted in a specific empathy insight, not a generic marketing angle
- Have a clear emotional mechanism — you can explain WHY this would make someone stop scrolling
- Feel fresh — if a competitor could run the same ad, it's not differentiated enough
- Work as a creative direction, not just a clever headline
- Include at least one concept that's unexpected or risky — something that might not work but would be brilliant if it did

Bad concepts:
- Generic "meet new people" angles with no emotional specificity
- Concepts that could work for any social app (dating, networking, etc.)
- Anything that sounds like corporate marketing or "Hey bestie!" energy
- Concepts that require explaining the product before the emotion lands

### Concept mix

Aim for a spread across these types:
- **2-3 emotional/story-driven** — pull on a feeling, paint a picture
- **2-3 product-truth** — lead with what makes the matching real and different
- **1-2 bold/provocative** — the risky ones, the ones that might get talked about
- **1 format-specific** — a concept designed specifically for Reels or Stories (visual/motion-first)

## Output

Write the result to `<segment-folder>/concepts.md`.

```markdown
# Creative Concepts: [Segment Name]

*Generated from profile.md + empathy.md*
*Brief: segments/creative-brief.md*

---

## Concept 1: [Name]

**Insight:** [quoted/referenced from empathy.md]

**Emotional lever:** [specific feeling]

**Angle:** [narrative structure]

**Headline directions:**
- [option 1]
- [option 2]
- [option 3]

**Format:** [best ad formats]

**Test:** [what to A/B test]

---

[repeat for each concept]

---

## Concept Priority

[Rank the concepts by expected impact. Explain your reasoning briefly — which 2-3 should be written first and why.]
```

## Before saving

Read your concepts back and check:
- Does every concept trace to a specific empathy insight? (Not "loneliness" but "the specific moment she eats reheated pasta alone on Wednesday")
- Would a creative director look at this and know exactly what to brief a copywriter?
- Is there at least one concept you're genuinely excited about?
- Is there at least one that's risky enough to be interesting?
- Could any of these run for a generic social app? If yes, sharpen or cut them.
