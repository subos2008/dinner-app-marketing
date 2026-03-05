#!/bin/bash
cd "$(dirname "$0")/.."
source .env
[ -f .env.local ] && source .env.local
export SUPABASE_URL SUPABASE_ANON_KEY PORT
export SUPABASE_SERVICE_ROLE_KEY

# Kill any existing server on the same port
APP_PORT="${PORT:-8642}"
existing=$(lsof -ti :"$APP_PORT" 2>/dev/null)
if [ -n "$existing" ]; then
  echo "Killing existing server on port $APP_PORT (PID: $existing)"
  kill $existing 2>/dev/null
  sleep 0.5
fi

exec node --watch app/server.js
