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
    .from("ad")
    .select("*, base_image:base_image_id(*), caption:caption_id(*), body_copy:body_copy_id(*), ad_set:ad_set_id(id, name)")
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

  if (flags.caption) row.caption_id = flags.caption;
  if (flags["body-copy"]) row.body_copy_id = flags["body-copy"];

  const { data, error } = await supabase
    .from("ad")
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
  if (!flags["desired-status"]) {
    console.error("ads update: missing --desired-status");
    Deno.exit(1);
  }

  const row: Record<string, unknown> = {
    desired_status: flags["desired-status"],
  };

  if (flags.feedback !== undefined) {
    row.feedback = flags.feedback;
  }

  const { data, error } = await supabase
    .from("ad")
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
    .from("ad")
    .delete()
    .eq("id", id);

  if (error) throw new Error(error.message);

  console.log(JSON.stringify({ deleted: id }));
}
