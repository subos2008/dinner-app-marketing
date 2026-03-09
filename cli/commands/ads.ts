import { supabase } from "../client.ts";
import { parseFlags } from "../main.ts";

export async function ads(action: string, args: string[]) {
  switch (action) {
    case "list":
      return await list();
    case "create":
      return await create(args);
    case "update":
      return await update(args[0], args.slice(1));
    case "delete":
      return await remove(args[0]);
    default:
      console.error(`ads: unknown action "${action}". Use: list, create, update, delete`);
      Deno.exit(1);
  }
}

async function list() {
  const { data, error } = await supabase
    .from("image_creative")
    .select("*, base_image:base_image_id(*), image_creative_caption(caption_id, caption:caption_id(*)), image_creative_segment(segment_id, segment:segment_id(id, name))")
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);

  console.log(JSON.stringify(data || [], null, 2));
}

async function create(args: string[]) {
  const flags = parseFlags(args);
  if (!flags.image) {
    console.error("ads create: missing --image");
    Deno.exit(1);
  }

  const row: Record<string, unknown> = {
    base_image_id: flags.image,
  };

  const { data, error } = await supabase
    .from("image_creative")
    .insert(row)
    .select()
    .single();

  if (error) throw new Error(error.message);

  console.log(JSON.stringify(data, null, 2));
}

async function update(id: string, rest: string[]) {
  if (!id) {
    console.error("ads update: missing <id>");
    Deno.exit(1);
  }

  const flags = parseFlags(rest);
  const row: Record<string, unknown> = {};

  if (flags.status) row.status = flags.status;
  if (flags.feedback !== undefined) row.feedback = flags.feedback;

  if (Object.keys(row).length === 0) {
    console.error("ads update: provide --status or --feedback");
    Deno.exit(1);
  }

  const { data, error } = await supabase
    .from("image_creative")
    .update(row)
    .eq("id", id)
    .select()
    .single();

  if (error) throw new Error(error.message);

  console.log(JSON.stringify(data, null, 2));
}

async function remove(id: string) {
  if (!id) {
    console.error("ads delete: missing <id>");
    Deno.exit(1);
  }

  const { error } = await supabase
    .from("image_creative")
    .delete()
    .eq("id", id);

  if (error) throw new Error(error.message);

  console.log(JSON.stringify({ deleted: id }));
}
