/**
 * `repoos gc` — collect leaked task worktrees and branches.
 *
 * Runs against the MAIN checkout (via `boardRoot()`), never a linked worktree.
 *
 * Cleanup is automatic and safe by construction (#1004): the same sweep runs at
 * boot and after every close-out. An operator can still inspect or force a run:
 *
 *   repoos gc              run the safe sweep now (candidates + resolved,
 *                          provably-redundant feature worktrees)
 *   repoos gc --yes        accepted for compatibility; identical to the above
 *   repoos gc --dry-run    show candidates, retained reasons, and external
 *                          worktrees, touching nothing
 */
import { createRepoOS } from "../core/repoos.js";
import { boardRoot } from "../core/config.js";
import { c } from "../cli/colors.js";
import { sweepStaleWorktrees, type GcReport } from "../core/worktree-gc.js";

function printReport(report: GcReport, title: string): void {
  console.log(c.bold(`  ${title}`));
  const counts = report.summary;
  console.log(
    c.dim(
      `    ${counts.candidates} safe candidate${counts.candidates === 1 ? "" : "s"} · ` +
        `${counts.retained} retained · ${counts.external} outside RepoOS`,
    ),
  );
  for (const w of report.removedWorktrees) {
    const verb = report.dryRun ? "would remove" : "removed";
    console.log(
      `    ${c.green(verb)} ${w.branch || c.dim("(detached)")} ${c.dim(w.path)}` +
        c.dim(` — ${w.reason}`),
    );
  }
  for (const k of report.retained) {
    console.log(
      `    ${c.yellow("kept")}    ${k.branch || c.dim("(detached)")} ${c.dim(`— ${k.reason}`)}`,
    );
  }
  for (const e of report.external) {
    console.log(`    ${c.dim("external")} ${e.branch || c.dim("(detached)")} ${c.dim(e.path)}`);
  }
  for (const e of report.errors) {
    console.log(`    ${c.red("error")}   ${e}`);
  }
  if (report.prunedMetadata) console.log(c.dim("    ran git worktree prune"));
}

export function cmdGc(argv: string[]): void {
  const dryRun = argv.includes("--dry-run") || argv.includes("-n");
  // `--yes` is accepted as a no-op compatibility alias: the default sweep is
  // already the same safe policy, with the same fail-closed guards.
  const { root } = boardRoot();
  const { config } = createRepoOS(root);

  if (dryRun) {
    printReport(sweepStaleWorktrees(config, { mode: "full", dryRun: true }), "gc — dry run");
    return;
  }
  printReport(sweepStaleWorktrees(config, { mode: "full" }), "gc");
}
