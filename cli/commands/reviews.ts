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
    .select("filename, status, note, updated_at")
    .eq("segment_slug", segment);

  if (error) throw new Error(error.message);

  // Reshape to { [filename]: { status, note, updatedAt } }
  const result: Record<string, { status: string; note: string; updatedAt: string }> = {};
  for (const row of data || []) {
    result[row.filename] = {
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

  const row: Record<string, unknown> = {
    segment_slug: segment,
    filename: filename,
    status: flags.status,
    updated_at: new Date().toISOString(),
  };
  if (flags.note !== undefined) {
    row.note = flags.note;
  }

  const { data, error } = await supabase
    .from("image_review")
    .upsert(row, { onConflict: "segment_slug,filename" })
    .select("filename, status, note, updated_at")
    .single();

  if (error) throw new Error(error.message);

  console.log(JSON.stringify({
    status: data.status,
    note: data.note || "",
    updatedAt: data.updated_at,
  }, null, 2));
}
