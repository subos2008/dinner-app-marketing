# City Targeting & Mismatch Detection

## Problem

As new cities go live in the product, we need to know which ad campaigns are missing them. The Publisher should surface mismatches between live cities and cities targeted by ad sets, so we can act quickly when a new city launches.

## Data Model

### New table: `language` (public schema)

| Column | Type | Notes |
|--------|------|-------|
| `code` | text PK | ISO 639-1, e.g. `'en'`, `'de'` |
| `name` | text NOT NULL | Display name, e.g. `'English'` |

Seed: `('en', 'English')`.

### New columns

| Table | Column | Type | Notes |
|-------|--------|------|-------|
| `country` | `language_code` | text FK → `language(code)` | e.g. UK → `'en'` |
| `campaign` | `language_code` | text FK → `language(code)` | Which language this campaign serves |
| `ad_set` | `city_scope` | text NOT NULL DEFAULT `'all'` | `'all'` or `'specific'` |

### Existing infrastructure

- `city.active` — source of truth for "is this city live"
- `city.meta_geo_key` — Meta geographic targeting key
- `ad_set.targeting` JSONB — stores `geo_locations.cities` array sent to Meta
- `country.id` ← `city.country_id` — links city to country (and thus language)

## Mismatch Detection Logic

1. Campaign has `language_code` (e.g. `'en'`)
2. Expected cities = all active cities where `country.language_code = campaign.language_code` AND `city.meta_geo_key IS NOT NULL`
3. For each ad set with `city_scope = 'all'`: extract city keys from `targeting.geo_locations.cities`
4. Missing = expected - targeted

Ad sets with `city_scope = 'specific'` are exempt from mismatch detection — user deliberately chose those cities.

## Publisher UI Changes

### Campaign mismatch banner

Below each campaign header, when any `city_scope = 'all'` ad sets are missing live cities:

> Warning: 2 live cities not targeted: Birmingham, Leeds

Only shown when there's a gap.

### Ad set cards

- `city_scope = 'all'`: Badge showing "2/4 cities" with warning colour if mismatched
- `city_scope = 'specific'`: Show targeted city names, no warning

### Ad set detail view

Full list of targeted cities. For `city_scope = 'all'`, also show which cities are missing.

### Create Ad Set form

Replace hardcoded city dropdown with dynamic data from DB (active cities with `meta_geo_key`).

Two modes:
- **All cities** — auto-selects all active cities for the campaign's language. Determined by language, not manually picked.
- **Specific cities** — multi-select from active cities.

Targeting JSON sent to Meta is built from the selected cities.

## Scope boundaries

- Manual detection only — no auto-updating of Meta targeting when a city goes live
- No ad creation for new cities — just detection that targeting is missing
- No campaign creation — campaigns still come from Meta via Pull

## Files to modify

- `~/dinner-matcher/supabase/migrations/00044_language_and_city_scope.sql` — new table + columns
- `~/dinner-matcher/supabase/functions/_shared/meta.ts` — no changes needed
- `~/dinner-matcher/supabase/functions/meta-sync/index.ts` — store city_scope on create_ad_set, pull language data
- `web-apps/meta-publisher/index.html` — dynamic city dropdown, mismatch banners, city_scope toggle, ad set city badges
