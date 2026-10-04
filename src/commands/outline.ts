/**
 * `repoos outline <file>` — print a file's symbols with line numbers so an
 * agent can read the range it needs instead of the whole file (#0653).
 *
 * Plain text by default (stable and greppable: kind, name, start-end), with
 * `--json` for programmatic callers. Unsupported file types print one clear
 * line, never a stack trace. See src/core/outline.ts for why this is a
 * zero-dependency line scanner rather than the TypeScript compiler API.
 */
import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { formatOutline, outlineFile } from "../core/outline.js";
import { c } from "../cli/colors.js";

const USAGE = "outline <file> [--json]";

export function cmdOutline(args: string[]): void {
  let json = false;
  const positional: string[] = [];
  for (const arg of args) {
    if (arg === "--json") json = true;
    else if (arg === "--help" || arg === "-h") {
      console.log("");
      console.log(`  repoos ${USAGE}`);
      console.log("  Print a file's symbols and line ranges — read the range, not the file.");
      console.log("");
      return;
    } else if (!arg.startsWith("-")) positional.push(arg);
  }

  const target = positional[0];
  if (!target) {
    console.error(c.red("  ✗ outline: missing <file>"));
    console.error(c.dim(`    usage: repoos ${USAGE}`));
    process.exitCode = 1;
    return;
  }

  const abs = resolve(process.cwd(), target);
  if (!existsSync(abs) || !statSync(abs).isFile()) {
    console.error(c.red(`  ✗ outline: no such file: ${target}`));
    process.exitCode = 1;
    return;
  }

  const outline = outlineFile(abs);
  outline.file = target;
  if (json) {
    console.log(JSON.stringify(outline));
    return;
  }
  console.log(formatOutline(outline));
}
