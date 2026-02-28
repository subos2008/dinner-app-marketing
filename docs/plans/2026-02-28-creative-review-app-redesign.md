# Creative Review App Redesign — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the static creative review app with a Node/Express server that supports multiple image variants per concept, approve/reject/annotate workflow, and a dedicated creative review page — all backed by the filesystem.

**Architecture:** Express server serves the HTML UI and a small REST API. API routes read markdown/manifests live (reusing build.js parse logic) and read/write `reviews.json` per segment. The UI has two views: the existing ad gallery (enhanced with image strips) and a new image-first creative page. No build step needed.

**Tech Stack:** Node.js, Express, vanilla HTML/CSS/JS (no framework — matches existing app)

---

### Task 1: Initialize package.json and install Express

**Files:**
- Create: `app/package.json`

**Step 1: Create package.json and install express**

```bash
cd /Users/ryan/dinner-matcher-marketing/app
npm init -y
npm install express
```

Edit `app/package.json` to set:
```json
{
  "name": "come-join-us-creative-review",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "start": "node server.js",
    "build": "node build.js"
  },
  "dependencies": {
    "express": "^5"
  }
}
```

**Step 2: Add `app/node_modules` to .gitignore**

Check if `.gitignore` exists at project root. Add `app/node_modules/` to it.

**Step 3: Commit**

```bash
git add app/package.json app/package-lock.json .gitignore
git commit -m "Add package.json with express dependency"
```

---

### Task 2: Create Express server with static serving and data API

**Files:**
- Create: `app/server.js`
- Read (don't modify): `app/build.js` — reuse all parse functions

**Step 1: Create `app/server.js`**

The server must:
1. Serve `app/index.html` at `/`
2. Serve segment images at `/segments/:slug/creative/:filename` by reading from `../segments/:slug/creative/:filename`
3. Expose `GET /api/data` that runs the build logic in-memory and returns JSON (extract parse functions from build.js into a shared module, or just require build.js and refactor it to export a `buildData()` function)

Refactor approach: modify `build.js` to export its `build()` function as a module (in addition to running when called directly). Then `server.js` requires it.

```js
// At the bottom of build.js, replace:
//   build();
// With:
if (require.main === module) {
  build();
} else {
  module.exports = { build: buildData };
}
```

Where `buildData()` returns the data object instead of writing to disk. The existing `build()` function calls `buildData()` and writes the file.

Then in `server.js`:

```js
const express = require('express');
const path = require('path');
const { buildData } = require('./build');

const app = express();
const PORT = process.env.PORT || 8642;
const ROOT = path.join(__dirname, '..');

// Serve index.html at root
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Serve segment creative images
app.use('/segments', express.static(path.join(ROOT, 'segments')));

// API: full data payload
app.get('/api/data', (req, res) => {
  try {
    const data = buildData();
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.listen(PORT, () => {
  console.log(`Creative review app: http://localhost:${PORT}`);
});
```

**Step 2: Refactor build.js to export buildData()**

Split `build()` into `buildData()` (returns data object) and `build()` (calls buildData + writes file). Export `buildData`. Keep CLI behavior when run directly.

**Step 3: Update index.html fetch path**

Change `fetch('data.json')` to `fetch('/api/data')`.

**Step 4: Test manually**

```bash
cd /Users/ryan/dinner-matcher-marketing/app
node server.js
```

Open `http://localhost:8642` — should see the existing review app working with live data. Images should load. No build step needed.

**Step 5: Commit**

```bash
git add app/server.js app/build.js app/index.html
git commit -m "Add Express server with live data API and static image serving"
```

---

### Task 3: Update manifest and build.js for image variants

**Files:**
- Modify: `app/build.js` — enhance `listCreativeImages()` and data model
- Modify: `segments/the-transplant/creative/manifest.json` — add type/parent fields

**Step 1: Update manifest.json with type and parent fields**

Add to each existing base image entry: `"type": "base", "parent": null`

Add new entries for the composited images:
```json
{
  "filename": "wednesday-night-problem-feed-1x1-copy.png",
  "concept": "The Wednesday Night Problem",
  "type": "composited",
  "parent": "wednesday-night-problem-feed-1x1.png",
  "copy_variant": "Variant B",
  "format": "feed",
  "aspect_ratio": "1:1"
}
```

Do this for all 6 composited images (`-copy.png` files).

**Step 2: Update build.js image discovery**

Enhance `listCreativeImages()` to return richer data. For each image file found in the creative folder:
- Check if it's in the manifest (get metadata)
- If not in manifest, infer concept from filename slug (e.g. `wednesday-night-problem` → `The Wednesday Night Problem`)
- Determine type: if filename contains `-copy` or `-v\d`, it's a variant; otherwise base
- Return array of image objects with: `filename`, `concept`, `format`, `type`, `parent`, `status` (from reviews.json if it exists)

Update the segment data to include this richer `images` array instead of just filenames.

**Step 3: Test**

```bash
cd /Users/ryan/dinner-matcher-marketing/app
node server.js
```

Hit `http://localhost:8642/api/data` — verify the transplant segment's images array has all 12 images with correct type/parent metadata.

**Step 4: Commit**

```bash
git add app/build.js segments/the-transplant/creative/manifest.json
git commit -m "Add image variant metadata to manifest and build pipeline"
```

---

### Task 4: Reviews API — read and write

**Files:**
- Modify: `app/server.js` — add review routes
- Modify: `app/build.js` — merge review status into image data

**Step 1: Add review routes to server.js**

```js
const fs = require('fs');

// Read reviews
app.get('/api/segments/:slug/reviews', (req, res) => {
  const reviewPath = path.join(ROOT, 'segments', req.params.slug, 'creative', 'reviews.json');
  try {
    const reviews = JSON.parse(fs.readFileSync(reviewPath, 'utf-8'));
    res.json(reviews);
  } catch {
    res.json({});
  }
});

// Write/update a review
app.use(express.json());
app.put('/api/segments/:slug/reviews/:filename', (req, res) => {
  const slug = req.params.slug;
  const filename = req.params.filename;
  const { status, note } = req.body;

  const reviewPath = path.join(ROOT, 'segments', slug, 'creative', 'reviews.json');
  let reviews = {};
  try {
    reviews = JSON.parse(fs.readFileSync(reviewPath, 'utf-8'));
  } catch {}

  reviews[filename] = { status: status || null, note: note || '', updatedAt: new Date().toISOString() };
  fs.writeFileSync(reviewPath, JSON.stringify(reviews, null, 2));
  res.json(reviews[filename]);
});
```

Validate `slug` and `filename` params to prevent path traversal (ensure no `..` or `/`).

**Step 2: Update buildData() to merge reviews**

In the segment building loop, read `reviews.json` if it exists. For each image, attach its review status and note from the reviews file.

**Step 3: Test manually**

```bash
# Write a review
curl -X PUT http://localhost:8642/api/segments/the-transplant/reviews/wednesday-night-problem-feed-1x1.png \
  -H 'Content-Type: application/json' \
  -d '{"status": "approved", "note": "Good mood"}'

# Read reviews
curl http://localhost:8642/api/segments/the-transplant/reviews
```

Verify `reviews.json` was created in the creative folder and contains the entry.

**Step 4: Commit**

```bash
git add app/server.js app/build.js
git commit -m "Add reviews API for approve/reject/annotate workflow"
```

---

### Task 5: UI — Image strip on ad cards

**Files:**
- Modify: `app/index.html` — update ad card rendering and add image strip styles

**Step 1: Add image strip CSS**

Add styles for:
- `.image-strip` — horizontal scrollable strip of thumbnails below/beside the main image
- `.image-strip-thumb` — individual thumbnail with border indicating status (green=approved, red=rejected, orange=flagged, none=unreviewed)
- `.image-strip-thumb.active` — currently selected/enlarged thumbnail
- `.image-type-badge` — small "base"/"composited" label on thumbnails

**Step 2: Update `findImage()` to `findImages()` (plural)**

Change the function to return ALL matching images for a concept+format, not just the first. Sort: bases first, then composited, then by version number.

**Step 3: Update `renderFeedAdCard()` and `renderStoryAdCard()`**

Replace the single image slot with:
1. Main image area (shows the currently selected image, larger)
2. Thumbnail strip below it showing all variants
3. Click a thumbnail to swap the main image
4. Each thumbnail shows a colored dot for review status

**Step 4: Add inline review controls**

When the main image is displayed, show beneath it:
- Three buttons: Approve / Reject / Flag
- A text input for annotation
- Current status badge
- These call `PUT /api/segments/:slug/reviews/:filename` on click

**Step 5: Test manually**

Open `http://localhost:8642`, navigate to The Transplant. Each ad card should show the image strip with base + composited variants. Click between them. Approve one, verify the dot updates and the review persists on page reload.

**Step 6: Commit**

```bash
git add app/index.html
git commit -m "Add image strip with review controls to ad cards"
```

---

### Task 6: UI — Creative review page

**Files:**
- Modify: `app/index.html` — add creative view and navigation

**Step 1: Add view navigation**

Add a tab bar or toggle in the topbar: "Ad Gallery" | "Creative". Clicking switches between the two views. Default to Ad Gallery (existing behavior).

**Step 2: Build creative page renderer**

`renderCreativePage(slug)` function that:
1. Groups all images by concept
2. For each concept, renders a grid of image cards
3. Each card shows: image thumbnail (click to enlarge), filename, type badge (base/composited), status badge, annotation text
4. Cards are larger than in the ad gallery — this is the visual comparison view

**Step 3: Add filter bar**

Above the grid, add filter buttons:
- All / Bases only / Composited only / Unapproved only
- Filters update the grid in-place (show/hide)

**Step 4: Add review controls on image cards**

Same approve/reject/flag + annotation as in the ad gallery, but more prominent since this view is image-first. Each card has the buttons directly visible (not hidden behind a click).

**Step 5: Test manually**

Switch to Creative view. See all 12 Transplant images in a grid. Filter to "Bases only" — see 6. Filter to "Unapproved" — see all (none reviewed yet). Approve one, switch filter, verify it disappears from "Unapproved".

**Step 6: Commit**

```bash
git add app/index.html
git commit -m "Add dedicated creative review page with grid view and filters"
```

---

### Task 7: Update manifest for existing composited images

**Files:**
- Modify: `segments/the-transplant/creative/manifest.json`

**Step 1: Add all 6 composited images to the manifest**

Ensure each `-copy.png` file has a manifest entry with `type: "composited"`, `parent` pointing to the base, and `copy_variant` indicating which ad variant's text was used.

**Step 2: Verify in the app**

Restart server, check both views show all 12 images correctly grouped and typed.

**Step 3: Commit**

```bash
git add segments/the-transplant/creative/manifest.json
git commit -m "Add composited image entries to Transplant manifest"
```

---

### Task 8: Update memory and skill

**Files:**
- Modify: `~/.claude/projects/-Users-ryan-dinner-matcher-marketing/memory/MEMORY.md`
- Modify: `.claude/skills/generate-creative/SKILL.md`

**Step 1: Update MEMORY.md**

Replace the "Creative Review App" section with new instructions:
- `node app/server.js` starts the app on port 8642
- No build step needed — data is live
- Reviews saved to `creative/reviews.json` per segment

**Step 2: Update generate-creative skill**

Update the "Notes" section and manifest writing step to include the `type` and `parent` fields for new images.

**Step 3: Commit**

```bash
git add .claude/skills/generate-creative/SKILL.md
git commit -m "Update memory and skill for new review app server"
```
