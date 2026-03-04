#!/usr/bin/env node

/**
 * Sync filesystem data to Supabase.
 *
 * Thin wrapper around the Deno CLI tool.
 * See cli/commands/sync.ts for the actual implementation.
 *
 * Usage:
 *   node app/sync.js              # sync everything
 *   node app/sync.js --data-only  # skip image upload
 *   node app/sync.js --images-only # only upload images
 */

const { execSync } = require('child_process');
const args = process.argv.slice(2).join(' ');

try {
  execSync(`deno task cli sync ${args}`, { stdio: 'inherit', cwd: require('path').join(__dirname, '..') });
} catch (err) {
  process.exit(err.status || 1);
}
