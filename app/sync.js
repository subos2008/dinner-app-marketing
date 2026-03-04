#!/usr/bin/env node

/**
 * Sync filesystem data to Supabase.
 *
 * Pushes segments, images, reviews, and ad statuses from git to Supabase DB + Storage.
 * Idempotent — uses upserts and skips existing Storage objects.
 *
 * Requires: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY env vars.
 *
 * Usage:
 *   node app/sync.js              # sync everything
 *   node app/sync.js --data-only  # skip image upload
 *   node app/sync.js --images-only # only upload images
 */

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const { buildData } = require('./build');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Required env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  db: { schema: 'marketing' }
});

const args = process.argv.slice(2);
const dataOnly = args.includes('--data-only');
const imagesOnly = args.includes('--images-only');

const ROOT = path.join(__dirname, '..');

async function syncData(data) {
  let segmentCount = 0;
  let imageCount = 0;
  let reviewCount = 0;
  let statusCount = 0;

  // 1. Upsert segments
  for (const seg of data.segments) {
    const { error } = await supabase
      .from('segment')
      .upsert({
        slug: seg.slug,
        name: seg.name,
        segment_type: seg.profile?.type || null,
        profile: seg.profile,
        empathy: seg.empathy,
        concepts: seg.concepts,
        ad_copy: seg.adCopy,
        review: seg.review,
        synced_at: new Date().toISOString()
      }, { onConflict: 'slug' });

    if (error) {
      console.error(`  segment ${seg.slug}: ${error.message}`);
    } else {
      segmentCount++;
    }
  }
  console.log(`Segments: ${segmentCount} synced`);

  // 2. Upsert creative images (from manifest data)
  for (const seg of data.segments) {
    if (!seg.manifest?.images) continue;

    for (const img of seg.manifest.images) {
      const { error } = await supabase
        .from('creative_image')
        .upsert({
          segment_slug: seg.slug,
          filename: img.filename,
          concept: img.concept || null,
          ad_variant: img.ad_variant || img.copy_variant || null,
          format: img.format || null,
          aspect_ratio: img.aspect_ratio || null,
          type: img.type || 'base',
          parent: img.parent || null,
          prompt: img.prompt || null,
          style: img.style || null,
          visual_type: img.visual_type || null,
          storage_path: `${seg.slug}/${img.filename}`
        }, { onConflict: 'segment_slug,filename' });

      if (error) {
        console.error(`  image ${seg.slug}/${img.filename}: ${error.message}`);
      } else {
        imageCount++;
      }
    }
  }
  console.log(`Images (metadata): ${imageCount} synced`);

  // 3. Upsert reviews
  for (const seg of data.segments) {
    // Reviews are embedded in each image object
    for (const img of seg.images) {
      if (!img.review) continue;

      const { error } = await supabase
        .from('image_review')
        .upsert({
          segment_slug: seg.slug,
          filename: img.filename,
          status: img.review.status || null,
          note: img.review.note || '',
          updated_at: img.review.updatedAt || new Date().toISOString()
        }, { onConflict: 'segment_slug,filename' });

      if (error) {
        console.error(`  review ${seg.slug}/${img.filename}: ${error.message}`);
      } else {
        reviewCount++;
      }
    }
  }
  console.log(`Reviews: ${reviewCount} synced`);

  // 4. Upsert ad campaign statuses
  for (const seg of data.segments) {
    if (!seg.adStatus) continue;

    for (const [adId, entry] of Object.entries(seg.adStatus)) {
      const { error } = await supabase
        .from('ad_campaign_status')
        .upsert({
          segment_slug: seg.slug,
          ad_id: adId,
          status: entry.status || 'unreviewed',
          feedback: entry.feedback || '',
          updated_at: entry.updatedAt || new Date().toISOString()
        }, { onConflict: 'segment_slug,ad_id' });

      if (error) {
        console.error(`  ad-status ${seg.slug}/${adId}: ${error.message}`);
      } else {
        statusCount++;
      }
    }
  }
  console.log(`Ad statuses: ${statusCount} synced`);
}

async function syncImages(data) {
  let uploaded = 0;
  let skipped = 0;

  // Use the default schema client for storage operations
  const storageClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  for (const seg of data.segments) {
    const creativePath = path.join(ROOT, 'segments', seg.slug, 'creative');

    let files;
    try {
      files = fs.readdirSync(creativePath).filter(f => /\.(png|jpg|jpeg|webp)$/i.test(f));
    } catch {
      continue;
    }

    for (const filename of files) {
      const storagePath = `${seg.slug}/${filename}`;
      const filePath = path.join(creativePath, filename);

      // Check if already uploaded
      const { data: existing } = await storageClient.storage
        .from('creative')
        .list(seg.slug, { search: filename, limit: 1 });

      if (existing && existing.some(f => f.name === filename)) {
        skipped++;
        continue;
      }

      const fileBuffer = fs.readFileSync(filePath);
      const ext = path.extname(filename).toLowerCase();
      const mimeTypes = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };

      const { error } = await storageClient.storage
        .from('creative')
        .upload(storagePath, fileBuffer, {
          contentType: mimeTypes[ext] || 'image/png',
          upsert: false
        });

      if (error) {
        console.error(`  upload ${storagePath}: ${error.message}`);
      } else {
        uploaded++;
      }
    }
  }
  console.log(`Images (storage): ${uploaded} uploaded, ${skipped} skipped (already exist)`);
}

async function main() {
  console.log(`Syncing to ${SUPABASE_URL}...\n`);

  const data = buildData();
  console.log(`Found ${data.segments.length} segments\n`);

  if (!imagesOnly) {
    await syncData(data);
    console.log('');
  }

  if (!dataOnly) {
    await syncImages(data);
    console.log('');
  }

  console.log('Sync complete.');
}

main().catch(err => {
  console.error('Sync failed:', err);
  process.exit(1);
});
