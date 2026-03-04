import { createClient, type SupabaseClient } from "@supabase/supabase-js";

function parseEnvFile(path: string): Record<string, string> {
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
      // Strip surrounding quotes
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      vars[key] = val;
    }
  } catch {
    // File doesn't exist — that's fine
  }
  return vars;
}

function loadEnv(): Record<string, string> {
  const env = parseEnvFile(".env");
  const local = parseEnvFile(".env.local");
  return { ...env, ...local };
}

const env = loadEnv();

const supabaseUrl = env.SUPABASE_URL;
const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) {
  console.error("Missing SUPABASE_URL in .env");
  Deno.exit(1);
}
if (!serviceRoleKey) {
  console.error("Missing SUPABASE_SERVICE_ROLE_KEY in .env.local");
  Deno.exit(1);
}

/** Supabase client using the `marketing` schema for data tables */
export const supabase: SupabaseClient = createClient(supabaseUrl, serviceRoleKey, {
  db: { schema: "marketing" },
  auth: { persistSession: false },
});

/** Supabase client using the default `public` schema (needed for Storage) */
export const storageClient: SupabaseClient = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
});
