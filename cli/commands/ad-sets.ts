import { supabase } from "../client.ts";
import { parseFlags } from "../main.ts";

export async function adSets(action: string, args: string[]) {
  switch (action) {
    case "list":
      return await list();
    case "create":
      return await create(args);
    case "update":
      return await update(args);
    default:
      console.error(`ad-sets: unknown action "${action}". Use: list, create, update`);
      Deno.exit(1);
  }
}

async function list() {
  const { data, error } = await supabase
    .from("ad_set")
    .select("*, campaign:campaign_id(id, name)")
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);

  console.log(JSON.stringify(data || [], null, 2));
}

async function create(args: string[]) {
  const flags = parseFlags(args);
  if (!flags.name) {
    console.error("ad-sets create: missing --name");
    Deno.exit(1);
  }

  const row: Record<string, unknown> = { name: flags.name };
  if (flags.campaign) row.campaign_id = flags.campaign;
  if (flags.budget) row.daily_budget_cents = Math.round(parseFloat(flags.budget) * 100);
  if (flags.geo) row.geo_locations = JSON.parse(flags.geo);
  if (flags["age-min"]) row.age_min = parseInt(flags["age-min"]);
  if (flags["age-max"]) row.age_max = parseInt(flags["age-max"]);
  if (flags.genders) row.genders = JSON.parse(flags.genders);
  if (flags.placements) row.placements = JSON.parse(flags.placements);

  const { data, error } = await supabase
    .from("ad_set")
    .insert(row)
    .select()
    .single();

  if (error) throw new Error(error.message);

  console.log(JSON.stringify(data, null, 2));
}

async function update(args: string[]) {
  const [id, ...rest] = args;
  if (!id) {
    console.error("ad-sets update: missing <id>");
    Deno.exit(1);
  }

  const flags = parseFlags(rest);
  const row: Record<string, unknown> = {};

  if (flags.name) row.name = flags.name;
  if (flags.campaign) row.campaign_id = flags.campaign;
  if (flags.budget) row.daily_budget_cents = Math.round(parseFloat(flags.budget) * 100);
  if (flags.geo) row.geo_locations = JSON.parse(flags.geo);
  if (flags["age-min"]) row.age_min = parseInt(flags["age-min"]);
  if (flags["age-max"]) row.age_max = parseInt(flags["age-max"]);
  if (flags.genders) row.genders = JSON.parse(flags.genders);
  if (flags.placements) row.placements = JSON.parse(flags.placements);
  if (flags["desired-status"]) row.desired_status = flags["desired-status"];

  if (Object.keys(row).length === 0) {
    console.error("ad-sets update: no flags provided");
    Deno.exit(1);
  }

  const { data, error } = await supabase
    .from("ad_set")
    .update(row)
    .eq("id", id)
    .select()
    .single();

  if (error) throw new Error(error.message);

  console.log(JSON.stringify(data, null, 2));
}
