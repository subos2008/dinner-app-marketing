#!/bin/bash
cd "$(dirname "$0")/.."
source .env
[ -f .env.local ] && source .env.local
exec node --watch app/server.js
