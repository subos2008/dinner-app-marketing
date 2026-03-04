import { supabase } from "../client.ts";
import { parseFlags } from "../main.ts";

export async function adSets(action: string, args: string[]) {
  switch (action) {
    case "list":
      return await list();
    case "create":
      return await create(args);
    default:
      console.error(`ad-sets: unknown action "${action}". Use: list, create`);
      Deno.exit(1);
  }
}

async function list() {
  const { data, error } = await supabase
    .from("ad_set")
    .select("*")
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

  const { data, error } = await supabase
    .from("ad_set")
    .insert({ name: flags.name })
    .select()
    .single();

  if (error) throw new Error(error.message);

  console.log(JSON.stringify(data, null, 2));
}
