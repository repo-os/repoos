import { existsSync, realpathSync } from "node:fs";
import { resolve } from "node:path";
import { runGit } from "./git.js";

/** Fingerprint a directory entry without letting `git -C` escape into its parent repository. */
export async function gitDirectorySnapshot(
  repoRoot: string,
  relativePath: string,
  mode?: number,
): Promise<string | null> {
  const absolute = resolve(repoRoot, relativePath);
  const top = await runGit(absolute, ["rev-parse", "--show-toplevel"], 10_000);
  if (top.status === 0) {
    let isOwnRepository = false;
    try {
      isOwnRepository = realpathSync(top.stdout.trim()) === realpathSync(absolute);
    } catch {
      return null;
    }
    if (isOwnRepository) {
      const head = await runGit(absolute, ["rev-parse", "HEAD"], 10_000);
      const status = await runGit(absolute, ["status", "--porcelain", "--untracked-files=all"], 10_000);
      if (status.status !== 0) return null;
      let revision = head.stdout.trim();
      if (head.status !== 0) {
        const symbolicHead = await runGit(absolute, ["symbolic-ref", "-q", "HEAD"], 10_000);
        if (symbolicHead.status !== 0) return null;
        revision = "unborn";
      }
      return `repository:${mode ?? ""}:${revision}:${status.stdout}`;
    }
  }

  // An uninitialized gitlink is not a repository yet. Its authoritative
  // revision is the gitlink object recorded in the parent's index.
  const index = await runGit(repoRoot, ["ls-files", "-s", "--", relativePath], 10_000);
  if (index.status !== 0) return null;
  const entry = index.stdout.split(/\r?\n/).find((line) => line.endsWith(`\t${relativePath}`));
  if (!entry) return existsSync(resolve(absolute, ".git")) ? null : `directory:${mode ?? ""}:not-a-gitlink`;
  const match = entry.match(/^(\d+) ([0-9a-f]+) 0\t/);
  if (!match) return null;
  const [_, fileMode, objectId] = match;
  if (fileMode !== "160000") return `directory:${mode ?? ""}:${fileMode}:${objectId}`;
  return `gitlink:${objectId}`;
}
