#!/bin/bash
cd "$(dirname "$0")/.."
source .env
[ -f .env.local ] && source .env.local
export SUPABASE_URL SUPABASE_ANON_KEY PORT
export SUPABASE_SERVICE_ROLE_KEY
export OTEL_SERVICE_NAME OTEL_EXPORTER_OTLP_ENDPOINT OTEL_EXPORTER_OTLP_PROTOCOL
export HONEYCOMB_API_KEY
export GOOGLE_AI_API_KEY

# Kill any existing server on the same port
APP_PORT="${PORT:-8642}"
existing=$(lsof -ti :"$APP_PORT" 2>/dev/null)
if [ -n "$existing" ]; then
  echo "Killing existing server on port $APP_PORT (PID: $existing)"
  kill $existing 2>/dev/null
  sleep 0.5
fi

exec node --watch --require ./app/tracing.js app/server.js
