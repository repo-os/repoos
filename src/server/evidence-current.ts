import { bookkeepingDirs } from "../core/config.js";
import type { RepoOSConfig } from "../core/types.js";
import { runGit } from "../core/git.js";

/** True when the captured commit still describes the reviewed tree. Git errors fail closed. */
export async function isEvidenceCurrent(
  root: string | null | undefined,
  capturedSha: string | null | undefined,
  headSha: string | null | undefined,
  config: Pick<RepoOSConfig, "workDir" | "inputsDir" | "storiesDir">,
): Promise<boolean> {
  const captured = capturedSha?.trim();
  const head = headSha?.trim();
  if (!root || !captured || !head) return false;
  if (captured === head) return true;
  const result = await runGit(root, ["diff", "--name-only", captured, head], 10_000);
  if (result.status !== 0) return false;
  const dirs = bookkeepingDirs(config);
  const prefixes = [dirs.workDir, dirs.inputsDir, dirs.storiesDir, "reminders", "schedules", ".repoos"]
    .map((path) => path.replace(/^\/+|\/+$/g, ""))
    .filter(Boolean);
  const paths = result.stdout.split("\n").map((path) => path.trim()).filter(Boolean);
  return paths.every((path) =>
    prefixes.some((prefix) => path === prefix || path.startsWith(`${prefix}/`)) ||
    path.startsWith("work/.attachments/") || path.startsWith("inputs/.attachments/"),
  );
}
