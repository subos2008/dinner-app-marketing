import { storageClient } from "../client.ts";

export async function sync(args: string[]) {
  // --images-only is the only behavior now, but accept the flag for backwards compat
  const _imagesOnly = args.includes("--images-only");

  console.error("Syncing images to Supabase Storage...\n");

  await syncImages();

  console.error("\nSync complete.");
}

async function syncImages() {
  let uploaded = 0;
  let skipped = 0;

  // Walk segments/*/creative/ directories for image files
  let segmentDirs: string[];
  try {
    segmentDirs = [];
    for await (const entry of Deno.readDir("segments")) {
      if (entry.isDirectory) {
        segmentDirs.push(entry.name);
      }
    }
  } catch {
    console.error("No segments/ directory found");
    return;
  }

  for (const segDir of segmentDirs) {
    const creativePath = `segments/${segDir}/creative`;

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
      const storagePath = `${segDir}/${filename}`;
      const filePath = `${creativePath}/${filename}`;

      // Check if already uploaded
      const { data: existing } = await storageClient.storage
        .from("creative")
        .list(segDir, { search: filename, limit: 1 });

      if (existing && existing.some((f: { name: string }) => f.name === filename)) {
        skipped++;
        continue;
      }

      const fileBytes = await Deno.readFile(filePath);
      const ext = filename.split(".").pop()?.toLowerCase();
      const mimeTypes: Record<string, string> = {
        png: "image/png",
        jpg: "image/jpeg",
        jpeg: "image/jpeg",
        webp: "image/webp",
      };

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

  console.error(`Images: ${uploaded} uploaded, ${skipped} skipped (already exist)`);
}
