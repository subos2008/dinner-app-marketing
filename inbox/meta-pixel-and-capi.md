# 035a — Meta Pixel & Conversions API

## Status: In progress — ViewContent CAPI remaining

## Depends on
- 08 (staging & production environments)
- 038-launch-marketing (need Meta Ads account + pixel created)
- execution/036-redo-onboarding-flow.md

## Scope
Add Meta Pixel (browser-side) and Conversions API (server-side) so Meta can attribute ad clicks to conversions and optimise ad delivery. This is specifically for feeding data back to Meta — site analytics is covered by GA4 in 035b.

## Why both Pixel and CAPI?
- **Pixel alone** misses ~30-40% of conversions due to ad blockers, iOS privacy changes, and browser restrictions
- **CAPI alone** misses the browser-side click context Meta needs for attribution
- **Both together** with deduplication gives Meta the best signal for ad optimisation. Meta calls this "redundant setup" and it directly improves ad performance.

## Meta Pixel IDs

| Environment | Pixel ID | Name |
|---|---|---|
| **Staging** | `1328089399054801` | Staging Pixel (original, repurposed) |
| **Production** | `1781194169225797` | Onboarding Pixel |

## Meta dashboard setup
- [x] Created pixel ("Onboarding Pixel") in Meta Events Manager
- [x] Selected "Set up manually" for Conversions API (no Datahash/Gateway/partner)
- [x] Selected CAPI events: **View Content**, **Initiate Checkout**, **Purchase**, **Complete Registration**
- [x] Selected event parameters: Event Time, Event Name, Event Source URL, Action Source, **Event ID** (for deduplication)
- [x] Selected customer information parameters per event:
  - Client IP Address (Do Not Hash)
  - Client User Agent (Do Not Hash) — required
  - Email
  - Phone
  - City
  - Country
  - Click ID (fbc) — for ad click attribution
  - External ID — Supabase user ID for cross-device matching
- [x] Generated CAPI access token (with Dataset Quality API)
- [x] Set `META_CAPI_TOKEN` and `META_PIXEL_ID` as Supabase edge function secrets (both staging and production)

## Acceptance criteria

### Meta Pixel (browser-side)
- [x] Add `VITE_META_PIXEL_ID` to `.env.staging` and `.env.production` for homepage, onboarding, subscribers
- [x] Add Meta Pixel base code to `index.html` for homepage, onboarding, subscribers
- [x] Fire `PageView` on page load (automatic with base code)
- [x] Fire `Lead` when user submits contact info in onboarding
- [x] Fire `InitiateCheckout` when redirecting to Stripe
- [x] Fire `Purchase` on subscribers SPA when `?welcome=true` (returning from Stripe)
- [x] Verify events appear in Meta Events Manager → Test Events

### Conversions API (server-side)
- [x] Save CAPI access token from Meta dashboard setup
- [x] Add `META_CAPI_TOKEN` and `META_PIXEL_ID` as Supabase edge function secrets (both envs)
- [x] Send `Purchase` event from `stripe-webhook` when `checkout.session.completed` fires
- [x] Send `CompleteRegistration` event from `stripe-webhook` alongside `Purchase`
- [~] Send `ViewContent` event — relying on browser pixel PageView for now (no server-side touchpoint for page views)
- [x] Send `InitiateCheckout` event from `create-checkout` edge function
- [x] Include all configured customer parameters per event:
  - `em` (email, SHA256 hashed)
  - `ph` (phone, SHA256 hashed)
  - `client_ip_address` (from request headers, unhashed) — captured in create-checkout, passed through Stripe metadata to webhook
  - `client_user_agent` (from request headers, unhashed) — same as above
  - `fbc` (constructed from `fbclid`)
  - `external_id` (Supabase user ID)
  - `ct` (city, looked up from city table)
  - `country` (`gb`)
- [x] Include `event_id` for deduplication with browser pixel
- [x] Use Stripe `session.amount_total` and `session.currency` for Purchase value (not hardcoded)
- [x] InitiateCheckout CAPI omits value (price not yet confirmed at that stage)
- [x] Verify server events appear in Meta Events Manager with "Server" source
- [~] Update prod CAPI dashboard: change Subscribe → Complete Registration (cosmetic — doesn't affect event delivery)
- [~] Consider enabling "Automatic advanced matching" in Meta dashboard (redundant with CAPI PII, low priority)

### Deduplication
- [x] Generate `event_id` (UUID) in the onboarding SPA before redirecting to Stripe
- [x] Pass `event_id` through Stripe checkout as metadata (`purchase_event_id`)
- [x] Browser pixel `Purchase` event and CAPI `Purchase` event use the same `event_id`
- [x] `InitiateCheckout` browser pixel and CAPI share the same `event_id`
- [x] Meta deduplicates automatically when `event_id` matches
- [x] `purchaseEventId` passed through Stripe success URL (`&eid=...`) so subscribers app can read it

### UTM → Meta attribution
- [x] Capture `fbclid` from URL on onboarding landing (Meta appends this to ad click URLs)
- [x] Store `fbclid` in sessionStorage (via `captureFbclid()` on app mount)
- [x] Construct `fbc` parameter from `fbclid` (format: `fb.1.{timestamp}.{fbclid}`)
- [x] Pass `fbc` to `create-checkout` edge function
- [x] `fbc` stored in Stripe session metadata, available in webhook
- [x] CAPI events include `fbc` parameter for click attribution

### Event Match Quality
- [x] Check EMQ score in Meta Events Manager (target: 6+, ideal: 8+)
  - InitiateCheckout: 8.0/10
  - Purchase: 6.6/10 → expected to improve now that client IP + UA pass through Stripe metadata
  - CompleteRegistration: 6.6/10 → same improvement expected
- [x] All 8 customer parameters configured and sending correctly

## Event map

| SPA | Event | Trigger | Source | Dedup |
|---|---|---|---|---|
| Homepage | `PageView` | Page load | Pixel (base code) | — |
| Onboarding | `PageView` | Page load | Pixel (base code) | — |
| Onboarding | `Lead` | Contact info saved | Pixel (`useSave.ts`) | — |
| Onboarding | `InitiateCheckout` | Stripe redirect | Pixel (`useSave.ts`) | Shared `eventId` |
| Subscribers | `PageView` | Page load | Pixel (base code) | — |
| Subscribers | `Purchase` | Welcome screen (`?welcome=true`) | Pixel (`WelcomeScreen.tsx`) | Shared `eid` from URL |
| — | `InitiateCheckout` | `create-checkout` edge function | CAPI | Shared `eventId` |
| — | `Purchase` | `stripe-webhook` checkout.session.completed | CAPI | Shared `purchase_event_id` from Stripe metadata |
| — | `CompleteRegistration` | `stripe-webhook` checkout.session.completed | CAPI | `{purchase_event_id}-reg` (server-only, no browser pair) |
| Admin | — | — | No pixel | — |

## Files

### Browser-side
- `web-apps/homepage/index.html` — pixel base code
- `web-apps/onboarding/index.html` — pixel base code
- `web-apps/subscribers/index.html` — pixel base code
- `web-apps/onboarding/src/lib/meta-pixel.ts` — `trackLead()`, `trackInitiateCheckout()`, `captureFbclid()`, `getFbc()`
- `web-apps/onboarding/src/hooks/useSave.ts` — fires Lead + InitiateCheckout, passes eventId/fbc to create-checkout
- `web-apps/onboarding/src/App.tsx` — calls `captureFbclid()` on mount
- `web-apps/subscribers/src/lib/meta-pixel.ts` — `trackPurchase()`
- `web-apps/subscribers/src/screens/WelcomeScreen.tsx` — fires Purchase with `eid` from URL
- `web-apps/subscribers/src/App.tsx` — parses `eid` from URL, passes to WelcomeScreen
- `.env.staging` / `.env.production` per SPA — `VITE_META_PIXEL_ID`

### Server-side (CAPI)
- `supabase/functions/_shared/meta-capi.ts` — `sendMetaCAPIEvent()`, `sha256()`, `buildUserData()`
- `supabase/functions/create-checkout/index.ts` — sends `InitiateCheckout` CAPI, generates `purchaseEventId`, passes through Stripe metadata + success URL
- `supabase/functions/stripe-webhook/index.ts` — sends `Purchase` + `CompleteRegistration` CAPI with value from Stripe `amount_total`

### Edge function secrets
- `META_CAPI_TOKEN` — access token from Meta Events Manager (per environment)
- `META_PIXEL_ID` — `1328089399054801` (staging), `1781194169225797` (production)

## Resolved decisions
- **Separate pixels per environment** — staging uses original pixel (`1328089399054801`), production uses new pixel (`1781194169225797`). Keeps test events out of production data. Staging pixel is NOT connected to the Ad Account.
- **CAPI per environment** — each pixel has its own CAPI token. Both staging and production tokens generated and set.
- **No hardcoded pricing** — Purchase CAPI uses `session.amount_total` from Stripe. InitiateCheckout omits value (multiple price options, not known until Stripe session created). Browser pixel Purchase also omits value (CAPI has the accurate number and Meta deduplicates).
- **Subscribe vs CompleteRegistration** — our code sends `CompleteRegistration` (better match for what's happening). Dashboard may still show Subscribe selected — cosmetic only, doesn't affect event delivery.
- **Automatic advanced matching** — not yet enabled. Worth considering — Meta auto-extracts PII from form fields and hashes it. Since we already send hashed PII via CAPI this would be somewhat redundant, but could help when CAPI events are delayed. Low risk to enable.

## Remaining: ViewContent CAPI

Server-side `ViewContent` event would improve signal quality (redundant with browser pixel, better attribution when ad blockers strip the pixel).

Potential server-side touchpoint: onboarding step transitions. Currently onboarding is a single-page state machine with no URL changes — browser back button doesn't work and there's no back button in the UI. Refactoring onboarding to use URL-based routing (e.g. `/step/contact`, `/step/dietary`) would:
1. Give us a natural server-side touchpoint for `ViewContent` (each step navigation could hit an edge function or be logged)
2. Fix browser back button support
3. Enable adding a back button in the UI
4. Improve analytics granularity (which steps do users drop off at)

This is a broader onboarding routing discussion — see if it makes sense to tackle as part of this or as a separate execution doc.

## Deferred
- `subscription.deleted` (churn) as CAPI event — Meta doesn't optimise on negative events. Revisit if useful for audience building.

## Testing
- Use Meta Events Manager → Test Events tab with test event code
- Use Meta Pixel Helper Chrome extension to verify browser events
- CAPI events show as "Server" in Events Manager, pixel events show as "Browser"
- Deduplicated events show as "Browser & Server"

## References
- spec/analytics.md
- execution/038-launch-marketing.md
- Meta CAPI docs: https://developers.facebook.com/docs/marketing-api/conversions-api
