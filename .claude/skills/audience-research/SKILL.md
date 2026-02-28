---
name: audience-research
description: "Research Meta targeting options and audience sizes for Come Join Us campaigns. Use this skill when the user wants to explore targeting, find audience sizes, research Meta interests, check targeting feasibility, or says /audience-research. This uses the Meta Ads MCP to pull real targeting data."
---

# Audience Research

You are researching Meta advertising targeting options to build audience specs for Come Join Us campaigns. The goal is to find the right targeting parameters that reach each segment efficiently.

## Invocation

```
/audience-research <segment-folder> [<city>]
```

**Examples:**
- `/audience-research segments/the-transplant manchester`
- `/audience-research segments/the-sober-one`

## What to read

1. **`<segment-folder>/profile.md`** — the Meta targeting signals are listed here
2. **`segments/strategy.md`** — segment priority context
3. **`segments/creative-brief.md`** — test variables that affect targeting

## Research process

### 1. Explore targeting options

Use the Meta Ads MCP tools to search for:

**Interest-based targeting:**
- Search for interests listed in profile.md
- Find related interests Meta offers
- Get audience size estimates for each interest

**Behavioural targeting:**
- Recently moved (for Transplant)
- Travel behaviour (for Explorer)
- Life events Meta tracks

**Demographic targeting:**
- Age ranges
- Location (city + radius)
- Education, job title, relationship status where relevant

### 2. Build audience specs

Create targeting combinations:

**Primary audience** — the tightest targeting, most likely to convert
- Combine the strongest signals
- Estimate audience size — too small (<10k) won't deliver, too large (>500k) wastes budget

**Broad audience** — wider net for scale
- Fewer targeting restrictions
- Rely more on Meta's algorithm + strong creative

**Lookalike potential** — once we have conversions
- Note which signals would make good seed audiences for lookalikes

### 3. Estimate and recommend

For each audience:
- Estimated size in the target city
- Estimated CPM (use Meta benchmarks for the region)
- Recommended daily budget to reach meaningful sample
- Confidence level (high/medium/low) in the targeting

## Output

Write to `<segment-folder>/audience-research-<city>.md`:

```markdown
# Audience Research: [Segment] — [City]

*Research date: [date]*

---

## Targeting Summary

### Primary Audience
- **Interests:** [list with audience sizes]
- **Behaviours:** [list]
- **Demographics:** Age [range], Location [city + radius]
- **Estimated size:** [number]
- **Confidence:** [high/medium/low]

### Broad Audience
- **Targeting:** [simplified parameters]
- **Estimated size:** [number]
- **Rationale:** [why this works as a broad option]

### Exclusions
- [audiences to exclude — e.g., existing customers, competitors' employees]

---

## Interest Deep-Dive

| Interest/Behaviour | Audience Size | Relevance | Notes |
|-------------------|--------------|-----------|-------|
| [interest] | [size] | [high/med/low] | [notes] |

---

## Recommendations

1. **Start with:** [which audience to test first]
2. **Daily budget:** [recommendation with reasoning]
3. **Expected CPM:** [estimate]
4. **Scaling path:** [how to expand once we have data]

---

## Unknowns / To Verify
- [things to check once the campaign is live]
```

## Important notes

- Audience sizes change. Note the date of research.
- Don't over-target. Meta's algorithm is often better than manual interest stacking. Start specific, then broaden.
- If the Meta Ads MCP doesn't provide audience size data, note this and use general UK benchmarks as estimates.
