import { adStatus } from "./commands/ad-status.ts";
import { images } from "./commands/images.ts";
import { reviews } from "./commands/reviews.ts";
import { segments } from "./commands/segments.ts";
import { sync } from "./commands/sync.ts";

const USAGE = `Usage: deno task cli <command> <action> [args]

Commands:
  ad-status list <segment>
  ad-status get <segment> <ad-id>
  ad-status set <segment> <ad-id> --status <s> [--feedback <f>]

  images list <segment>
  images add <segment> --filename <f> [--concept <c>] [--format feed] [--aspect-ratio 1:1] [--type base] [--parent <p>] [--prompt <p>] [--style <s>] [--visual-type <v>] [--ad-variant <v>]

  reviews list <segment>
  reviews set <segment> <filename> --status <s> [--note <n>]

  segments list

  sync [--data-only] [--images-only]`;

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
      case "ad-status":
        await adStatus(action, rest);
        break;
      case "images":
        await images(action, rest);
        break;
      case "reviews":
        await reviews(action, rest);
        break;
      case "segments":
        await segments(action, rest);
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
