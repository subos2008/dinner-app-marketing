# Aspect Ratio Support

We currently ignore aspect ratios when generating images, they come out at 1x1.

This is the shizzle on aspect ratios for Meta ads:

1:1 is a safe, solid default — but you're leaving performance on the table. Here's the reality:
1:1 works, but it's not optimal everywhere

Feed (IG + FB): 1:1 is fine. It's the classic square format and renders well.
Stories & Reels: 1:1 gets pillar-boxed with blurred bars top and bottom. You're losing ~40% of the screen. 9:16 is the native format — full-screen, immersive, higher engagement.
FB Right Column: Expects more landscape-ish ratios (1.91:1). Your square will just get cropped/resized.
Reels specifically: *Meta strongly favors 9:16 in the algorithm for Reels placement.* A 1:1 in a Reels slot is a real disadvantage.

The practical breakdown:
Placement Ideal Ratio 1:1 Result
IG/FB Feed 4:5 or 1:1 ✅ Fine
IG/FB Stories 9:16 ⚠️ Pillar-boxed
IG/FB Reels 9:16 ⚠️ Pillar-boxed
FB Right Column 1.91:1⚠️ Resized

One thing worth knowing: 4:5 (portrait) actually outperforms 1:1 in feed on both platforms — it takes up more vertical screen real estate before the user scrolls past.

The move most advertisers make: Generate at 9:16, then crop a 4:5 and 1:1 version from the center of that canvas. You cover everything from one master creative.

Want help thinking through a production workflow for that?


# How to Generate Safely With Aspect Ratios

@google/genai (Gemini) is a solid choice, but there are some specific things to know for your use case.
On aspect ratios with Gemini image generation:
Gemini's imagen-3.0-generate model supports explicit aspect ratio parameters. You can pass aspectRatio in the config:
typescriptimport { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const response = await ai.models.generateImages({
  model: "imagen-3.0-generate-002",
  prompt: "Your ad creative prompt",
  config: {
    numberOfImages: 1,
    aspectRatio: "9:16", // "1:1" | "3:4" | "4:3" | "9:16" | "16:9"
  },
});
Supported ratios are: 1:1, 3:4, 4:3, 9:16, 16:9 — which maps well to your Meta placements.
On text overlay specifically:
If you're using Gemini's image editing endpoint to add text to an existing image, it will try to respect input dimensions — but verify. The more reliable pattern is:

Generate the base image at the correct ratio via Gemini
Get back the image buffer
Use Sharp (Node.js) to composite your text/overlay on top

# Grindr

Key output platform for us - support

# Gemini supports

1:1, 2:3, 3:2, 3:4, 4:3, 4:5, 5:4, 9:16, 16:9, 21:9

# Ad Asset Matrix

| Placement | Dimensions | Aspect Ratio | Notes |
|---|---|---|---|
| Meta Feed (IG + FB) | 1080×1350px | 4:5 | Best performing feed format |
| Meta Stories | 1080×1920px | 9:16 | Full screen, keep safe zones |
| Meta Reels | 1080×1920px | 9:16 | Same as Stories |
| FB Right Column | 1200×628px | 1.91:1 | Desktop only |
| Grindr Interstitial | 960×1440px | 2:3 | 3× upscaled for quality, resize down to 320×480 |
| Grindr Medium Banner | 300×250px | 6:5 | Nearly square |
| Grindr Small Banner | 320×50px | 6.4:1 | Landscape strip |

# Plan

- Add a box to select the target: "IG/FB Feed" => 4:5 (hmm, is that actually supported?), "Stories & Reels" => 9:16, "Grindr" => 2:3 (Again, is that possible?)
- specify aspectRatio when generating base images
- Use Sharp for overlay of text / CTA
- Tag generated images with their aspect ratio - what's the best way to implement this? A join table would be silly or not? Index? 
- Filter in the UI Library? Or not? 
