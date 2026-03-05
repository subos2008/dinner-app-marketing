# Image Output Parsing

## Problem
4 cascading filesystem scan strategies for finding generated images. Fragile, fails when Nano Banana saves somewhere unexpected.

## Solution
Switch `claude -p` to `--output-format json`, parse the `result` field, extract the file path from Nano Banana's known output format.

## Changes

### `runClaude()` (both instances in server.js)
- Add `--output-format json` to args
- Parse stdout as JSON, return `result` field
- If JSON parse fails, fall back to raw stdout

### Image path extraction
- Parse Nano Banana's `📁 Image saved to:\n- /path/to/file.png` from the result text
- Remove all filesystem scanning code (/tmp scan, generated_imgs/ scan, temp dir scan, tmpPngsBefore snapshots)

### What stays the same
- Prompt content, `--allowedTools` args, upload-to-Storage logic, endpoint structure
