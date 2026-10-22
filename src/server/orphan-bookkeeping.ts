import { readFileSync } from "node:fs";
import { join, sep } from "node:path";
import { commitTaskFile, runGit } from "../core/git.js";

export async function commitStoryFileWithRetry(
  root: string,
  path: string,
  message: string,
  commit: typeof commitTaskFile = commitTaskFile,
): Promise<boolean> {
  for (let attempt = 0; attempt < 3; attempt++) {
    if (commit(root, path, message)) return true;
    if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 100 * (attempt + 1)));
  }
  return false;
}

/** Commits only untracked RepoOS-created Markdown in work/ or stories/. */
export async function sweepOrphanedBookkeeping(
  root: string,
  commit: typeof commitTaskFile = commitTaskFile,
): Promise<string[]> {
  const status = await runGit(
    root,
    ["-c", "core.quotepath=false", "status", "--porcelain", "--untracked-files=all"],
    10_000,
  );
  if (status.status !== 0) return [];
  const recovered: string[] = [];
  for (const line of status.stdout.split("\n")) {
    if (!line.startsWith("?? ")) continue;
    const path = line.slice(3).trim();
    if (!path.endsWith(".md") || !(path.startsWith("work/") || path.startsWith("stories/")))
      continue;
    const absolute = join(root, path);
    let contents: string;
    try {
      contents = readFileSync(absolute, "utf8");
    } catch {
      continue;
    }
    if (!/^created_by:\s*.+$/m.test(contents.split("---", 3)[1] ?? "")) continue;
    if (commit(root, absolute, `docs: recover orphaned ${path}`))
      recovered.push(path.split(sep).join("/"));
  }
  return recovered;
}
