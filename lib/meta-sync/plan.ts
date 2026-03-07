/**
 * Plan builder: reads DB state and produces a list of sync actions.
 * Zero Meta API calls — pure DB read.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  SyncAction,
  SyncPlan,
  CampaignRow,
  AdSetRow,
  AdRow,
} from "./types.ts";

/** Map desired_status to Meta API status */
function toMetaStatus(desired: string): string {
  switch (desired) {
    case "approved":
    case "active":
      return "PAUSED"; // Create as PAUSED, user activates via Meta or future flow
    case "paused":
      return "PAUSED";
    default:
      return "PAUSED";
  }
}

/** Build a sync plan from current DB state */
export async function buildPlan(
  db: SupabaseClient,
  options?: { adSetId?: string }
): Promise<SyncPlan> {
  const plan: SyncPlan = {
    creates: [],
    pauses: [],
    unpauses: [],
    updates: [],
    inSync: [],
  };

  // --- Campaigns ---
  const { data: campaigns, error: cErr } = await db
    .from("campaign")
    .select("*");
  if (cErr) throw new Error(`Failed to load campaigns: ${cErr.message}`);

  for (const c of (campaigns || []) as CampaignRow[]) {
    if (!c.meta_campaign_id && c.desired_status !== "draft") {
      // Needs creating on Meta
      plan.creates.push({
        type: "create",
        entity: "campaign",
        id: c.id,
        name: c.name,
        data: {
          name: c.name,
          objective: c.objective,
          status: toMetaStatus(c.desired_status),
        },
      });
    } else if (c.meta_campaign_id) {
      const metaTarget =
        c.desired_status === "paused" ? "PAUSED" : "ACTIVE";
      const currentMeta = c.meta_status?.toUpperCase();
      if (currentMeta !== metaTarget) {
        if (metaTarget === "PAUSED") {
          plan.pauses.push({
            type: "pause",
            entity: "campaign",
            id: c.id,
            name: c.name,
            data: { metaCampaignId: c.meta_campaign_id },
          });
        } else {
          plan.unpauses.push({
            type: "unpause",
            entity: "campaign",
            id: c.id,
            name: c.name,
            data: { metaCampaignId: c.meta_campaign_id },
          });
        }
      } else {
        plan.inSync.push({ entity: "campaign", name: c.name });
      }
    }
  }

  // --- Ad Sets ---
  let adSetQuery = db
    .from("ad_set")
    .select("*, campaign:campaign_id(*)");
  if (options?.adSetId) {
    adSetQuery = adSetQuery.eq("id", options.adSetId);
  }
  const { data: adSets, error: asErr } = await adSetQuery;
  if (asErr) throw new Error(`Failed to load ad sets: ${asErr.message}`);

  for (const as_ of (adSets || []) as AdSetRow[]) {
    if (!as_.meta_ad_set_id && as_.desired_status !== "paused" && as_.campaign_id) {
      // Build Meta targeting object
      const targeting: Record<string, unknown> = {};
      if (as_.age_min) targeting.age_min = as_.age_min;
      if (as_.age_max) targeting.age_max = as_.age_max;
      if (as_.genders?.length) targeting.genders = as_.genders;
      if (as_.geo_locations) targeting.geo_locations = as_.geo_locations;
      if (as_.targeting) targeting.flexible_spec = [as_.targeting];

      plan.creates.push({
        type: "create",
        entity: "ad_set",
        id: as_.id,
        name: as_.name,
        campaignId: as_.campaign_id,
        data: {
          name: as_.name,
          daily_budget: as_.daily_budget_cents,
          targeting,
          start_time: as_.start_date,
          end_time: as_.end_date,
          placements: as_.placements,
          campaignMetaId: as_.campaign?.meta_campaign_id,
        },
      });
    } else if (as_.meta_ad_set_id) {
      const metaTarget =
        as_.desired_status === "paused" ? "PAUSED" : "ACTIVE";
      const currentMeta = as_.meta_status?.toUpperCase();
      if (currentMeta !== metaTarget) {
        if (metaTarget === "PAUSED") {
          plan.pauses.push({
            type: "pause",
            entity: "ad_set",
            id: as_.id,
            name: as_.name,
            data: { metaAdSetId: as_.meta_ad_set_id },
          });
        } else {
          plan.unpauses.push({
            type: "unpause",
            entity: "ad_set",
            id: as_.id,
            name: as_.name,
            data: { metaAdSetId: as_.meta_ad_set_id },
          });
        }
      } else {
        plan.inSync.push({ entity: "ad_set", name: as_.name });
      }
    }
  }

  // --- Ads ---
  let adQuery = db
    .from("ad")
    .select("*, ad_set:ad_set_id(*, campaign:campaign_id(*)), body_copy:body_copy_id(text, headline)");
  if (options?.adSetId) {
    adQuery = adQuery.eq("ad_set_id", options.adSetId);
  }
  const { data: ads, error: adErr } = await adQuery;
  if (adErr) throw new Error(`Failed to load ads: ${adErr.message}`);

  for (const ad of (ads || []) as AdRow[]) {
    // Only sync ads that are approved and have all required fields
    if (
      !ad.meta_ad_id &&
      ad.desired_status === "approved" &&
      ad.composited_image_path &&
      ad.ad_set_id &&
      ad.ad_set?.meta_ad_set_id
    ) {
      plan.creates.push({
        type: "create",
        entity: "ad",
        id: ad.id,
        name: ad.composited_image_path.split("/").pop() || ad.id,
        adSetId: ad.ad_set_id,
        data: {
          composited_image_path: ad.composited_image_path,
          body_text: ad.body_copy?.text || "",
          headline: ad.body_copy?.headline || "",
          metaAdSetId: ad.ad_set?.meta_ad_set_id,
        },
      });
    } else if (ad.meta_ad_id) {
      const metaTarget =
        ad.desired_status === "paused" ? "PAUSED" : "ACTIVE";
      const currentMeta = ad.meta_status?.toUpperCase();
      if (currentMeta !== metaTarget) {
        if (metaTarget === "PAUSED") {
          plan.pauses.push({
            type: "pause",
            entity: "ad",
            id: ad.id,
            name: ad.composited_image_path?.split("/").pop() || ad.id,
            data: { metaAdId: ad.meta_ad_id },
          });
        } else {
          plan.unpauses.push({
            type: "unpause",
            entity: "ad",
            id: ad.id,
            name: ad.composited_image_path?.split("/").pop() || ad.id,
            data: { metaAdId: ad.meta_ad_id },
          });
        }
      } else {
        plan.inSync.push({
          entity: "ad",
          name: ad.composited_image_path?.split("/").pop() || ad.id,
        });
      }
    }
  }

  return plan;
}

/** Format plan as human-readable output */
export function formatPlan(plan: SyncPlan): string {
  const lines: string[] = [];

  const allActions = [
    ...plan.creates,
    ...plan.pauses,
    ...plan.unpauses,
    ...plan.updates,
  ];

  if (allActions.length === 0 && plan.inSync.length === 0) {
    return "Nothing to sync — no campaigns, ad sets, or ads found.";
  }

  if (allActions.length > 0) {
    lines.push("Plan:");
    for (const a of plan.creates) {
      lines.push(`  + CREATE ${a.entity} "${a.name}"`);
      if (a.entity === "ad_set" && a.data.targeting) {
        const t = a.data.targeting as Record<string, unknown>;
        const parts: string[] = [];
        if (t.geo_locations)
          parts.push(JSON.stringify(t.geo_locations));
        if (t.age_min || t.age_max)
          parts.push(`age ${t.age_min || "?"}-${t.age_max || "?"}`);
        if (a.data.daily_budget)
          parts.push(`${(a.data.daily_budget as number) / 100}/day`);
        if (parts.length) lines.push(`    targeting: ${parts.join(", ")}`);
      }
    }
    for (const a of plan.pauses) {
      lines.push(`  ~ PAUSE ${a.entity} "${a.name}" (currently active)`);
    }
    for (const a of plan.unpauses) {
      lines.push(`  ~ UNPAUSE ${a.entity} "${a.name}" (currently paused)`);
    }
    for (const a of plan.updates) {
      lines.push(`  ~ UPDATE ${a.entity} "${a.name}"`);
    }
  } else {
    lines.push("No changes needed.");
  }

  if (plan.inSync.length > 0) {
    lines.push("");
    lines.push("No changes:");
    for (const s of plan.inSync) {
      lines.push(`  = ${s.entity} "${s.name}" (in sync)`);
    }
  }

  return lines.join("\n");
}
