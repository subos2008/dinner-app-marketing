# Launch Plan

## Where We Are
- Customer profiles defined (4 primary segments, prioritised)
- First-pass ad copy written for all segments (feed + stories/reels)
- Meta ads MCP configured (needs auth testing)
- App is in pre-launch — marketing needs to be ready to go when it is

---

## Phase 1: Foundation (Before Ads Spend a Penny)

### 1. Lock in launch segment
- **Lead with The Transplant** — easiest to target, highest intent, lowest persuasion needed
- Run The Explorer as a secondary test if budget allows
- The Outgrower and The Quiet One come later once we have data and cash flow

### 2. Define Meta audience specs
Turn the profile descriptions into actual Meta targeting parameters:
- **The Transplant:** Recently moved (Meta tracks location changes), age 25-32, interests in local events/food/restaurants, within Manchester radius
- **The Explorer:** Interests in remote work/digital nomad/coworking/travel, location doesn't match hometown, age 25-38, within Manchester radius
- Use `search_interests` via Meta MCP to find exact interest IDs and audience sizes
- Build 2-3 audience variants per segment for testing

### 3. Ad creative generation & review
We generate and review ad creative in this repo — copy, images, and video concepts all live here.

**Process:**
- Generate image concepts and AI imagery here for review
- Iterate on creative direction until we're happy, then export for use
- Store approved creative assets in `/creative/` with naming that ties back to segment + variant
- Review rounds happen here — not in Slack, not in someone's head

**Decisions needed before first round:**
- **Photography vs illustration vs UGC style?**
- **What does the dinner look like?** Warm, candlelit table? Group of people laughing? Empty seat being filled?
- **Video or static for first run?** Reels copy is written but needs production
- **Do we have real dinner photos** or are we starting with stock/AI-generated imagery?

### 4. Landing experience
The ad clicks through to the onboarding app. Need to make sure:
- The first screen matches the ad promise (no disconnect between "dinner with 5 strangers" and what they land on)
- Copy on the app landing matches the segment being targeted (ideally dynamic, but even just consistent tone helps)
- Load time is fast — Meta penalises slow landing pages in ad delivery
- Tracking pixels / conversion events are firing (see Phase 2)

### 5. Budget & test plan
- **Starting budget:** TBD — but enough to get statistically meaningful results per ad variant
- **Test structure:** 2-3 audience variants × 3-4 ad copy variants = 6-12 ad sets
- **What we're testing first:**
  - Which copy hook performs best per segment
  - City-specific ("New to Manchester?") vs generic ("New to the city?")
  - Direct address vs POV framing
  - Clean vs spicy tone (with/without swearing)
- **Kill criteria:** If an ad isn't performing after sufficient impressions, kill it. Don't let bad ads drain budget.

---

## Phase 2: Tracking & Attribution

### 1. Meta Pixel / Conversions API
- Install Meta Pixel on the onboarding app
- Set up Conversions API (server-side) for more reliable tracking
- Define conversion events:
  - `Lead` — started onboarding
  - `CompleteRegistration` — finished profiling questions
  - `Purchase` — paid for a dinner

### 2. Define success metrics
- **CPA (Cost Per Acquisition):** What can we afford to pay for a dinner booking? Need to know ticket price.
- **CTR (Click-Through Rate):** Benchmark ~1-2% for cold traffic on Meta
- **Conversion rate:** From ad click → dinner booked. Depends on onboarding flow friction
- **ROAS:** Only relevant if we're tracking revenue per booking

### 3. UTM tracking
- Tag all ad URLs with UTM parameters so we can see which segment/copy/creative drove what
- Structure: `utm_source=meta&utm_medium=paid&utm_campaign={segment}&utm_content={ad_variant}`

---

## Phase 3: Go Live

### 1. Test Meta MCP connection
- Auth with Meta via Pipeboard
- Pull ad accounts — confirm we have access
- Pull any existing campaigns/data
- Test creating a draft campaign programmatically

### 2. Build campaigns
Using Meta MCP + our ad copy:
- Create campaign with `CONVERSIONS` objective
- Build ad sets per audience variant
- Upload creatives (copy + images)
- Set budgets and schedules
- Launch in draft/paused state for review before going live

### 3. Launch sequence
1. Turn on Transplant ads first (2-3 variants)
2. Let them run for 3-5 days with enough budget to learn
3. Kill underperformers, scale winners
4. If Transplant is working, add Explorer as second segment
5. Iterate copy based on what's resonating

---

## Phase 4: Iterate & Scale

### 1. Feedback loop
- Weekly review of ad performance
- Which hooks are working? Which segments are converting?
- Feed learnings back into ad copy and creative — generate new variants based on winners
- Review and iterate on creative in this repo before pushing to Meta
- Test new formats (video, carousel, UGC-style) once we know what messaging lands

### 2. Expand segments
- Once Transplant + Explorer are dialled in, build campaigns for The Outgrower
- The Quiet One is a brand play — consider organic content, testimonials, longer-form storytelling rather than direct-response ads

### 3. Expand geography
- Manchester first → London → US cities
- Each city needs localised copy (city name, cultural references)
- Audience sizes will differ — London and US cities have much bigger pools

### 4. Marketing automation
- Build repeatable workflows: segment → copy → targeting → campaign creation
- Use Meta MCP to automate campaign spinning, reporting, budget adjustments
- Goal: go from "idea" to "live ad" in minutes, not days

---

## Open Questions
- **Price point?** Affects CPA targets and which segments are viable
- **Visual creative?** Who's making it? Do we have dinner photos?
- **Onboarding app readiness?** Is the landing experience ready for paid traffic?
- **Budget?** What's the initial test budget for Manchester?
- **Manchester-specific angles?** Any local cultural hooks worth leaning into?
