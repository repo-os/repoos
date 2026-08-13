/**
 * Document creation commands for the CLI.
 */
import { readFileSync } from "node:fs";
import { createDocument, createFreeformDocument, docFreeformPrompt, parseGeneratedDocument } from "../core/docs.js";
import { loadConfig } from "../core/config.js";
import { c } from "../cli/colors.js";
import { resolvePmAgent, runPrompt } from "../server/agents.js";

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
        if (!result.ok || !result.output) {
          throw new Error(result.error ?? "the PM agent returned no usable output");
        }
        return parseGeneratedDocument(result.output);
      });
      console.log(
        "  " +
          c.green("created ") +
          c.cyan(docResult.path) +
          c.dim("  → " + docResult.absPath),
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
        "  " +
          c.green("created ") +
          c.cyan(docResult.path) +
          c.dim("  → " + docResult.absPath),
      );
    } catch (err) {
      console.error(c.red("  " + (err as Error).message));
      process.exitCode = 1;
    }
  } else {
    console.error(
      c.red('  Usage: repoos new-doc "description"  or  repoos new-doc --path <path> --content-file <file>'),
    );
    process.exitCode = 1;
  }
}
