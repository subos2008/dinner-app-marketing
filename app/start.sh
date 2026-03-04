#!/bin/bash
cd "$(dirname "$0")/.."
source .env
exec node app/server.js
