/** Conservative classification for the docs/bookkeeping check shortcut. */
export const DOCS_ONLY_SKIP_REASON = "docs/bookkeeping-only diff: full suite skipped";

export function isDocsOnlyCheck(paths: string[] | null | undefined, enabled = true): boolean {
  if (!enabled || !paths) return false;
  return paths.every((path) => {
    const p = path.replace(/\\/g, "/").replace(/^\.\//, "");
    if (!p || p.startsWith("/") || p.split("/").includes("..")) return false;
    if (/^(src|scripts|tests|\.githooks)\//.test(p)) return false;
    return /^(work|docs|user-docs|inputs|schedules)\//.test(p) || p.endsWith(".md");
  });
}
