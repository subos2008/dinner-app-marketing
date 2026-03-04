import { supabase } from "../client.ts";
import { parseFlags } from "../main.ts";

export async function tags(action: string, args: string[]) {
  switch (action) {
    case "list":
      return await list();
    case "create":
      return await create(args);
    case "delete":
      return await remove(args[0]);
    default:
      console.error(`tags: unknown action "${action}". Use: list, create, delete`);
      Deno.exit(1);
  }
}

async function list() {
  const { data, error } = await supabase
    .from("tag")
    .select("*")
    .order("name");

  if (error) throw new Error(error.message);

  console.log(JSON.stringify(data || [], null, 2));
}

async function create(args: string[]) {
  const flags = parseFlags(args);
  if (!flags.name) {
    console.error("tags create: missing --name");
    Deno.exit(1);
  }

  const { data, error } = await supabase
    .from("tag")
    .insert({ name: flags.name })
    .select()
    .single();

  if (error) throw new Error(error.message);

  console.log(JSON.stringify(data, null, 2));
}

async function remove(id: string) {
  if (!id) {
    console.error("tags delete: missing <id>");
    Deno.exit(1);
  }

  const { error } = await supabase
    .from("tag")
    .delete()
    .eq("id", id);

  if (error) throw new Error(error.message);

  console.log(JSON.stringify({ deleted: id }));
}
