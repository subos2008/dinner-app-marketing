# How Our Matching Supports People

A reference for marketing campaigns — what we actually do when we match subscribers into dinner groups.

## The Core Promise

Every Wednesday, subscribers opt in and our algorithm groups them with 5 other people for dinner at a curated restaurant. The matching is designed so that everyone has the best possible experience — people are grouped with others who share compatible preferences, not randomly.

## What We Collect During Onboarding

Each subscriber answers these questions when they sign up. Their answers directly feed the matching algorithm:

| Question | Options | Why we ask |
|----------|---------|------------|
| Age | Exact number | Group people of similar ages together |
| Gender | Male, Female, Non-binary | Balance genders within groups |
| City | From curated list | Match within the same city |
| Zone preferences | City sub-areas (e.g. North/South London) | Keep restaurants geographically convenient |
| Alcohol preference | Yes / No / Don't mind | Group non-drinkers together |
| Dietary status | Omnivore / Flexitarian / Vegetarian / Vegan / Carnivore | Group by dietary needs, influences restaurant choice |
| Budget preference | $ / $$ / $$$ / $$$$ / Don't mind | Match people with similar spending expectations |
| Politics preference | Scale of comfort / Yes / No / Don't mind | Avoid awkward tables where some want to debate and others don't |
| Interests | Multi-select: Sports, Meditation, Outdoors, Gym, Socialise, Book Clubs, Board Games, Adventure, Art, Business, Gigs, Sober Events, Nightlife + freetext Other | Collected but **not yet** used for matching — planned as a "connection bonus" |
| Relationship status | Single / In a relationship / Married / etc. | Collected but **not** currently used for matching |

## How Matching Works (Marketer's Summary)

The algorithm uses a **penalty-based scoring system**. It doesn't hard-partition people into buckets — instead, it calculates how "costly" each potential grouping is and optimises for the lowest overall cost. This means:

- **Strong preferences are respected strongly** — alcohol and dietary conflicts carry heavy penalties
- **Soft preferences are honoured when possible** — age and budget are nudged toward similarity but won't leave someone unmatched
- **Nobody gets left out** — the algorithm will grow groups to 7 or even 8 rather than leave a paying subscriber without a dinner

### Priority order of matching factors

1. **Alcohol** (highest priority) — Non-drinkers are grouped together. "Don't mind" people go wherever they're needed. Mixing a definite "no" with a definite "yes" is heavily avoided.

2. **Dietary** — Vegans are grouped together. Vegetarians cluster separately from omnivores. This also determines which restaurant the group is booked into (vegan-friendly, vegetarian-suitable, etc.).

3. **Budget** — People who selected similar price tiers are grouped together. The group's restaurant is matched to the lowest budget preference in the group, so nobody is taken somewhere they can't afford.

4. **Gender balance** — The algorithm aims for a balanced mix of men and women. Non-binary members are included naturally without affecting the M/F balance calculation.

5. **Age** — People of similar ages are preferred. There's a soft 15-year threshold during initial grouping, but the optimizer will stretch this rather than leave someone out.

6. **Politics** — Used as a tiebreaker to cluster people with similar comfort levels around political conversation.

7. **Zone** (multi-zone cities only) — In cities like London with defined zones, members with zone preferences are matched together so the restaurant is in a convenient area for everyone.

## Group Sizes

- **Target**: 6 people
- **Normal range**: 5–7
- **Absolute maximum**: 8 (only to avoid leaving someone unmatched)
- **Rationale for 6**: Absorbs 1–2 cancellations gracefully, small enough for real conversation, standard restaurant table size

## Niche Dinners That Emerge Naturally

The algorithm naturally creates niche groups based on preferences. These are strong marketing angles:

### Sober Dinners
- People who select "No" for alcohol are grouped together
- Marketing angle: "Meet new people without the pressure to drink", "Looking for more sober friends?"
- The restaurant can be chosen to suit (venues where not drinking isn't awkward, good mocktail menus)

### Vegan Dinners
- Vegans cluster together and get booked into vegan-friendly restaurants
- Marketing angle: "Vegan dinners — meet your people"
- Strong identity-based community

### Vegetarian Dinners
- Vegetarians grouped together, booked into suitable restaurants
- Larger pool than vegan, easier to fill

### Women Only (future)
- Gender preference question enables this (currently collected but matching on it is not yet live)
- Proven demand — competitor Timeleft recently launched this

### Budget-Specific Experiences
- $ groups get budget-friendly restaurants
- $$$$ groups get fine dining experiences
- Each price tier has city-specific labels (e.g. "£15-20" for $ in Manchester)

## Restaurant Matching

Groups aren't just matched by people — they're matched to a restaurant that fits:

- **Dietary compatibility**: Vegan group → vegan restaurant. Omnivore group → any restaurant.
- **Budget alignment**: Group's effective budget (= most restrictive member's preference) determines the restaurant price tier
- **Location**: Restaurants are in curated central zones. In multi-zone cities, the restaurant is in a zone that works for the group's zone preferences.
- **Quality**: All restaurants are curated — minimum 4.3 Google rating, no live music, not too noisy, good vibes

## What Subscribers Experience

1. **Opt in** for an upcoming Wednesday (proactive, not automatic — reduces no-shows)
2. **Matching runs** behind the scenes on Tuesday
3. **Admin reviews** the proposed groups (human oversight, not fully automated)
4. **Confirmation sent** with: restaurant name, address, Google Maps link, time, reservation name, cancel link
5. **Who's coming is a surprise** — we intentionally don't reveal group members beforehand
6. **Icebreaker questions** sent on the evening to help kick off conversation

## Key Marketing Claims the Matching Supports

| Claim | How matching delivers it |
|-------|--------------------------|
| "You'll be matched with people like you" | Penalty scoring groups compatible people across 6+ dimensions |
| "Sober-friendly dinners" | Non-drinkers are grouped together, not scattered among drinkers |
| "Your budget, your dinner" | Budget matching ensures nobody is taken to a restaurant they can't afford |
| "Vegan? We've got you" | Vegans are grouped together with a vegan-friendly restaurant |
| "Dinner with 5 strangers every Wednesday" | Target group size of 6 (you + 5 others) |
| "In your part of the city" | Zone-aware matching in large cities keeps restaurants convenient |
| "We pick the restaurant" | Curated list, quality-checked, matched to group's dietary and budget needs |
| "A balanced group" | Gender balance is actively optimised |
| "Meet people your age" | Age similarity is a matching factor (soft preference) |

## What We Don't Do (Yet)

- **Repeat avoidance**: Not yet penalising re-pairing people who've already dined together (schema supports it, planned for later)
- **Feedback-aware matching**: "Didn't vibe" feedback from past dinners doesn't yet influence future matching (planned)
- **Language matching**: Not yet enforced (Manchester-only, everyone speaks English — needed for international expansion)
- **Singles-only dinners**: Relationship status is collected but not used for matching
- **Interest-based matching**: We collect "What do you want more of in your life?" during onboarding (sports, meditation, outdoors, gym, socialise, book clubs, board games, adventure, art, business, gigs, sober events, nightlife — plus freetext "Other"). Data is stored but not yet used by the matching algorithm. Plan is to introduce a "connection bonus" score alongside the existing penalty system, matching people with shared interests.
