/**
 * Apply engine: executes a sync plan against Meta's API.
 * Processes in dependency order: campaigns → ad sets → ads.
 * Updates Supabase with Meta IDs and status after each action.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { MetaApiClient } from "./meta-api.ts";
import type { SyncAction, SyncPlan, SyncResult } from "./types.ts";

/** Download image bytes from Supabase Storage */
async function downloadImage(
  supabaseUrl: string,
  storagePath: string
): Promise<Uint8Array> {
  const url = `${supabaseUrl}/storage/v1/object/public/creative/${storagePath}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to download image ${storagePath}: ${res.status}`);
  }
  return new Uint8Array(await res.arrayBuffer());
}

/** Log a sync action result to the sync_log table */
async function logSync(
  db: SupabaseClient,
  result: SyncResult
): Promise<void> {
  await db.from("sync_log").insert({
    entity_type: result.action.entity,
    entity_id: result.action.id,
    action: result.action.type,
    status: result.status,
    meta_id: result.metaId || null,
    error: result.error || null,
  });
}

/** Execute a single sync action */
async function executeAction(
  action: SyncAction,
  meta: MetaApiClient,
  db: SupabaseClient,
  supabaseUrl: string,
  pageId: string
): Promise<SyncResult> {
  try {
    switch (action.entity) {
      case "campaign": {
        if (action.type === "create") {
          const res = await meta.createCampaign({
            name: action.data.name as string,
            objective: action.data.objective as string,
            status: action.data.status as string,
          });
          // Update Supabase with Meta campaign ID
          await db
            .from("campaign")
            .update({
              meta_campaign_id: res.id,
              meta_status: (action.data.status as string).toLowerCase(),
            })
            .eq("id", action.id);
          return { action, status: "success", metaId: res.id };
        }
        if (action.type === "pause") {
          await meta.updateCampaignStatus(
            action.data.metaCampaignId as string,
            "PAUSED"
          );
          await db
            .from("campaign")
            .update({ meta_status: "paused" })
            .eq("id", action.id);
          return {
            action,
            status: "success",
            metaId: action.data.metaCampaignId as string,
          };
        }
        if (action.type === "unpause") {
          await meta.updateCampaignStatus(
            action.data.metaCampaignId as string,
            "ACTIVE"
          );
          await db
            .from("campaign")
            .update({ meta_status: "active" })
            .eq("id", action.id);
          return {
            action,
            status: "success",
            metaId: action.data.metaCampaignId as string,
          };
        }
        break;
      }

      case "ad_set": {
        if (action.type === "create") {
          // Resolve campaign Meta ID — may have just been created
          let campaignMetaId = action.data.campaignMetaId as string | undefined;
          if (!campaignMetaId && action.campaignId) {
            const { data: campaign } = await db
              .from("campaign")
              .select("meta_campaign_id")
              .eq("id", action.campaignId)
              .single();
            campaignMetaId = campaign?.meta_campaign_id;
          }
          if (!campaignMetaId) {
            throw new Error(
              `Campaign for ad set "${action.name}" has no Meta ID — create the campaign first`
            );
          }

          const targeting = action.data.targeting as Record<string, unknown>;

          const res = await meta.createAdSet({
            name: action.data.name as string,
            campaign_id: campaignMetaId,
            daily_budget: action.data.daily_budget as number,
            billing_event: "IMPRESSIONS",
            optimization_goal: "LINK_CLICKS",
            status: "PAUSED",
            targeting,
            start_time: action.data.start_time as string | undefined,
            end_time: action.data.end_time as string | undefined,
          });

          await db
            .from("ad_set")
            .update({ meta_ad_set_id: res.id, meta_status: "paused" })
            .eq("id", action.id);
          return { action, status: "success", metaId: res.id };
        }
        if (action.type === "pause") {
          await meta.updateAdSetStatus(
            action.data.metaAdSetId as string,
            "PAUSED"
          );
          await db
            .from("ad_set")
            .update({ meta_status: "paused" })
            .eq("id", action.id);
          return {
            action,
            status: "success",
            metaId: action.data.metaAdSetId as string,
          };
        }
        if (action.type === "unpause") {
          await meta.updateAdSetStatus(
            action.data.metaAdSetId as string,
            "ACTIVE"
          );
          await db
            .from("ad_set")
            .update({ meta_status: "active" })
            .eq("id", action.id);
          return {
            action,
            status: "success",
            metaId: action.data.metaAdSetId as string,
          };
        }
        break;
      }

      case "ad": {
        if (action.type === "create") {
          // Resolve ad set Meta ID — may have just been created
          let metaAdSetId = action.data.metaAdSetId as string | undefined;
          if (!metaAdSetId && action.adSetId) {
            const { data: adSet } = await db
              .from("ad_set")
              .select("meta_ad_set_id")
              .eq("id", action.adSetId)
              .single();
            metaAdSetId = adSet?.meta_ad_set_id;
          }
          if (!metaAdSetId) {
            throw new Error(
              `Ad set for ad "${action.name}" has no Meta ID — create the ad set first`
            );
          }

          // Download composited image from Supabase Storage
          const imagePath = action.data.composited_image_path as string;
          const imageBytes = await downloadImage(supabaseUrl, imagePath);
          const filename = imagePath.split("/").pop() || "ad.png";

          // Upload to Meta
          const imageHash = await meta.uploadImage(imageBytes, filename);

          // Create ad with creative
          const res = await meta.createAd({
            name: action.name,
            adset_id: metaAdSetId,
            status: "PAUSED",
            creative: {
              image_hash: imageHash,
              message: action.data.body_text as string,
              name: action.data.headline as string,
              page_id: pageId,
            },
          });

          await db
            .from("ad")
            .update({ meta_ad_id: res.id, meta_status: "paused" })
            .eq("id", action.id);
          return { action, status: "success", metaId: res.id };
        }
        if (action.type === "pause") {
          await meta.updateAdStatus(
            action.data.metaAdId as string,
            "PAUSED"
          );
          await db
            .from("ad")
            .update({ meta_status: "paused" })
            .eq("id", action.id);
          return {
            action,
            status: "success",
            metaId: action.data.metaAdId as string,
          };
        }
        if (action.type === "unpause") {
          await meta.updateAdStatus(
            action.data.metaAdId as string,
            "ACTIVE"
          );
          await db
            .from("ad")
            .update({ meta_status: "active" })
            .eq("id", action.id);
          return {
            action,
            status: "success",
            metaId: action.data.metaAdId as string,
          };
        }
        break;
      }
    }

    return { action, status: "error", error: `Unhandled: ${action.type} ${action.entity}` };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { action, status: "error", error: message };
  }
}

/** Apply a full sync plan in dependency order */
export async function applyPlan(
  plan: SyncPlan,
  meta: MetaApiClient,
  db: SupabaseClient,
  supabaseUrl: string,
  pageId: string
): Promise<SyncResult[]> {
  const results: SyncResult[] = [];

  // Order all actions: campaigns first, then ad sets, then ads
  const ordered: SyncAction[] = [
    ...plan.creates.filter((a) => a.entity === "campaign"),
    ...plan.creates.filter((a) => a.entity === "ad_set"),
    ...plan.creates.filter((a) => a.entity === "ad"),
    ...plan.pauses,
    ...plan.unpauses,
    ...plan.updates,
  ];

  for (const action of ordered) {
    const result = await executeAction(action, meta, db, supabaseUrl, pageId);
    try { await logSync(db, result); } catch (logErr) {
      console.error(`  Warning: failed to write sync log: ${logErr instanceof Error ? logErr.message : logErr}`);
    }
    results.push(result);

    if (result.status === "error") {
      console.error(`  ERROR: ${action.entity} "${action.name}": ${result.error}`);
    } else {
      console.error(
        `  OK: ${action.type} ${action.entity} "${action.name}" → ${result.metaId}`
      );
    }
  }

  return results;
}
