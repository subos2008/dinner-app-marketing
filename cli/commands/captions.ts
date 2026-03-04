import { supabase } from "../client.ts";
import { parseFlags } from "../main.ts";

export async function captions(action: string, args: string[]) {
  switch (action) {
    case "list":
      return await list();
    case "add":
      return await add(args);
    case "delete":
      return await remove(args[0]);
    default:
      console.error(`captions: unknown action "${action}". Use: list, add, delete`);
      Deno.exit(1);
  }
}

async function list() {
  const { data, error } = await supabase
    .from("caption")
    .select("*, caption_tag(tag:tag_id(id, name))")
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);

  const result = (data || []).map((c: any) => ({
    ...c,
    tags: (c.caption_tag || []).map((t: any) => t.tag).filter(Boolean),
    caption_tag: undefined,
  }));

  console.log(JSON.stringify(result, null, 2));
}

async function add(args: string[]) {
  const flags = parseFlags(args);
  if (!flags.text) {
    console.error("captions add: missing --text");
    Deno.exit(1);
  }

  const { data, error } = await supabase
    .from("caption")
    .insert({ text: flags.text })
    .select()
    .single();

  if (error) throw new Error(error.message);

  console.log(JSON.stringify(data, null, 2));
}

async function remove(id: string) {
  if (!id) {
    console.error("captions delete: missing <id>");
    Deno.exit(1);
  }

  const { error } = await supabase
    .from("caption")
    .delete()
    .eq("id", id);

  if (error) throw new Error(error.message);

  console.log(JSON.stringify({ deleted: id }));
}
