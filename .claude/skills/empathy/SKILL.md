---
name: empathy
description: "Take on the persona of a Dinner Matcher customer segment and produce deep empathy work — empathy maps, day-in-the-life narratives, emotional journeys, and key phrases for copy. Use this skill whenever the user asks for empathy work, persona deep-dives, day-in-the-life exercises, empathy mapping, or wants to understand a customer segment at a deeper emotional level before writing copy. Also use when the user says /empathy."
---

# Empathy Deep-Dive

You are doing the work an agency strategist does between "customer profile" and "ad copy" — the empathy step that turns demographic data into genuine human understanding.

## Invocation

```
/empathy <segment-folder>          # deep mode (default)
/empathy <segment-folder> quick    # quick monologue mode
/empathy <segment-folder> both     # run both modes into one file
```

**Example:** `/empathy segments/the-transplant` or `/empathy segments/the-transplant quick`

## What to read first

Before generating anything, read these files to ground yourself:

1. **`<segment-folder>/profile.md`** — the segment persona (required)
2. **`segments/creative-brief.md`** — brand voice, product details, what's working
3. **`matching-for-marketing.md`** — how matching actually works, what claims we can make

Read all three. The profile tells you WHO this person is. The brief tells you HOW we talk. The matching doc tells you WHAT we actually deliver — so the empathy work stays grounded in real product truth, not marketing fantasy.

## Modes

### Deep mode (default)

Produce a structured empathy document with these sections. The key is that every section should feel like it came from a real person, not a framework. If it reads like a textbook exercise, rewrite it until it reads like insight.

#### 1. Persona snapshot
Take on the persona fully. Give them a name, age, specific situation. Write 2-3 sentences in first person as this person introducing themselves. Make them specific and real — not a composite, a person.

**Good:** "I'm Priya, I'm 29. I moved to Manchester from Birmingham eight months ago for a senior dev role at a fintech startup. I've got a flatmate I found on SpareRoom — she's nice but we're not friends."

**Bad:** "I'm a 25-32 year old professional who recently relocated to a new city."

#### 2. Empathy Map (4 quadrants)

Each quadrant should have 5-8 specific, concrete items. Not generic statements — things this specific person would actually think, say, see, hear.

**Think & Feel** — their internal world. Hopes, worries, the things they think about at 11pm. The gap between what they expected and what they got.

**Say & Do** — observable behaviour. What they'd tell their mum vs what they'd tell a close friend vs what they'd post on Instagram. The gap between public and private is where the insight lives.

**See** — their environment. What's on their Instagram feed, what they see at work, what they notice walking home. The visual world that reinforces their emotional state.

**Hear** — what people tell them, what media says, what advice they get. "You should join a club!" "Give it time!" The well-meaning noise that doesn't help.

#### 3. Day in the life — the triggering day

Walk through ONE specific day, moment by moment, from waking up to going to bed. This should be the day that would make this person receptive to seeing a Dinner Matcher ad. Not the worst day of their life — just a day where the loneliness becomes undeniable.

Write it in present tense, close third person. Make it cinematic and specific. Include:
- The mundane (breakfast alone, commute, work chat that stays surface-level)
- The near-miss (almost made a connection but didn't)
- The trigger moment (the specific point where the feeling hits)
- The evening (what they actually do vs what they wish they were doing)

This narrative is the most valuable part of the empathy work. Take your time with it.

#### 4. Pain points & desires

Two columns, matched. Each pain point should have a corresponding desire — what they actually want instead. Include what they're afraid of (the fear that stops them acting).

Format:
| Pain | Desire | Fear |
|------|--------|------|

6-8 rows. Be specific. "Lonely" is not a pain point. "Eating dinner alone on a Wednesday while watching other people's group dinners on Instagram" is.

#### 5. Emotional journey

Map the emotional arc from trigger through to post-dinner:

**Trigger** → **Search/Browse** → **Discovery** (sees the ad) → **Consideration** → **Objections** → **Booking** → **Waiting** → **Showing up** → **During dinner** → **After dinner**

For each stage: what are they feeling, what are they thinking, what could make them drop off, what would keep them moving forward? Write this in first person as the persona.

#### 6. Key phrases for copy

Pull out 10-15 specific phrases from everything above. These should be:
- Things this person would actually say or think (internal monologue)
- Emotional truths that could become ad hooks
- Specific language they'd use (not marketing language)

Group them by potential use: headlines, body copy, CTAs, social proof angles.

---

### Quick mode

Drop the framework entirely. Write a raw, first-person monologue AS this person. 400-600 words. Stream of consciousness. Honest. The kind of thing they'd write in a journal or say to a therapist or type into Notes at 1am.

No headers, no structure, no marketing language. Just the voice. Start mid-thought if that feels right. Let it breathe. Let it contradict itself. Real people aren't consistent.

The goal: if this person read the monologue, they'd feel seen. That's the bar.

---

### Both mode

Run deep mode first, then quick mode. Put both in the same file with a clear separator.

## Output

Write the result to `<segment-folder>/empathy.md`.

Structure the file with a clear header:

```markdown
# Empathy Deep-Dive: [Segment Name]

*Generated from [segment-folder]/profile.md*
*Mode: [deep/quick/both]*

---

[content]
```

## The quality bar

Read your output back before saving. Ask yourself:
- Does this feel like a real person or a marketing persona?
- Would a creative director read this and get excited about writing copy?
- Are there at least 3 moments that surprised you — things that weren't obvious from the profile alone?
- Could you hand this to a copywriter who's never seen the profile and they'd write better copy because of it?

If the answer to any of these is no, rewrite the weak sections before saving.
