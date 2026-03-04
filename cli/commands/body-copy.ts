import { supabase } from "../client.ts";
import { parseFlags } from "../main.ts";

export async function bodyCopy(action: string, args: string[]) {
  switch (action) {
    case "list":
      return await list();
    case "add":
      return await add(args);
    case "delete":
      return await remove(args[0]);
    default:
      console.error(`body-copy: unknown action "${action}". Use: list, add, delete`);
      Deno.exit(1);
  }
}

async function list() {
  const { data, error } = await supabase
    .from("body_copy")
    .select("*, body_copy_tag(tag:tag_id(id, name))")
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);

  const result = (data || []).map((bc: any) => ({
    ...bc,
    tags: (bc.body_copy_tag || []).map((t: any) => t.tag).filter(Boolean),
    body_copy_tag: undefined,
  }));

  console.log(JSON.stringify(result, null, 2));
}

async function add(args: string[]) {
  const flags = parseFlags(args);
  if (!flags.text) {
    console.error("body-copy add: missing --text");
    Deno.exit(1);
  }

  const row: Record<string, unknown> = {
    text: flags.text,
  };

  if (flags.headline) row.headline = flags.headline;

  const { data, error } = await supabase
    .from("body_copy")
    .insert(row)
    .select()
    .single();

  if (error) throw new Error(error.message);

  console.log(JSON.stringify(data, null, 2));
}

async function remove(id: string) {
  if (!id) {
    console.error("body-copy delete: missing <id>");
    Deno.exit(1);
  }

  const { error } = await supabase
    .from("body_copy")
    .delete()
    .eq("id", id);

  if (error) throw new Error(error.message);

  console.log(JSON.stringify({ deleted: id }));
}
