---
name: new-city
description: "Localise Dinner Matcher ad copy and targeting for a new city. Use this skill when the user wants to launch in a new city, adapt copy for a different geography, localise campaigns, or says /new-city. This takes existing segment copy and makes it city-specific."
---

# New City Localisation

You are adapting Dinner Matcher campaigns for a new city. The core emotional truths and product messaging stay the same — but the specific references, geography, and cultural nuances change.

## Invocation

```
/new-city <city> [<segment-folder>]
```

**Examples:**
- `/new-city london` — localise all segments for London
- `/new-city london segments/the-transplant` — localise one segment for London

## What to read

1. **`<segment-folder>/ad-copy.md`** — the copy to localise
2. **`<segment-folder>/empathy.md`** — for cultural/emotional context
3. **`<segment-folder>/profile.md`** — for targeting adjustments
4. **`segments/creative-brief.md`** — for test variables (city-specific vs generic is listed)

## What to localise

### Copy changes
- **Place names:** Swap generic or Manchester-specific references for the target city. ("Northern Quarter" → "Shoreditch", "Ancoats" → "Peckham", etc.)
- **Cultural references:** What's the equivalent energy? Manchester's indie/creative vibe → London's specific neighbourhood cultures
- **Transport/geography:** Walking routes, commute patterns, neighbourhood dynamics
- **Restaurant culture:** What does dining out look like in this city? What's the equivalent tier?

### Targeting changes
- **Geo-targeting:** City boundaries, key neighbourhoods
- **Zone preferences:** Does this city need zone-based matching? (London: yes. Manchester: probably not yet.)
- **Local interests:** City-specific pages, venues, events to target on Meta

### What NOT to change
- The core emotional truth (loneliness, desire for connection)
- The product mechanics (matched dinners, Wednesdays, 6 people)
- The brand voice (warm, honest, direct)
- The hooks — if a hook works in Manchester, test it unchanged in London first. Only localise if generic versions underperform.

## Output

Create city-specific variants in the segment folder:

```
segments/the-transplant/
├── ad-copy.md              # Original/generic
├── ad-copy-manchester.md   # Manchester-specific
├── ad-copy-london.md       # London-specific
```

Format:

```markdown
# Ad Copy: [Segment Name] — [City]

*Localised from ad-copy.md*
*City: [city]*

---

## Localisation Notes
[What was changed and why. Cultural decisions made.]

---

[localised ads]
```

## City research

If you're not confident about a city's specifics, ask the user. Don't guess at neighbourhood names or cultural references — getting these wrong is worse than keeping them generic.

Key things to get right:
- Neighbourhood names and what they signify (affluent? creative? young?)
- Common commute patterns
- Restaurant culture and price points
- The "loneliness" flavour — a transplant in London feels different from one in Manchester (scale, anonymity, pace)
