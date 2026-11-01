/**
 * Whether a dirty `repoos.toml` is only automatic quota/pause bookkeeping (#0998).
 * Anything else — human settings, human pauses, comments, unknown keys, or a
 * parse failure — stays a close-out blocker.
 */
import { agentModelAllowRows } from "./budget-allowlist.js";
import { allowlistWithoutAutomaticPauses } from "./budget-runtime-state.js";
import { parseFlatToml } from "./config.js";

function commentLines(text: string): string[] {
  return text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .filter((line) => /^\s*#/.test(line));
}

/** Lines the toml parser skips that are not blanks or comments. */
function looseLines(text: string): string[] {
  return text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .filter((line) => !/^\[\[?[^\]]+\]\]?$/.test(line))
    .filter((line) => !/^[A-Za-z0-9_.-]+\s*=/.test(line));
}

function normalized(text: string): string {
  const parsed = parseFlatToml(text);
  if (parsed["budget.allowlist"] !== undefined) {
    parsed["budget.allowlist"] = allowlistWithoutAutomaticPauses(
      agentModelAllowRows(parsed["budget.allowlist"]),
    );
  }
  return JSON.stringify(parsed);
}

export function repoosTomlDiffIsAutomaticPauseOnly(head: string, work: string): boolean {
  try {
    const headParsed = JSON.stringify(parseFlatToml(head));
    const workParsed = JSON.stringify(parseFlatToml(work));
    if (commentLines(head).join("\n") !== commentLines(work).join("\n")) return false;
    if (looseLines(head).join("\n") !== looseLines(work).join("\n")) return false;
    if (headParsed === workParsed) return false;
    return normalized(head) === normalized(work);
  } catch {
    return false;
  }
}
