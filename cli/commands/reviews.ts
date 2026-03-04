import { supabase } from "../client.ts";
import { parseFlags } from "../main.ts";

const VALID_STATUSES = ["approved", "rejected", "flagged", "liked"];

export async function reviews(action: string, args: string[]) {
  switch (action) {
    case "list":
      return await list(args[0]);
    case "set":
      return await set(args[0], args[1], args.slice(2));
    default:
      console.error(`reviews: unknown action "${action}". Use: list, set`);
      Deno.exit(1);
  }
}

async function list(segment: string) {
  if (!segment) {
    console.error("reviews list: missing <segment>");
    Deno.exit(1);
  }

  const { data, error } = await supabase
    .from("image_review")
    .select("status, note, updated_at, creative_image:creative_image_id(filename, segment_slug)")
    .eq("creative_image.segment_slug", segment);

  if (error) throw new Error(error.message);

  // Reshape to { [filename]: { status, note, updatedAt } }
  const result: Record<string, { status: string; note: string; updatedAt: string }> = {};
  for (const row of data || []) {
    const img = row.creative_image as unknown as { filename: string; segment_slug: string } | null;
    if (!img || img.segment_slug !== segment) continue;
    result[img.filename] = {
      status: row.status,
      note: row.note || "",
      updatedAt: row.updated_at,
    };
  }

  console.log(JSON.stringify(result, null, 2));
}

async function set(segment: string, filename: string, rest: string[]) {
  if (!segment || !filename) {
    console.error("reviews set: missing <segment> <filename>");
    Deno.exit(1);
  }

  const flags = parseFlags(rest);
  if (!flags.status) {
    console.error("reviews set: missing --status");
    Deno.exit(1);
  }
  if (!VALID_STATUSES.includes(flags.status)) {
    console.error(`reviews set: invalid status "${flags.status}". Valid: ${VALID_STATUSES.join(", ")}`);
    Deno.exit(1);
  }

  // Look up the creative_image row
  const { data: img, error: imgErr } = await supabase
    .from("creative_image")
    .select("id")
    .eq("segment_slug", segment)
    .eq("filename", filename)
    .single();

  if (imgErr || !img) {
    console.error(`reviews set: no image found for ${segment}/${filename}`);
    Deno.exit(1);
  }

  const row: Record<string, unknown> = {
    creative_image_id: img.id,
    status: flags.status,
    updated_at: new Date().toISOString(),
  };
  if (flags.note !== undefined) {
    row.note = flags.note;
  }

  const { data, error } = await supabase
    .from("image_review")
    .upsert(row, { onConflict: "creative_image_id" })
    .select("status, note, updated_at")
    .single();

  if (error) throw new Error(error.message);

  console.log(JSON.stringify({
    status: data.status,
    note: data.note || "",
    updatedAt: data.updated_at,
  }, null, 2));
}
