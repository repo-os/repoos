/**
 * Document creation commands for the CLI.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  createDocument,
  createFreeformDocument,
  docFreeformPrompt,
  parseGeneratedDocument,
} from "../core/docs.js";
import { loadConfig } from "../core/config.js";
import { c } from "../cli/colors.js";
import { resolvePmAgent, runPrompt, recordOneShotSession } from "../server/agents.js";
import { currentDocsDir, importDocsInto, scaffoldDocsInto } from "./docs-io.js";

/** `repoos new-doc "<description>"` or `repoos new-doc --path docs/foo.md --content-file x.md` */
export async function cmdNewDoc(args: string[]): Promise<void> {
  const flags: Record<string, string | boolean> = {};
  const positional: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith("--")) flags[a.slice(2)] = args[++i];
    else positional.push(a);
  }

  const config = loadConfig();
  const description = positional.join(" ").trim();
  const pathArg = flags.path as string | undefined;
  const contentFileArg = flags["content-file"] as string | undefined;

  if (description) {
    // Freeform mode: description -> PM agent
    const pm = resolvePmAgent(config);
    if (!pm) {
      console.error(c.red("  No PM agent is configured"));
      process.exitCode = 1;
      return;
    }

    try {
      const docResult = await createFreeformDocument(config, description, async (desc) => {
        const result = await runPrompt(pm, docFreeformPrompt(desc), {
          cwd: config.root,
        });
        // Freeform doc authoring is real PM spend that belongs to no task (0311).
        recordOneShotSession(config.root, pm, result, { sessionType: "pm", taskId: null });
        if (!result.ok || !result.output) {
          throw new Error(result.error ?? "the PM agent returned no usable output");
        }
        return parseGeneratedDocument(result.output);
      });
      console.log(
        "  " + c.green("created ") + c.cyan(docResult.path) + c.dim("  → " + docResult.absPath),
      );
    } catch (err) {
      console.error(c.red("  " + (err as Error).message));
      process.exitCode = 1;
    }
  } else if (pathArg && contentFileArg) {
    // Manual mode: --path and --content-file
    try {
      const content = readFileSync(contentFileArg, "utf8");
      const docResult = createDocument(config, {
        path: pathArg,
        content,
      });
      console.log(
        "  " + c.green("created ") + c.cyan(docResult.path) + c.dim("  → " + docResult.absPath),
      );
    } catch (err) {
      console.error(c.red("  " + (err as Error).message));
      process.exitCode = 1;
    }
  } else {
    console.error(
      c.red(
        '  Usage: repoos new-doc "description"  or  repoos new-doc --path <path> --content-file <file>',
      ),
    );
    process.exitCode = 1;
  }
}

/**
 * `repoos docs import <dir|file|.zip> [--force] [--dry-run]`
 * `repoos docs scaffold`
 *
 * Opt-in helpers around `docsDir` (#0673): copy an existing doc set, or write a
 * minimal starter skeleton. Neither runs on its own, and scaffold never
 * overwrites — an existing file is left exactly as it was.
 */
export async function cmdDocs(args: string[]): Promise<void> {
  const [sub, ...rest] = args;

  if (sub === "import") {
    let force = false;
    let dryRun = false;
    const positional: string[] = [];
    for (const a of rest) {
      if (a === "--force") force = true;
      else if (a === "--dry-run") dryRun = true;
      else positional.push(a);
    }
    const source = positional.join(" ").trim();
    if (!source) {
      console.error(c.red("  Usage: repoos docs import <dir|file|.zip> [--force] [--dry-run]"));
      process.exitCode = 1;
      return;
    }
    const { root, docsDir } = currentDocsDir();
    if (!importDocsInto(root, docsDir, source, { force, dryRun })) process.exitCode = 1;
    return;
  }

  if (sub === "scaffold") {
    if (rest.includes("--force")) {
      console.error(
        c.red(
          "  repoos docs scaffold never overwrites — remove a file you want rebuilt, then re-run.",
        ),
      );
      process.exitCode = 1;
      return;
    }
    const { root, docsDir } = currentDocsDir();
    scaffoldDocsInto(root, docsDir);
    return;
  }

  console.error(c.red("  Usage: repoos docs <import|scaffold> ..."));
  console.error(c.dim("    repoos docs import <dir|file|.zip> [--force] [--dry-run]"));
  console.error(c.dim("    repoos docs scaffold"));
  process.exitCode = 1;
}
