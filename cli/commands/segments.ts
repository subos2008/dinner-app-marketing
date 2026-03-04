import { supabase } from "../client.ts";

export async function segments(action: string, _args: string[]) {
  switch (action) {
    case "list":
      return await list();
    default:
      console.error(`segments: unknown action "${action}". Use: list`);
      Deno.exit(1);
  }
}

async function list() {
  const { data, error } = await supabase
    .from("segment")
    .select("slug, name, segment_type")
    .order("slug");

  if (error) throw new Error(error.message);

  console.log(JSON.stringify(data || [], null, 2));
}
