import { createClient } from 'npm:@supabase/supabase-js@2'

/** Per-request client with user's JWT (enforces RLS) */
export function createUserClient(req: Request) {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    {
      db: { schema: 'marketing' },
      global: { headers: { Authorization: req.headers.get('Authorization')! } },
    }
  )
}

/** Service role client for Storage uploads (bypasses RLS) */
export function createServiceClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )
}
