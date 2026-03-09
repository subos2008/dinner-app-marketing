import { tags } from "./commands/tags.ts";
import { images } from "./commands/images.ts";
import { captions } from "./commands/captions.ts";
import { bodyCopy } from "./commands/body-copy.ts";
import { ads } from "./commands/ads.ts";
import { adSets } from "./commands/ad-sets.ts";
import { campaigns } from "./commands/campaigns.ts";
import { sync } from "./commands/sync.ts";

const USAGE = `Usage: deno task cli <command> <action> [args]

Commands:
  tags list
  tags create --name <n>
  tags delete <id>

  images list
  images add --filename <f> --storage-path <p> [--prompt <p>]

  captions list
  captions add --text <t>
  captions delete <id>

  body-copy list
  body-copy add --text <t> [--headline <h>]
  body-copy delete <id>

  ads list
  ads create --image <id>
  ads update <id> [--status <s>] [--feedback <f>]
  ads delete <id>

  ad-sets list
  ad-sets create --name <n> [--campaign <id>] [--budget <gbp>] [--age-min <n>] [--age-max <n>]
  ad-sets update <id> [--name <n>] [--budget <gbp>] [--desired-status <s>] ...

  campaigns list
  campaigns create --name <n> [--objective <obj>]

  sync plan [--ad-set <id>]
  sync apply [--ad-set <id>]
  sync [--images-only]          (legacy: upload images to storage)`;

function parseFlags(args: string[]): Record<string, string> {
  const flags: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith("--")) {
      const key = args[i].slice(2);
      const next = args[i + 1];
      if (next && !next.startsWith("--")) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = "true";
      }
    }
  }
  return flags;
}

async function main() {
  const [command, action, ...rest] = Deno.args;

  if (!command) {
    console.log(USAGE);
    Deno.exit(0);
  }

  try {
    switch (command) {
      case "tags":
        await tags(action, rest);
        break;
      case "images":
        await images(action, rest);
        break;
      case "captions":
        await captions(action, rest);
        break;
      case "body-copy":
        await bodyCopy(action, rest);
        break;
      case "ads":
        await ads(action, rest);
        break;
      case "ad-sets":
        await adSets(action, rest);
        break;
      case "campaigns":
        await campaigns(action, rest);
        break;
      case "sync":
        // sync has no action — flags start from action position
        await sync(action ? [action, ...rest] : rest);
        break;
      default:
        console.error(`Unknown command: ${command}`);
        console.error(USAGE);
        Deno.exit(1);
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Error: ${message}`);
    Deno.exit(1);
  }
}

export { parseFlags };
main();
