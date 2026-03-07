import { supabase } from "../client.ts";
import { parseFlags } from "../main.ts";
import { buildPlan, formatPlan } from "../../lib/meta-sync/plan.ts";
import { applyPlan } from "../../lib/meta-sync/apply.ts";
import { MetaApiClient } from "../../lib/meta-sync/meta-api.ts";

function loadEnvFile(path: string): Record<string, string> {
  const vars: Record<string, string> = {};
  try {
    const text = Deno.readTextFileSync(path);
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      let val = trimmed.slice(eq + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      vars[key] = val;
    }
  } catch {
    // File doesn't exist
  }
  return vars;
}

function getMetaCredentials(): { token: string; accountId: string; pageId: string; supabaseUrl: string } {
  const env = { ...loadEnvFile(".env"), ...loadEnvFile(".env.local") };
  const token = env.META_ACCESS_TOKEN;
  const accountId = env.META_AD_ACCOUNT_ID;
  const pageId = env.META_PAGE_ID;
  const supabaseUrl = env.SUPABASE_URL;

  if (!token) {
    console.error("Missing META_ACCESS_TOKEN in .env.local");
    Deno.exit(1);
  }
  if (!accountId) {
    console.error("Missing META_AD_ACCOUNT_ID in .env.local");
    Deno.exit(1);
  }
  if (!pageId) {
    console.error("Missing META_PAGE_ID in .env.local");
    Deno.exit(1);
  }
  if (!supabaseUrl) {
    console.error("Missing SUPABASE_URL in .env");
    Deno.exit(1);
  }

  return { token, accountId, pageId, supabaseUrl };
}

export async function sync(args: string[]) {
  const [action, ...rest] = args;

  // Backwards compat: no action or --images-only means old image sync
  if (!action || action === "--images-only") {
    await syncImages();
    return;
  }

  switch (action) {
    case "plan":
      return await plan(rest);
    case "apply":
      return await apply(rest);
    default:
      console.error(`sync: unknown action "${action}". Use: plan, apply`);
      Deno.exit(1);
  }
}

async function plan(args: string[]) {
  const flags = parseFlags(args);
  const adSetId = flags["ad-set"];

  console.error("Building sync plan...\n");

  const syncPlan = await buildPlan(supabase, adSetId ? { adSetId } : undefined);
  console.log(formatPlan(syncPlan));
}

async function apply(args: string[]) {
  const flags = parseFlags(args);
  const adSetId = flags["ad-set"];

  const { token, accountId, pageId, supabaseUrl } = getMetaCredentials();
  const meta = new MetaApiClient(token, accountId);

  console.error("Building sync plan...\n");
  const syncPlan = await buildPlan(supabase, adSetId ? { adSetId } : undefined);

  const allActions = [
    ...syncPlan.creates,
    ...syncPlan.pauses,
    ...syncPlan.unpauses,
    ...syncPlan.updates,
  ];

  if (allActions.length === 0) {
    console.log("Nothing to apply — everything is in sync.");
    return;
  }

  console.log(formatPlan(syncPlan));
  console.error("\nApplying...\n");

  const results = await applyPlan(syncPlan, meta, supabase, supabaseUrl, pageId);

  const successes = results.filter((r) => r.status === "success").length;
  const errors = results.filter((r) => r.status === "error").length;

  console.error(`\nDone: ${successes} succeeded, ${errors} failed.`);

  if (errors > 0) {
    Deno.exit(1);
  }
}

/** Legacy image sync (preserved for backwards compat) */
async function syncImages() {
  const { storageClient } = await import("../client.ts");

  console.error("Syncing images to Supabase Storage...\n");

  let uploaded = 0;
  let skipped = 0;

  let segmentDirs: string[];
  try {
    segmentDirs = [];
    for await (const entry of Deno.readDir("segments")) {
      if (entry.isDirectory) {
        segmentDirs.push(entry.name);
      }
    }
  } catch {
    console.error("No segments/ directory found");
    return;
  }

  for (const segDir of segmentDirs) {
    const creativePath = `segments/${segDir}/creative`;

    let files: string[];
    try {
      files = [];
      for await (const entry of Deno.readDir(creativePath)) {
        if (entry.isFile && /\.(png|jpg|jpeg|webp)$/i.test(entry.name)) {
          files.push(entry.name);
        }
      }
    } catch {
      continue;
    }

    for (const filename of files) {
      const storagePath = `${segDir}/${filename}`;
      const filePath = `${creativePath}/${filename}`;

      const { data: existing } = await storageClient.storage
        .from("creative")
        .list(segDir, { search: filename, limit: 1 });

      if (existing && existing.some((f: { name: string }) => f.name === filename)) {
        skipped++;
        continue;
      }

      const fileBytes = await Deno.readFile(filePath);
      const ext = filename.split(".").pop()?.toLowerCase();
      const mimeTypes: Record<string, string> = {
        png: "image/png",
        jpg: "image/jpeg",
        jpeg: "image/jpeg",
        webp: "image/webp",
      };

      const { error } = await storageClient.storage
        .from("creative")
        .upload(storagePath, fileBytes, {
          contentType: mimeTypes[ext || ""] || "image/png",
          upsert: false,
        });

      if (error) {
        console.error(`  upload ${storagePath}: ${error.message}`);
      } else {
        uploaded++;
      }
    }
  }

  console.error(`Images: ${uploaded} uploaded, ${skipped} skipped (already exist)`);
  console.error("\nSync complete.");
}
