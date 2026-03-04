# Generation Endpoint Hardening

## Command Injection (Critical)

The `/api/ads/:id/generate` endpoint builds a shell command string containing caption text and passes it to `execSync`. Malicious caption text could escape the string and execute arbitrary commands.

**Current code:** Builds a prompt string with caption text and passes it via `claude -p ${JSON.stringify(prompt)}`. `JSON.stringify` provides basic escaping but the string still goes through shell interpretation.

**Fix options:**
1. **Write prompt to a temp file, pass via stdin:** `execFile('claude', ['-p', '-'], { input: promptText })` — avoids shell entirely
2. **Use `execFile` instead of `execSync`:** Pass args as an array, no shell interpretation
3. **Sanitize caption text:** Strip/escape shell metacharacters before building the prompt

Option 2 is simplest and also fixes the event loop blocking issue (use `execFile` with callback or `child_process.spawn`).

## execSync Blocks Event Loop (Important)

`execSync` blocks the entire Node.js event loop during generation (up to 120s timeout). All other requests stall.

**Fix:** Switch to async `execFile` or `spawn`. Return a 202 Accepted with a job ID, let the client poll or rely on SSE for completion.

## Sync Doesn't Register Images in DB (Important)

`cli/commands/sync.ts` uploads images to Storage but doesn't create `base_image` rows in the database. Images appear in Storage but not in the app.

**Fix:** After uploading, upsert `base_image` rows with filename + storage_path.

## Service Role Key in Server Environment (Important)

`start.sh` sources `.env.local` which contains `SUPABASE_SERVICE_ROLE_KEY`. The server loads this into its process environment. Only the generate endpoint needs it (for Storage uploads).

**Fix options:**
1. Only read the key when needed (lazy load from file)
2. Move generation to a separate worker process that has the key
3. Accept the risk — this is an internal tool, not public-facing

Option 3 is fine for now given the app is a local dev tool.
