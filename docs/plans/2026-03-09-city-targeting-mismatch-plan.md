# City Targeting & Mismatch Detection — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Surface mismatches between live cities and ad set targeting in Publisher, with dynamic city selection when creating ad sets.

**Architecture:** Language table as FK lookup, campaign tagged with language, ad sets have city_scope (all/specific). Publisher loads cities from DB, computes mismatches client-side, shows banners and badges.

**Tech Stack:** Supabase (Postgres migration, Edge Functions), vanilla JS SPA (Publisher)

**Design doc:** `docs/plans/2026-03-09-city-targeting-mismatch-design.md`

---

### Task 1: Database migration

**Files:**
- Create: `~/dinner-matcher/supabase/migrations/00044_language_and_city_scope.sql`

**Step 1: Write migration**

```sql
-- Language lookup table
CREATE TABLE public.language (
  code text PRIMARY KEY,
  name text NOT NULL
);

-- RLS: anyone can read languages
ALTER TABLE public.language ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read languages" ON public.language FOR SELECT TO anon, authenticated USING (true);

-- Seed English
INSERT INTO public.language (code, name) VALUES ('en', 'English');

-- Add language FK to country
ALTER TABLE public.country ADD COLUMN language_code text REFERENCES public.language(code);
UPDATE public.country SET language_code = 'en' WHERE name = 'United Kingdom';

-- Add language FK to campaign
ALTER TABLE marketing.campaign ADD COLUMN language_code text REFERENCES public.language(code);

-- Add city_scope to ad_set
ALTER TABLE marketing.ad_set ADD COLUMN city_scope text NOT NULL DEFAULT 'all';
```

**Step 2: Apply migration**

```bash
cd ~/dinner-matcher && supabase db push --linked
```

**Step 3: Commit**

```bash
cd ~/dinner-matcher
git add supabase/migrations/00044_language_and_city_scope.sql
git commit -m "Add language table, campaign language FK, ad_set city_scope"
```

---

### Task 2: Edge function — store city_scope on create, default on pull

**Files:**
- Modify: `~/dinner-matcher/supabase/functions/meta-sync/index.ts`

**Step 1: Update `create_ad_set` action to accept and store `city_scope`**

In the `create_ad_set` handler, destructure `city_scope` from body. Add it to the ad_set insert:

```typescript
const { campaign_id, name, daily_budget_cents, targeting, city_scope } = body
// ...
.insert({
  name,
  campaign_id,
  meta_ad_set_id: metaAdSetId,
  daily_budget_cents: daily_budget_cents ? parseInt(String(daily_budget_cents)) : null,
  targeting: targeting || null,
  city_scope: city_scope || 'all',
  desired_status: 'paused',
  meta_status: 'PAUSED',
})
```

**Step 2: Default city_scope to 'specific' on pull**

In both `pull` and `pull_ad_sets` handlers, add `city_scope: 'specific'` to the insert (not update — don't overwrite user's choice). Only set on new ad sets:

In the `pull` insert block:
```typescript
await serviceClient.from('ad_set').insert({
  ...upsertData,
  meta_ad_set_id: ms.id,
  desired_status: ...,
  city_scope: 'specific',  // <-- add this
})
```

Same for the `pull_ad_sets` insert block.

**Step 3: Deploy**

```bash
cd ~/dinner-matcher && supabase functions deploy meta-sync
```

**Step 4: Commit**

```bash
cd ~/dinner-matcher
git add supabase/functions/meta-sync/index.ts
git commit -m "Store city_scope on ad set create, default to specific on pull"
```

---

### Task 3: Publisher — load cities and languages from DB

**Files:**
- Modify: `web-apps/meta-publisher/index.html`

**Step 1: Add cities and languages to STATE and loadData()**

Add to STATE:
```javascript
var STATE = { ..., cities: [], languages: [] };
```

Add two queries to loadData's Promise.all:
```javascript
supabaseClient.from('city').select('id, name, slug, meta_geo_key, active, country:country_id(id, name, language_code)').eq('active', true).not('meta_geo_key', 'is', null).order('name'),
supabaseClient.from('language').select('*').order('name'),
```

Store results in STATE.cities and STATE.languages.

**Step 2: Add language_code to campaign query**

The campaign query already fetches `*`, so `language_code` will be included automatically once the column exists. No query change needed.

**Step 3: Commit**

```bash
git add web-apps/meta-publisher/index.html
git commit -m "Load cities and languages from DB in Publisher"
```

---

### Task 4: Publisher — dynamic city selection in Create Ad Set form

**Files:**
- Modify: `web-apps/meta-publisher/index.html`

**Step 1: Replace hardcoded city dropdown with city_scope toggle + dynamic city list**

Replace the existing city `<select>` in the create-adset-sheet HTML with:

```html
<div class="form-field">
  <label>City Scope</label>
  <select id="cas-scope">
    <option value="all">All cities for campaign language</option>
    <option value="specific">Specific cities</option>
  </select>
</div>
<div class="form-field" id="cas-cities-field" style="display:none;">
  <label>Cities</label>
  <div id="cas-cities-list"></div>
</div>
```

**Step 2: Wire up scope toggle**

When scope changes to 'specific', show the cities field and render checkboxes from STATE.cities. When 'all', hide it.

**Step 3: Update openCreateAdSetSheet()**

Populate the cities list from STATE.cities. Filter by the selected campaign's language_code — find campaign, get language_code, filter STATE.cities where `city.country.language_code === campaignLanguage`.

**Step 4: Update form submission**

Build targeting.geo_locations.cities from:
- scope='all': all active cities matching campaign language
- scope='specific': checked cities only

Send `city_scope` in the request body alongside targeting.

**Step 5: Remove hardcoded city dropdown and old age range inputs**

Keep age range inputs but remove the old `<select id="cas-city">`.

**Step 6: Commit**

```bash
git add web-apps/meta-publisher/index.html
git commit -m "Dynamic city selection with city_scope in Create Ad Set form"
```

---

### Task 5: Publisher — campaign language display and mismatch banners

**Files:**
- Modify: `web-apps/meta-publisher/index.html`

**Step 1: Show campaign language in renderCampaignInfo()**

Add language tag to the existing info tags:
```javascript
if (c.language_code) {
  var lang = STATE.languages.find(function(l) { return l.code === c.language_code; });
  tags.push({ label: lang ? lang.name : c.language_code });
}
```

**Step 2: Add getCampaignExpectedCities() helper**

```javascript
function getCampaignExpectedCities(campaign) {
  if (!campaign.language_code) return [];
  return STATE.cities.filter(function(city) {
    return city.country && city.country.language_code === campaign.language_code;
  });
}
```

**Step 3: Add getAdSetTargetedCityKeys() helper**

```javascript
function getAdSetTargetedCityKeys(adSet) {
  if (!adSet.targeting || !adSet.targeting.geo_locations || !adSet.targeting.geo_locations.cities) return [];
  return adSet.targeting.geo_locations.cities.map(function(c) { return c.key; });
}
```

**Step 4: Add mismatch banner in renderCampaigns()**

After `renderCampaignInfo(c)`, compute mismatch for "all" scope ad sets:

```javascript
var expectedCities = getCampaignExpectedCities(c);
var allScopeAdSets = cAdSets.filter(function(as) { return as.city_scope === 'all'; });
if (expectedCities.length > 0 && allScopeAdSets.length > 0) {
  // Check each "all" ad set for missing cities
  allScopeAdSets.forEach(function(as) {
    var targeted = getAdSetTargetedCityKeys(as);
    var missing = expectedCities.filter(function(city) {
      return targeted.indexOf(city.meta_geo_key) === -1;
    });
    if (missing.length > 0) {
      var names = missing.map(function(city) { return city.name; }).join(', ');
      html += '<div class="campaign-banner" style="background:#F8D7DA;color:#721C24;">'
        + escapeHtml(as.name) + ': ' + missing.length + ' live cit' + (missing.length === 1 ? 'y' : 'ies') + ' not targeted: ' + escapeHtml(names)
        + '</div>';
    }
  });
}
```

**Step 5: Commit**

```bash
git add web-apps/meta-publisher/index.html
git commit -m "Add campaign language display and city mismatch banners"
```

---

### Task 6: Publisher — ad set city badges and detail targeting

**Files:**
- Modify: `web-apps/meta-publisher/index.html`

**Step 1: Update renderAdSetCard() with city badge**

After existing badges, add city targeting info:

For `city_scope = 'all'`: show "2/4 cities" badge, warning colour if mismatched.
For `city_scope = 'specific'`: show city names from targeting.

Look up the ad set's campaign to get expected cities, then diff against targeted.

**Step 2: Update renderDetail() with full city list**

In the detail view, after the targeting info section, show:
- List of targeted cities
- For `city_scope = 'all'`: missing cities highlighted in red

**Step 3: Commit**

```bash
git add web-apps/meta-publisher/index.html
git commit -m "Add city badges on ad set cards and targeting detail"
```

---

### Task 7: Deploy and verify

**Step 1: Deploy Publisher**

```bash
bash web-apps/meta-publisher/deploy.sh
```

**Step 2: Verify**

1. Pull from Meta — campaigns load, ad sets have `city_scope: 'specific'` by default
2. Set a campaign's `language_code` to 'en' via Supabase dashboard (or add a UI for it later)
3. Change an ad set's `city_scope` to 'all' — mismatch banner appears if it doesn't target all active EN cities
4. Create new ad set with "All cities" scope — targeting includes all active cities for that language
5. Create new ad set with "Specific cities" — only checked cities included, no mismatch warning

**Step 3: Final commit**

```bash
git add -A
git commit -m "City targeting mismatch detection in Publisher"
```
