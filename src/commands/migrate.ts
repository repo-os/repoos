/**
 * `repoos migrate` — move local attachment bytes to cloud storage (#0663).
 *
 *   repoos migrate              upload, verify, rewrite legacy refs, release locals
 *   repoos migrate --dry-run    report planned work without mutating anything
 */
import { createRepoOS } from "../core/repoos.js";
import { boardRoot } from "../core/config.js";
import { runAttachmentMigration } from "../core/attachment-migration.js";
import { c } from "../cli/colors.js";

function printPlan(dryRun: boolean, result: ReturnType<typeof runAttachmentMigration>): void {
  const title = dryRun ? "migrate — dry run" : "migrate";
  console.log(c.bold(`  ${title}`));
  if (result.errors.length) {
    for (const err of result.errors) console.log(`    ${c.red("error")}   ${err}`);
  }
  if (!result.planned.length && !result.errors.length) {
    console.log(c.dim("    nothing to migrate"));
    return;
  }
  for (const line of result.planned) {
    const from = `${line.base}/${line.namespace}/${line.sourceName}`;
    const to =
      line.targetName === line.sourceName
        ? line.targetName
        : `${line.targetName} (rewrite refs)`;
    const verb =
      line.action === "skip-verified"
        ? c.dim("skip")
        : line.action === "verify-only"
          ? c.yellow("verify")
          : line.action === "resume-upload"
            ? c.yellow("resume")
            : c.green(dryRun ? "would upload" : "upload");
    console.log(
      `    ${verb}  ${from} → ${to}  ${c.dim(`(${line.byteLength} bytes, ${line.action})`)}`,
    );
  }
  if (!dryRun) {
    console.log();
    console.log(
      c.dim(
        `    uploaded ${result.uploaded}, verified ${result.verified}, skipped ${result.skipped}`,
      ),
    );
    if (result.rewrittenTaskFiles.length) {
      console.log(c.dim(`    rewrote ${result.rewrittenTaskFiles.length} task file(s)`));
    }
  }
}

export function cmdMigrate(argv: string[]): void {
  const dryRun = argv.includes("--dry-run") || argv.includes("-n");
  const { root } = boardRoot();
  const { config } = createRepoOS(root);
  const result = runAttachmentMigration(config, { dryRun });
  printPlan(dryRun, result);
  if (result.errors.length && !dryRun) process.exitCode = 1;
}
