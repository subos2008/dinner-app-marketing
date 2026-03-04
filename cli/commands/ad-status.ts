import { supabase } from "../client.ts";
import { parseFlags } from "../main.ts";

const VALID_STATUSES = ["unreviewed", "feedback", "approved", "live"];

export async function adStatus(action: string, args: string[]) {
  switch (action) {
    case "list":
      return await list(args[0]);
    case "get":
      return await get(args[0], args[1]);
    case "set":
      return await set(args[0], args[1], args.slice(2));
    default:
      console.error(`ad-status: unknown action "${action}". Use: list, get, set`);
      Deno.exit(1);
  }
}

async function list(segment: string) {
  if (!segment) {
    console.error("ad-status list: missing <segment>");
    Deno.exit(1);
  }

  const { data, error } = await supabase
    .from("ad_campaign_status")
    .select("ad_id, status, feedback, updated_at")
    .eq("segment_slug", segment);

  if (error) throw new Error(error.message);

  // Reshape to { [ad_id]: { status, feedback, updatedAt } }
  const result: Record<string, { status: string; feedback: string; updatedAt: string }> = {};
  for (const row of data || []) {
    result[row.ad_id] = {
      status: row.status,
      feedback: row.feedback || "",
      updatedAt: row.updated_at,
    };
  }

  console.log(JSON.stringify(result, null, 2));
}

async function get(segment: string, adId: string) {
  if (!segment || !adId) {
    console.error("ad-status get: missing <segment> <ad-id>");
    Deno.exit(1);
  }

  const { data, error } = await supabase
    .from("ad_campaign_status")
    .select("status, feedback, updated_at")
    .eq("segment_slug", segment)
    .eq("ad_id", adId)
    .single();

  if (error) throw new Error(error.message);

  console.log(JSON.stringify({
    status: data.status,
    feedback: data.feedback || "",
    updatedAt: data.updated_at,
  }, null, 2));
}

async function set(segment: string, adId: string, rest: string[]) {
  if (!segment || !adId) {
    console.error("ad-status set: missing <segment> <ad-id>");
    Deno.exit(1);
  }

  const flags = parseFlags(rest);
  if (!flags.status) {
    console.error("ad-status set: missing --status");
    Deno.exit(1);
  }
  if (!VALID_STATUSES.includes(flags.status)) {
    console.error(`ad-status set: invalid status "${flags.status}". Valid: ${VALID_STATUSES.join(", ")}`);
    Deno.exit(1);
  }

  const row: Record<string, unknown> = {
    segment_slug: segment,
    ad_id: adId,
    status: flags.status,
    updated_at: new Date().toISOString(),
  };
  if (flags.feedback !== undefined) {
    row.feedback = flags.feedback;
  }

  const { data, error } = await supabase
    .from("ad_campaign_status")
    .upsert(row, { onConflict: "segment_slug,ad_id" })
    .select("status, feedback, updated_at")
    .single();

  if (error) throw new Error(error.message);

  console.log(JSON.stringify({
    status: data.status,
    feedback: data.feedback || "",
    updatedAt: data.updated_at,
  }, null, 2));
}
