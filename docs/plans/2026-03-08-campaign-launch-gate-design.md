# Campaign Launch Gate

## Problem
Ads synced to Meta go live immediately if the campaign is active. Pre-launch, we need a clear, intentional way to keep everything paused until launch day — and then flip the switch.

## Insight
Meta's own hierarchy already provides the gate. A campaign set to PAUSED means zero ads serve, regardless of individual ad status. The launch gate is just making campaign status a first-class, visible control in the Publisher SPA.

## Design

### How it works
- Ads flow through `draft → queued → live ↔ paused` as normal
- `queued` ads sync to Meta as ACTIVE — but they don't serve because the **campaign is PAUSED**
- Launch day: flip the campaign to ACTIVE in the Publisher → all synced ads start serving
- No artificial gates, env vars, or feature flags needed

### 1. meta.ts: add `updateCampaignStatus`

**File:** `supabase/functions/_shared/meta.ts`

Same pattern as `updateAdStatus` — POST to `/{metaCampaignId}` with `{ status }`:

```ts
export async function updateCampaignStatus(metaCampaignId: string, status: 'ACTIVE' | 'PAUSED'): Promise<void> {
  await graphPost(`/${metaCampaignId}`, { status })
}
```

### 2. meta-sync: add `sync_campaign` action

**File:** `supabase/functions/meta-sync/index.ts`

New action handler before the ad sync block:

```ts
if (action === 'sync_campaign') {
  const { campaign_id } = body
  if (!campaign_id) return jsonResponse({ error: 'campaign_id is required' }, 400)

  const { data: campaign, error: cErr } = await userClient
    .from('campaign').select('*').eq('id', campaign_id).single()
  if (cErr || !campaign) return jsonResponse({ error: 'Campaign not found' }, 404)
  if (!campaign.meta_campaign_id) return jsonResponse({ error: 'Campaign has no Meta campaign ID' }, 400)

  const metaStatus = campaign.desired_status === 'live' ? 'ACTIVE' : 'PAUSED'
  await updateCampaignStatus(campaign.meta_campaign_id, metaStatus)

  await userClient.from('campaign')
    .update({ meta_status: metaStatus }).eq('id', campaign_id)

  return jsonResponse({ campaign_id, meta_status: metaStatus })
}
```

### 3. Publisher SPA: campaign status control

**File:** `web-apps/meta-publisher/index.html`

Replace the read-only campaign status badge with a toggle control.

**Campaign header** — replace the static badge with a toggle button:
- PAUSED campaign: show an amber "Paused" button. Tap → confirm → sets `desired_status` to `live`, calls `sync_campaign`.
- ACTIVE campaign: show a green "Active" button. Tap → confirm → sets `desired_status` to `paused`, calls `sync_campaign`.

Add a banner below the campaign header when paused:
```
"Campaign paused — ads will not serve until you activate this campaign."
```

The toggle calls `sync_campaign` on meta-sync, which updates Meta and writes back the `meta_status`.

**Confirmation dialog:** activating a campaign shows "This will start serving all ACTIVE ads in this campaign. Continue?" — because this is the launch moment.

### 4. Campaign status in Creative SPA (read-only)

No changes needed. The Creative SPA doesn't deal with campaigns — it just manages individual ad creative. The campaign is a Publisher concern.

## Launch day sequence
1. All ads built and synced via Publisher (sitting as ACTIVE on Meta, under a PAUSED campaign)
2. Open Publisher → see campaign banner: "Paused — ads will not serve"
3. Tap campaign status → confirm activation
4. Campaign flips to ACTIVE on Meta → ads start serving

## Key files
- `supabase/functions/_shared/meta.ts` — new `updateCampaignStatus` helper
- `supabase/functions/meta-sync/index.ts` — new `sync_campaign` action
- `web-apps/meta-publisher/index.html` — campaign status toggle + banner
