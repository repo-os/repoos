/** Conservative classification for the docs/bookkeeping check shortcut. */
export const DOCS_ONLY_SKIP_REASON = "docs/bookkeeping-only diff: full suite skipped";

export type DocsOnlyCheckOptions = {
  /** Close-out only: a no-op merge yields zero paths but still need not rebuild. */
  allowEmpty?: boolean;
};

export function isDocsOnlyCheck(
  paths: string[] | null | undefined,
  enabled = true,
  options?: DocsOnlyCheckOptions,
): boolean {
  if (!enabled || !paths) return false;
  if (paths.length === 0) return options?.allowEmpty === true;
  return paths.every((path) => {
    const p = path.replace(/\\/g, "/").replace(/^\.\//, "");
    if (!p || p.startsWith("/") || p.split("/").includes("..")) return false;
    if (/^(src|scripts|tests|\.githooks)\//.test(p)) return false;
    const name = p.split("/").at(-1) ?? "";
    if (
      [
        "package.json",
        "repoos.toml",
        "bun.lock",
        "bun.lockb",
        "package-lock.json",
        "pnpm-lock.yaml",
        "yarn.lock",
      ].includes(name)
    )
      return false;
    return /^(work|docs|user-docs|inputs|schedules)\//.test(p) || p.endsWith(".md");
  });
}
