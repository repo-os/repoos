/**
 * `repoos gc` — collect leaked task worktrees and branches.
 *
 * Runs against the MAIN checkout (via `boardRoot()`), never a linked worktree.
 *
 *   repoos gc              prune `repoos/integrate/*` candidates + stale metadata
 *                          now, and PREVIEW the feature worktrees `--yes` would take
 *   repoos gc --yes        also remove feature worktrees/branches for done/absent
 *                          tasks (skips any with uncommitted or unmerged work)
 *   repoos gc --dry-run    show everything that would be collected, touch nothing
 */
import { createRepoOS } from "../core/repoos.js";
import { boardRoot } from "../core/config.js";
import { c } from "../cli/colors.js";
import { sweepStaleWorktrees, type GcReport } from "../core/worktree-gc.js";

function printReport(report: GcReport, title: string): void {
  console.log(c.bold(`  ${title}`));
  if (report.removedWorktrees.length === 0 && report.keptDirty.length === 0 && report.errors.length === 0) {
    console.log(c.dim("    nothing to collect"));
  }
  for (const w of report.removedWorktrees) {
    const verb = report.dryRun ? "would remove" : "removed";
    console.log(`    ${c.green(verb)} ${w.branch || c.dim("(detached)")} ${c.dim(w.path)}`);
  }
  for (const k of report.keptDirty) {
    console.log(`    ${c.yellow("kept")}    ${k.branch || c.dim("(detached)")} ${c.dim(`— ${k.reason}`)}`);
  }
  for (const e of report.errors) {
    console.log(`    ${c.red("error")}   ${e}`);
  }
  if (report.prunedMetadata) console.log(c.dim("    ran git worktree prune"));
}

export function cmdGc(argv: string[]): void {
  const dryRun = argv.includes("--dry-run") || argv.includes("-n");
  const yes = argv.includes("--yes") || argv.includes("-y");

  const { root } = boardRoot();
  const { config } = createRepoOS(root);

  if (dryRun) {
    printReport(sweepStaleWorktrees(config, { mode: "full", dryRun: true }), "gc — dry run");
    return;
  }

  if (yes) {
    printReport(sweepStaleWorktrees(config, { mode: "full" }), "gc");
    return;
  }

  // Default: do the safe part for real, preview the rest.
  printReport(sweepStaleWorktrees(config, { mode: "integrate-only" }), "gc — candidates + stale metadata");
  const preview = sweepStaleWorktrees(config, { mode: "full", dryRun: true });
  const pendingFeature = preview.removedWorktrees.filter((w) => !w.branch.startsWith("repoos/integrate/"));
  if (pendingFeature.length || preview.keptDirty.length) {
    console.log();
    printReport({ ...preview, removedWorktrees: pendingFeature }, "feature worktrees — run `repoos gc --yes` to apply");
  }
}
