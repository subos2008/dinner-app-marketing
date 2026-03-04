import { supabase } from "../client.ts";
import { parseFlags } from "../main.ts";

export async function images(action: string, args: string[]) {
  switch (action) {
    case "list":
      return await list();
    case "add":
      return await add(args);
    default:
      console.error(`images: unknown action "${action}". Use: list, add`);
      Deno.exit(1);
  }
}

async function list() {
  const { data, error } = await supabase
    .from("base_image")
    .select("*, base_image_tag(tag:tag_id(id, name))")
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);

  const result = (data || []).map((img: any) => ({
    ...img,
    tags: (img.base_image_tag || []).map((t: any) => t.tag).filter(Boolean),
    base_image_tag: undefined,
  }));

  console.log(JSON.stringify(result, null, 2));
}

async function add(args: string[]) {
  const flags = parseFlags(args);
  if (!flags.filename) {
    console.error("images add: missing --filename");
    Deno.exit(1);
  }
  if (!flags["storage-path"]) {
    console.error("images add: missing --storage-path");
    Deno.exit(1);
  }

  const row: Record<string, unknown> = {
    filename: flags.filename,
    storage_path: flags["storage-path"],
  };

  if (flags.prompt) row.prompt = flags.prompt;

  const { data, error } = await supabase
    .from("base_image")
    .insert(row)
    .select()
    .single();

  if (error) throw new Error(error.message);

  console.log(JSON.stringify(data, null, 2));
}
