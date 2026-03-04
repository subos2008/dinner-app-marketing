import { supabase, storageClient } from "../client.ts";

export async function sync(args: string[]) {
  const dataOnly = args.includes("--data-only");
  const imagesOnly = args.includes("--images-only");

  console.error("Syncing to Supabase...\n");

  // Get build data by shelling out to Node
  const buildData = await getBuildData();
  console.error(`Found ${buildData.segments.length} segments\n`);

  if (!imagesOnly) {
    await syncData(buildData);
    console.error("");
  }

  if (!dataOnly) {
    await syncImages(buildData);
    console.error("");
  }

  console.error("Sync complete.");
}

interface BuildSegment {
  slug: string;
  name: string;
  profile?: { type?: string };
  empathy?: unknown;
  concepts?: unknown;
  adCopy?: unknown;
  review?: unknown;
  manifest?: { images?: ManifestImage[] };
  images?: { filename: string; review?: { status?: string; note?: string; updatedAt?: string } }[];
  adStatus?: Record<string, { status?: string; feedback?: string; updatedAt?: string }>;
}

interface ManifestImage {
  filename: string;
  concept?: string;
  ad_variant?: string;
  copy_variant?: string;
  format?: string;
  aspect_ratio?: string;
  type?: string;
  parent?: string;
  prompt?: string;
  style?: string;
  visual_type?: string;
}

interface BuildData {
  segments: BuildSegment[];
}

async function getBuildData(): Promise<BuildData> {
  const cmd = new Deno.Command("node", {
    args: ["-e", `const {buildData} = require('./app/build'); console.log(JSON.stringify(buildData()))`],
    stdout: "piped",
    stderr: "piped",
  });

  const output = await cmd.output();
  if (!output.success) {
    const stderr = new TextDecoder().decode(output.stderr);
    throw new Error(`buildData() failed: ${stderr}`);
  }

  return JSON.parse(new TextDecoder().decode(output.stdout));
}

async function syncData(data: BuildData) {
  let segmentCount = 0;
  let imageCount = 0;
  let reviewCount = 0;
  let statusCount = 0;

  // 1. Upsert segments
  for (const seg of data.segments) {
    const { error } = await supabase
      .from("segment")
      .upsert({
        slug: seg.slug,
        name: seg.name,
        segment_type: seg.profile?.type || null,
        profile: seg.profile,
        empathy: seg.empathy,
        concepts: seg.concepts,
        ad_copy: seg.adCopy,
        review: seg.review,
        synced_at: new Date().toISOString(),
      }, { onConflict: "slug" });

    if (error) {
      console.error(`  segment ${seg.slug}: ${error.message}`);
    } else {
      segmentCount++;
    }
  }
  console.error(`Segments: ${segmentCount} synced`);

  // 2. Upsert creative images (from manifest data)
  for (const seg of data.segments) {
    if (!seg.manifest?.images) continue;

    for (const img of seg.manifest.images) {
      const { error } = await supabase
        .from("creative_image")
        .upsert({
          segment_slug: seg.slug,
          filename: img.filename,
          concept: img.concept || null,
          ad_variant: img.ad_variant || img.copy_variant || null,
          format: img.format || null,
          aspect_ratio: img.aspect_ratio || null,
          type: img.type || "base",
          parent: img.parent || null,
          prompt: img.prompt || null,
          style: img.style || null,
          visual_type: img.visual_type || null,
          storage_path: `${seg.slug}/${img.filename}`,
        }, { onConflict: "segment_slug,filename" });

      if (error) {
        console.error(`  image ${seg.slug}/${img.filename}: ${error.message}`);
      } else {
        imageCount++;
      }
    }
  }
  console.error(`Images (metadata): ${imageCount} synced`);

  // 3. Upsert reviews (look up creative_image_id first)
  for (const seg of data.segments) {
    for (const img of seg.images || []) {
      if (!img.review) continue;

      // Find the creative_image row
      const { data: ciRow, error: ciErr } = await supabase
        .from("creative_image")
        .select("id")
        .eq("segment_slug", seg.slug)
        .eq("filename", img.filename)
        .single();

      if (ciErr || !ciRow) {
        console.error(`  review ${seg.slug}/${img.filename}: no matching creative_image`);
        continue;
      }

      const { error } = await supabase
        .from("image_review")
        .upsert({
          creative_image_id: ciRow.id,
          status: img.review.status || null,
          note: img.review.note || "",
          updated_at: img.review.updatedAt || new Date().toISOString(),
        }, { onConflict: "creative_image_id" });

      if (error) {
        console.error(`  review ${seg.slug}/${img.filename}: ${error.message}`);
      } else {
        reviewCount++;
      }
    }
  }
  console.error(`Reviews: ${reviewCount} synced`);

  // 4. Upsert ad campaign statuses
  for (const seg of data.segments) {
    if (!seg.adStatus) continue;

    for (const [adId, entry] of Object.entries(seg.adStatus)) {
      const { error } = await supabase
        .from("ad_campaign_status")
        .upsert({
          segment_slug: seg.slug,
          ad_id: adId,
          status: entry.status || "unreviewed",
          feedback: entry.feedback || "",
          updated_at: entry.updatedAt || new Date().toISOString(),
        }, { onConflict: "segment_slug,ad_id" });

      if (error) {
        console.error(`  ad-status ${seg.slug}/${adId}: ${error.message}`);
      } else {
        statusCount++;
      }
    }
  }
  console.error(`Ad statuses: ${statusCount} synced`);
}

async function syncImages(data: BuildData) {
  let uploaded = 0;
  let skipped = 0;

  for (const seg of data.segments) {
    const creativePath = `segments/${seg.slug}/creative`;

    let files: string[];
    try {
      files = [];
      for await (const entry of Deno.readDir(creativePath)) {
        if (entry.isFile && /\.(png|jpg|jpeg|webp)$/i.test(entry.name)) {
          files.push(entry.name);
        }
      }
    } catch {
      continue;
    }

    for (const filename of files) {
      const storagePath = `${seg.slug}/${filename}`;
      const filePath = `${creativePath}/${filename}`;

      // Check if already uploaded
      const { data: existing } = await storageClient.storage
        .from("creative")
        .list(seg.slug, { search: filename, limit: 1 });

      if (existing && existing.some((f: { name: string }) => f.name === filename)) {
        skipped++;
        continue;
      }

      const fileBytes = await Deno.readFile(filePath);
      const ext = filename.split(".").pop()?.toLowerCase();
      const mimeTypes: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp" };

      const { error } = await storageClient.storage
        .from("creative")
        .upload(storagePath, fileBytes, {
          contentType: mimeTypes[ext || ""] || "image/png",
          upsert: false,
        });

      if (error) {
        console.error(`  upload ${storagePath}: ${error.message}`);
      } else {
        uploaded++;
      }
    }
  }
  console.error(`Images (storage): ${uploaded} uploaded, ${skipped} skipped (already exist)`);
}
