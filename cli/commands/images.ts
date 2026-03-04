import { supabase } from "../client.ts";
import { parseFlags } from "../main.ts";

export async function images(action: string, args: string[]) {
  switch (action) {
    case "list":
      return await list(args[0]);
    case "add":
      return await add(args[0], args.slice(1));
    default:
      console.error(`images: unknown action "${action}". Use: list, add`);
      Deno.exit(1);
  }
}

async function list(segment: string) {
  if (!segment) {
    console.error("images list: missing <segment>");
    Deno.exit(1);
  }

  const { data, error } = await supabase
    .from("creative_image")
    .select("filename, concept, ad_variant, format, aspect_ratio, type, parent, prompt, style, visual_type, storage_path, created_at")
    .eq("segment_slug", segment)
    .order("created_at", { ascending: true });

  if (error) throw new Error(error.message);

  console.log(JSON.stringify(data || [], null, 2));
}

async function add(segment: string, rest: string[]) {
  if (!segment) {
    console.error("images add: missing <segment>");
    Deno.exit(1);
  }

  const flags = parseFlags(rest);
  if (!flags.filename) {
    console.error("images add: missing --filename");
    Deno.exit(1);
  }

  const storagePath = `${segment}/${flags.filename}`;

  const row: Record<string, unknown> = {
    segment_slug: segment,
    filename: flags.filename,
    storage_path: storagePath,
  };

  // Optional fields
  if (flags.concept) row.concept = flags.concept;
  if (flags.format) row.format = flags.format;
  if (flags["aspect-ratio"]) row.aspect_ratio = flags["aspect-ratio"];
  if (flags.type) row.type = flags.type;
  if (flags.parent) row.parent = flags.parent;
  if (flags.prompt) row.prompt = flags.prompt;
  if (flags.style) row.style = flags.style;
  if (flags["visual-type"]) row.visual_type = flags["visual-type"];
  if (flags["ad-variant"]) row.ad_variant = flags["ad-variant"];

  const { data, error } = await supabase
    .from("creative_image")
    .upsert(row, { onConflict: "segment_slug,filename" })
    .select()
    .single();

  if (error) throw new Error(error.message);

  console.log(JSON.stringify(data, null, 2));
}
