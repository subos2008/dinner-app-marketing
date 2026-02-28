#!/usr/bin/env node

/**
 * Build script for the Come Join Us Creative Review App.
 *
 * Reads all segment markdown files + creative manifests,
 * outputs app/data.json for the review UI to consume.
 *
 * Usage: node app/build.js
 */

const fs = require('fs');
const path = require('path');

const SEGMENTS_DIR = path.join(__dirname, '..', 'segments');
const OUTPUT_PATH = path.join(__dirname, 'data.json');

// Segment folders to scan (excludes non-segment files like strategy.md)
function getSegmentFolders() {
  return fs.readdirSync(SEGMENTS_DIR).filter(name => {
    const fullPath = path.join(SEGMENTS_DIR, name);
    return fs.statSync(fullPath).isDirectory();
  });
}

function readFileIfExists(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch {
    return null;
  }
}

// --- Profile parser ---
function parseProfile(content) {
  if (!content) return null;

  const result = {};

  const nameMatch = content.match(/^#\s+(.+)$/m);
  if (nameMatch) result.name = nameMatch[1].trim();

  const fields = [
    ['type', /\*\*Segment type:\*\*\s*(.+)/],
    ['who', /\*\*Who:\*\*\s*(.+)/],
    ['ageSkew', /\*\*Age skew:\*\*\s*(.+)/],
    ['emotionalState', /\*\*Emotional state:\*\*\s*(.+)/],
    ['trigger', /\*\*Trigger:\*\*\s*(.+)/],
    ['whatTheySay', /\*\*What they'd tell a friend:\*\*\s*(.+)/],
    ['messagingHook', /\*\*Messaging hook:\*\*\s*(.+)/],
    ['priority', /\*\*Priority:\*\*\s*(.+)/],
  ];

  for (const [key, regex] of fields) {
    const match = content.match(regex);
    if (match) result[key] = match[1].trim();
  }

  // Parse targeting signals as a list
  const targetingSection = content.match(/\*\*Meta targeting signals:\*\*\n([\s\S]*?)(?=\n\*\*|$)/);
  if (targetingSection) {
    result.targetingSignals = targetingSection[1]
      .split('\n')
      .map(l => l.replace(/^-\s*/, '').trim())
      .filter(Boolean);
  }

  return result;
}

// --- Empathy parser ---
function parseEmpathy(content) {
  if (!content) return null;

  const result = {};

  // Persona snapshot — text after "## 1. Persona Snapshot" until next ##
  const snapshotMatch = content.match(/## 1\. Persona Snapshot\s*\n+([\s\S]*?)(?=\n---|\n## )/);
  if (snapshotMatch) result.personaSnapshot = snapshotMatch[1].trim();

  // Key phrases for copy
  const keyPhrasesSection = content.match(/## 6\. Key Phrases for Copy\s*\n([\s\S]*?)(?=\n---\s*\n---|\n# QUICK MODE|$)/);
  if (keyPhrasesSection) {
    const phraseCategories = {};
    const categoryBlocks = keyPhrasesSection[1].split(/### /);
    for (const block of categoryBlocks) {
      if (!block.trim()) continue;
      const lines = block.split('\n');
      const categoryName = lines[0].trim();
      const phrases = lines.slice(1)
        .map(l => l.replace(/^-\s*/, '').replace(/^[""]|[""]$/g, '').trim())
        .filter(Boolean);
      if (phrases.length) phraseCategories[categoryName] = phrases;
    }
    result.keyPhrases = phraseCategories;
  }

  // Pain points table
  const painSection = content.match(/## 4\. Pain Points & Desires\s*\n([\s\S]*?)(?=\n---|\n## )/);
  if (painSection) {
    const rows = painSection[1].split('\n').filter(l => l.startsWith('|') && !l.includes('---'));
    // Skip header row
    result.painPoints = rows.slice(1).map(row => {
      const cells = row.split('|').map(c => c.trim()).filter(Boolean);
      if (cells.length >= 3) {
        return { pain: cells[0], desire: cells[1], fear: cells[2] };
      }
      return null;
    }).filter(Boolean);
  }

  // Quick mode — full text after "# QUICK MODE"
  const quickMatch = content.match(/# QUICK MODE\s*\n+---\s*\n+([\s\S]*?)$/);
  if (quickMatch) result.quickMode = quickMatch[1].trim();

  return result;
}

// --- Concepts parser ---
function parseConcepts(content) {
  if (!content) return null;

  const result = { concepts: [], priority: [] };

  // Parse individual concepts
  const conceptBlocks = content.split(/## Concept \d+:\s*/);
  for (const block of conceptBlocks) {
    if (!block.trim()) continue;

    // Check if this is the priority section
    if (block.startsWith('Concept Priority') || block.startsWith('## Concept Priority')) continue;

    const lines = block.split('\n');
    const name = lines[0].trim();

    if (name === 'Concept Priority') continue;

    const concept = { name };

    const fields = [
      ['insight', /\*\*Insight:\*\*\s*([\s\S]*?)(?=\n\*\*|\n---)/],
      ['emotionalLever', /\*\*Emotional lever:\*\*\s*([\s\S]*?)(?=\n\*\*|\n---)/],
      ['angle', /\*\*Angle:\*\*\s*([\s\S]*?)(?=\n\*\*|\n---)/],
      ['format', /\*\*Format:\*\*\s*(.+)/],
      ['test', /\*\*Test:\*\*\s*([\s\S]*?)(?=\n\*\*|\n---|\n$)/],
    ];

    for (const [key, regex] of fields) {
      const match = block.match(regex);
      if (match) concept[key] = match[1].trim();
    }

    // Headline directions
    const headlineMatch = block.match(/\*\*Headline directions:\*\*\s*\n([\s\S]*?)(?=\n\*\*|\n---)/);
    if (headlineMatch) {
      concept.headlines = headlineMatch[1]
        .split('\n')
        .map(l => l.replace(/^-\s*/, '').replace(/^[""]|[""]$/g, '').trim())
        .filter(Boolean);
    }

    if (concept.name) result.concepts.push(concept);
  }

  // Parse priority list
  const prioritySection = content.match(/## Concept Priority\s*\n([\s\S]*?)$/);
  if (prioritySection) {
    const priorityLines = prioritySection[1].match(/^\d+\.\s+\*\*(.+?)\*\*/gm);
    if (priorityLines) {
      result.priority = priorityLines.map(l => {
        const m = l.match(/\d+\.\s+\*\*(.+?)\*\*/);
        return m ? m[1] : null;
      }).filter(Boolean);
    }
  }

  return result;
}

// --- Ad Copy parser ---
function parseAdCopy(content) {
  if (!content) return null;

  const result = { title: '', concepts: [] };

  const titleMatch = content.match(/^#\s+(.+)$/m);
  if (titleMatch) result.title = titleMatch[1].trim();

  // Split by concept sections (## headings that aren't ### Feed Ads or ### Stories/Reels)
  // For cross-segment, ads are directly under ## Feed Ads / ## Stories/Reels
  const isCrossSegment = content.includes('*These ads work for any segment');

  if (isCrossSegment) {
    // Cross-segment: parse flat ad list
    const concept = { name: 'Cross-Segment', feedAds: [], storiesReels: [] };

    // Feed ads
    const feedSection = content.match(/## Feed Ads\s*\n([\s\S]*?)(?=## Stories|$)/);
    if (feedSection) {
      concept.feedAds = parseFeedAds(feedSection[1]);
    }

    // Stories
    const storiesSection = content.match(/## Stories\/Reels\s*\n([\s\S]*?)$/);
    if (storiesSection) {
      concept.storiesReels = parseStoriesAds(storiesSection[1]);
    }

    result.concepts.push(concept);
  } else {
    // Standard segment: ## Concept Name → ### Feed Ads / ### Stories/Reels
    const conceptSections = content.split(/\n## (?!#)/);
    for (const section of conceptSections) {
      if (!section.trim() || section.startsWith('Ad Copy:') || section.startsWith('#')) continue;

      const nameMatch = section.match(/^(.+?)(?:\n|$)/);
      if (!nameMatch) continue;

      const conceptName = nameMatch[1].trim();
      if (conceptName.startsWith('*') || conceptName.startsWith('---')) continue;

      const concept = { name: conceptName, feedAds: [], storiesReels: [] };

      const feedSection = section.match(/### Feed Ads\s*\n([\s\S]*?)(?=### Stories|$)/);
      if (feedSection) {
        concept.feedAds = parseFeedAds(feedSection[1]);
      }

      const storiesSection = section.match(/### Stories\/Reels\s*\n([\s\S]*?)(?=\n## |$)/);
      if (storiesSection) {
        concept.storiesReels = parseStoriesAds(storiesSection[1]);
      }

      if (concept.name && (concept.feedAds.length || concept.storiesReels.length)) {
        result.concepts.push(concept);
      }
    }
  }

  return result;
}

function parseFeedAds(text) {
  const ads = [];
  // Split on **Name — Variant X** or **Ad N — Name**
  const adBlocks = text.split(/\n\*\*/).filter(Boolean);

  for (const block of adBlocks) {
    const headerMatch = block.match(/^(.+?)\*\*\s*\n/);
    if (!headerMatch) continue;

    const header = headerMatch[1].trim().replace(/^\*\*/, '');
    const body = block.slice(headerMatch[0].length).trim();

    // Split body into parts
    const lines = body.split('\n');
    const ctaButtonMatch = body.match(/CTA button:\s*(.+)/);
    const bodyText = lines
      .filter(l => !l.startsWith('CTA button:') && !l.startsWith('---'))
      .join('\n')
      .trim();

    // Try to extract hook (first non-empty line) and CTA (last non-empty line before CTA button)
    const bodyLines = bodyText.split('\n').filter(l => l.trim());
    const hook = bodyLines[0] || '';
    const cta = bodyLines.length > 1 ? bodyLines[bodyLines.length - 1] : '';
    const middleBody = bodyLines.length > 2 ? bodyLines.slice(1, -1).join('\n') : '';

    ads.push({
      header,
      hook,
      body: middleBody,
      cta,
      ctaButton: ctaButtonMatch ? ctaButtonMatch[1].trim() : '',
      fullText: bodyText,
    });
  }

  return ads;
}

function parseStoriesAds(text) {
  const ads = [];
  const adBlocks = text.split(/\n\*\*/).filter(Boolean);

  for (const block of adBlocks) {
    const headerMatch = block.match(/^(.+?)\*\*\s*\n/);
    if (!headerMatch) continue;

    const header = headerMatch[1].trim().replace(/^\*\*/, '');
    const body = block.slice(headerMatch[0].length).trim();

    // Parse frames
    const frames = [];
    const frameMatches = body.matchAll(/Frame \d+:\s*(.+)/g);
    for (const m of frameMatches) {
      frames.push(m[1].trim());
    }

    // Visual direction
    const visualMatch = body.match(/Visual direction:\s*([\s\S]*?)$/);

    ads.push({
      header,
      frames,
      visualDirection: visualMatch ? visualMatch[1].trim() : '',
      fullText: body,
    });
  }

  return ads;
}

// --- Review parser ---
function parseReview(content) {
  if (!content) return null;

  const result = { ads: [], topAds: [], standoutLines: [], biggestGap: '' };

  // Parse each ad review
  const adSections = content.split(/### (?!Top 3|Biggest|Lines from|Rewrite|Overall)/);
  for (const section of adSections) {
    if (!section.trim()) continue;

    const nameMatch = section.match(/^(.+?)(?:\n|$)/);
    if (!nameMatch) continue;

    const adName = nameMatch[1].trim();
    if (adName.startsWith('*') || adName.startsWith('---') || adName === 'Ad-by-Ad Review') continue;

    const ad = { name: adName, scores: {}, verdict: '', overall: '' };

    // Parse score table
    const scoreRows = section.match(/\|\s*(\w[\w\s]*?)\s*\|\s*(\d)\/5\s*\|\s*(.+?)\s*\|/g);
    if (scoreRows) {
      for (const row of scoreRows) {
        const m = row.match(/\|\s*(\w[\w\s]*?)\s*\|\s*(\d)\/5\s*\|\s*(.+?)\s*\|/);
        if (m) {
          const dimension = m[1].trim().replace(/\*\*/g, '');
          ad.scores[dimension] = {
            score: parseInt(m[2]),
            notes: m[3].trim(),
          };
        }
      }
    }

    // Overall score
    const overallMatch = section.match(/\*\*Overall\*\*\s*\|\s*\*\*(\d)\/5\*\*/);
    if (overallMatch) ad.overall = parseInt(overallMatch[1]);

    // Verdict
    const verdictMatch = section.match(/\*\*Verdict:\*\*\s*(.+)/);
    if (verdictMatch) ad.verdict = verdictMatch[1].trim();

    if (adName && (Object.keys(ad.scores).length > 0 || ad.verdict)) {
      result.ads.push(ad);
    }
  }

  // Top 3 Strongest Ads
  const topSection = content.match(/### Top 3 Strongest Ads\s*\n([\s\S]*?)(?=### |$)/);
  if (topSection) {
    const topMatches = topSection[1].matchAll(/\d+\.\s+\*\*(.+?)\*\*\s*\((\d)\/5\)\s*—\s*(.+?)(?=\n\n|\n\d\.|\n###|$)/gs);
    for (const m of topMatches) {
      result.topAds.push({
        name: m[1].trim(),
        score: parseInt(m[2]),
        summary: m[3].trim(),
      });
    }
  }

  // Standout lines
  const linesSection = content.match(/### Top 3 Standout Lines\s*\n([\s\S]*?)(?=### |$)/);
  if (linesSection) {
    const lineMatches = linesSection[1].matchAll(/\d+\.\s+\*\*[""](.+?)["'""]\*\*\s*—\s*(.+?)(?=\n\n|\n\d\.|\n###|$)/gs);
    for (const m of lineMatches) {
      result.standoutLines.push({
        line: m[1].trim(),
        note: m[2].trim(),
      });
    }
  }

  // Biggest gap
  const gapMatch = content.match(/### Biggest Gap\s*\n([\s\S]*?)(?=### |$)/);
  if (gapMatch) result.biggestGap = gapMatch[1].trim();

  return result;
}

// --- Slugify an ad header for use as a key ---
function slugifyHeader(header) {
  return header
    .toLowerCase()
    .replace(/\u2014/g, '-')  // em dash
    .replace(/\u2013/g, '-')  // en dash
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// --- Read ad-status.json ---
function readAdStatus(segmentPath) {
  const statusPath = path.join(segmentPath, 'creative', 'ad-status.json');
  try {
    return JSON.parse(fs.readFileSync(statusPath, 'utf-8'));
  } catch {
    return {};
  }
}

// --- Creative manifest ---
function parseManifest(segmentPath) {
  const manifestPath = path.join(segmentPath, 'creative', 'manifest.json');
  try {
    return JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  } catch {
    return null;
  }
}

// --- List creative images (returns rich image objects) ---
function listCreativeImages(segmentPath) {
  const creativePath = path.join(segmentPath, 'creative');

  // Get all image files
  let imageFiles;
  try {
    imageFiles = fs.readdirSync(creativePath)
      .filter(f => /\.(png|jpg|jpeg|webp)$/i.test(f))
      .sort();
  } catch {
    return [];
  }

  if (imageFiles.length === 0) return [];

  // Read manifest.json if it exists
  let manifestEntries = {};
  try {
    const manifest = JSON.parse(fs.readFileSync(path.join(creativePath, 'manifest.json'), 'utf-8'));
    if (manifest.images && Array.isArray(manifest.images)) {
      for (const entry of manifest.images) {
        manifestEntries[entry.filename] = entry;
      }
    }
  } catch {
    // No manifest — will fall back to inference
  }

  // Read reviews.json if it exists
  let reviews = {};
  try {
    const reviewData = JSON.parse(fs.readFileSync(path.join(creativePath, 'reviews.json'), 'utf-8'));
    if (reviewData && typeof reviewData === 'object') {
      // Support both { "filename": { status, note } } and array format
      if (Array.isArray(reviewData)) {
        for (const entry of reviewData) {
          if (entry.filename) {
            reviews[entry.filename] = { status: entry.status, note: entry.note || null };
          }
        }
      } else {
        reviews = reviewData;
      }
    }
  } catch {
    // No reviews — that's fine
  }

  return imageFiles.map(filename => {
    const manifestEntry = manifestEntries[filename];

    if (manifestEntry) {
      // Use manifest metadata
      return {
        filename,
        concept: manifestEntry.concept || null,
        format: manifestEntry.format || null,
        aspect_ratio: manifestEntry.aspect_ratio || null,
        type: manifestEntry.type || 'base',
        parent: manifestEntry.parent || null,
        copy_variant: manifestEntry.copy_variant || null,
        review: reviews[filename] || null,
      };
    }

    // Fallback: infer from filename
    return inferImageMetadata(filename, reviews[filename] || null);
  });
}

// --- Infer image metadata from filename ---
function inferImageMetadata(filename, review) {
  const baseName = filename.replace(/\.(png|jpg|jpeg|webp)$/i, '');

  // Determine format
  let format = null;
  if (baseName.includes('-feed-')) format = 'feed';
  else if (baseName.includes('-story-')) format = 'story';

  // Determine aspect ratio from filename
  let aspect_ratio = null;
  const ratioMatch = baseName.match(/(\d+)x(\d+)/);
  if (ratioMatch) {
    aspect_ratio = `${ratioMatch[1]}:${ratioMatch[2]}`;
  }

  // Determine type: composited if ends with -copy or -v followed by digits
  const isComposited = /-copy$/.test(baseName) || /-v\d+$/.test(baseName);
  const type = isComposited ? 'composited' : 'base';

  // Determine parent for composited images
  let parent = null;
  if (isComposited) {
    const parentBase = baseName.replace(/-(copy|v\d+)$/, '');
    const ext = filename.match(/\.(png|jpg|jpeg|webp)$/i);
    parent = ext ? parentBase + ext[0] : parentBase + '.png';
  }

  // Extract concept slug: everything before the format marker
  let concept = null;
  const formatMarker = baseName.match(/-(feed|story)-/);
  if (formatMarker) {
    const slug = baseName.slice(0, formatMarker.index);
    concept = slugToConceptName(slug);
  }

  return {
    filename,
    concept,
    format,
    aspect_ratio,
    type,
    parent,
    copy_variant: null,
    review: review || null,
  };
}

// --- Convert a slug like "wednesday-night-problem" to a concept name ---
function slugToConceptName(slug) {
  // Title-case each word
  const words = slug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1));
  const name = words.join(' ');

  // Prefix with "The" for known patterns that start with "The"
  const thePatterns = ['Wednesday', 'Google', 'Quiet', 'Transplant', 'Explorer', 'Outgrower', 'Sober', 'Plant', 'Healthy', 'Hippy'];
  if (thePatterns.some(p => name.startsWith(p))) {
    return 'The ' + name;
  }

  return name;
}

// --- Build data (returns object, does not write to disk) ---
function buildData() {
  const folders = getSegmentFolders();
  const segments = [];

  for (const folder of folders) {
    const segmentPath = path.join(SEGMENTS_DIR, folder);

    const profileContent = readFileIfExists(path.join(segmentPath, 'profile.md'));
    const empathyContent = readFileIfExists(path.join(segmentPath, 'empathy.md'));
    const conceptsContent = readFileIfExists(path.join(segmentPath, 'concepts.md'));
    const adCopyContent = readFileIfExists(path.join(segmentPath, 'ad-copy.md'));
    const reviewContent = readFileIfExists(path.join(segmentPath, 'review.md'));

    const profile = parseProfile(profileContent);
    const empathy = parseEmpathy(empathyContent);
    const concepts = parseConcepts(conceptsContent);
    const adCopy = parseAdCopy(adCopyContent);
    const review = parseReview(reviewContent);
    const manifest = parseManifest(segmentPath);
    const images = listCreativeImages(segmentPath);
    const adStatus = readAdStatus(segmentPath);

    const segment = {
      slug: folder,
      name: profile?.name || adCopy?.title?.replace('Ad Copy: ', '') || folder.replace(/^the-/, '').replace(/-/g, ' '),
      profile,
      empathy,
      concepts,
      adCopy,
      review,
      manifest,
      images,
      adStatus,
      creativePath: `segments/${folder}/creative`,
    };

    segments.push(segment);
  }

  // Sort: life-situation segments first, then lifestyle, then cross-segment last
  segments.sort((a, b) => {
    if (a.slug === 'cross-segment') return 1;
    if (b.slug === 'cross-segment') return -1;
    const aType = a.profile?.type || '';
    const bType = b.profile?.type || '';
    if (aType.includes('Life-situation') && !bType.includes('Life-situation')) return -1;
    if (!aType.includes('Life-situation') && bType.includes('Life-situation')) return 1;
    return 0;
  });

  return {
    generatedAt: new Date().toISOString(),
    segmentCount: segments.length,
    segments,
  };
}

// --- Write data.json to disk (backward compat for CLI usage) ---
function build() {
  const data = buildData();

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(data, null, 2));
  console.log(`Built data.json with ${data.segments.length} segments → ${OUTPUT_PATH}`);

  // Summary
  for (const seg of data.segments) {
    const adCount = seg.adCopy?.concepts?.reduce((sum, c) => sum + c.feedAds.length + c.storiesReels.length, 0) || 0;
    const imageCount = seg.images.length;
    const reviewCount = seg.review?.ads?.length || 0;
    console.log(`  ${seg.slug}: ${adCount} ads, ${reviewCount} reviews, ${imageCount} images`);
  }
}

// CLI usage
if (require.main === module) {
  build();
}

module.exports = { buildData, slugifyHeader };
