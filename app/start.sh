#!/bin/bash
cd "$(dirname "$0")/.."
source .env
[ -f .env.local ] && source .env.local
export SUPABASE_URL SUPABASE_ANON_KEY PORT
export SUPABASE_SERVICE_ROLE_KEY
exec node --watch app/server.js
