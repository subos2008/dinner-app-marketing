import { supabase } from "../client.ts";
import { parseFlags } from "../main.ts";

export async function campaigns(action: string, args: string[]) {
  switch (action) {
    case "list":
      return await list();
    case "create":
      return await create(args);
    default:
      console.error(`campaigns: unknown action "${action}". Use: list, create`);
      Deno.exit(1);
  }
}

async function list() {
  const { data, error } = await supabase
    .from("campaign")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);

  console.log(JSON.stringify(data || [], null, 2));
}

async function create(args: string[]) {
  const flags = parseFlags(args);
  if (!flags.name) {
    console.error("campaigns create: missing --name");
    Deno.exit(1);
  }

  const row: Record<string, unknown> = { name: flags.name };
  if (flags.objective) row.objective = flags.objective;

  const { data, error } = await supabase
    .from("campaign")
    .insert(row)
    .select()
    .single();

  if (error) throw new Error(error.message);

  console.log(JSON.stringify(data, null, 2));
}
