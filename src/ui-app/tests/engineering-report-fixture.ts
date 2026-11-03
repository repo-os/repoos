import { execFileSync } from "node:child_process";
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

/** Give a handoff fixture the draft a real engineer supplies. */
export function seedEngineeringReport(worktree: string, id: string): void {
  const commonDir = execFileSync("git", ["rev-parse", "--git-common-dir"], {
    cwd: worktree,
    encoding: "utf8",
  }).trim();
  appendFileSync(join(resolve(worktree, commonDir), "info", "exclude"), "\n.repoos/\n");
  const dir = join(worktree, ".repoos", "engineering-report-drafts");
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, `${id}.md`),
    "## TL;DR\nSummary.\n\n## Work and rationale\nImplemented.\n\n## Approaches tried\nTested.\n\n## Challenges and blockers\nNone.\n\n## Key learnings\nKeep coverage.\n",
  );
}
