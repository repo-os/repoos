/**
 * Shared CLI helpers for the opt-in project-docs flow (#0673). Both
 * `repoos docs ...` and `repoos init --docs-from` use these, so the reporting
 * lives here rather than in either command and init never has to import the
 * PM-agent-backed `docs.ts`.
 */
import { join } from "node:path";
import { findRepoRoot, loadConfig } from "../core/config.js";
import {
  expandHome,
  importProjectDocs,
  scaffoldStarterDocs,
  type DocsImportResult,
} from "../core/project-docs.js";
import { c } from "../cli/colors.js";

/** Print an import result (shared by `docs import` and `init --docs-from`). */
export function reportDocsImport(result: DocsImportResult, dryRun: boolean): void {
  const verb = dryRun ? "would copy" : "copied";
  if (result.note) console.log(c.dim("  " + result.note));
  for (const e of result.created) console.log("  " + c.green(verb + " ") + e.path);
  for (const e of result.overwritten)
    console.log("  " + c.yellow("overwrote ") + e.path + c.dim(" (--force)"));
  for (const e of result.skipped) console.log("  " + c.dim("exists  " + e.path));
  const total = result.created.length + result.overwritten.length;
  if (total === 0 && result.skipped.length === 0) {
    console.log(c.dim("  nothing to copy"));
  } else {
    console.log("  " + c.dim(`${total} file${total === 1 ? "" : "s"} ${verb}`));
  }
  if (result.skipped.length > 0 && !dryRun) {
    console.log(c.dim("  Re-run with --force to overwrite the existing files."));
  }
}

/**
 * Copy a doc set into a repo's docsDir and report it. Never throws: a bad
 * source prints a clear error and returns false, so init still completes with
 * the scaffold it already wrote.
 */
export function importDocsInto(
  root: string,
  docsDir: string,
  source: string,
  opts: { force?: boolean; dryRun?: boolean } = {},
): boolean {
  const expanded = expandHome(source.trim());
  try {
    const result: DocsImportResult = importProjectDocs(expanded, join(root, docsDir), opts);
    reportDocsImport(result, opts.dryRun === true);
    return true;
  } catch (err) {
    console.error(c.red("  " + (err as Error).message));
    return false;
  }
}

/** Write the opt-in starter skeleton into docsDir and report it. */
export function scaffoldDocsInto(root: string, docsDir: string): void {
  const result = scaffoldStarterDocs(join(root, docsDir));
  for (const f of result.created) console.log("  " + c.green("created ") + f);
  for (const f of result.skipped) console.log("  " + c.dim("exists  " + f));
  if (result.created.length === 0) {
    console.log(c.dim(`  ${docsDir}/ already has the starter files.`));
  }
}

/** Resolve a repo's docsDir from the current working directory. */
export function currentDocsDir(): { root: string; docsDir: string } {
  const root = findRepoRoot(process.cwd());
  const config = loadConfig(root);
  return { root, docsDir: config.docsDir };
}
