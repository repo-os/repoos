import { spawnSync } from "node:child_process";
import * as path from "node:path";

// Small, explicit safety net. Paths are relative to the Vitest project root.
export const DEFAULT_ALWAYS_RUN = [
  "**/close-out-gate-mode.test.ts",
  "**/handoff.test.ts",
  "**/git-worker-lifecycle.test.ts",
  "**/boot-timing.test.ts",
  "**/frontmatter.test.ts",
];

function matches(file, glob) {
  const normalized = file.replaceAll("\\", "/");
  const pattern = glob.replaceAll("\\", "/");
  // Vitest list emits absolute paths. Accept globs relative to its project root
  // as well as the repository root (monorepos can have different roots).
  const parts = normalized.split("/");
  if (typeof path.matchesGlob === "function") {
    return parts.some((_, index) => path.matchesGlob(parts.slice(index).join("/"), pattern));
  }
  // Node 20 fallback for the documented *, ** forms; Bun and Node 22+ use
  // the native matcher, including brace/extglob syntax.
  const regex = pattern
    .split("**")
    .map((part) =>
      part
        .split("*")
        .map((s) => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
        .join("[^/]*"),
    )
    .join(".*");
  return parts.some((_, index) => new RegExp(`^${regex}$`).test(parts.slice(index).join("/")));
}

/** Resolve the UNION before running: --changed plus positional filters is an intersection. */
export function selectTestFiles({ ref, alwaysRun = DEFAULT_ALWAYS_RUN, list, git }) {
  try {
    const base = git(["merge-base", "HEAD", ref]);
    if (!base) throw new Error("no merge base");
    // Vitest can hide git errors as an empty selection; explicitly verify git first.
    git(["diff", "--name-only", base, "--"]);
    const changed = list(base);
    const all = list();
    if (
      !Array.isArray(changed) ||
      !Array.isArray(all) ||
      [...changed, ...all].some((f) => typeof f !== "string")
    )
      throw new Error("invalid test list");
    return {
      files: [...new Set([...changed, ...all.filter((f) => alwaysRun.some((g) => matches(f, g)))])],
      base,
    };
  } catch (error) {
    return {
      files: null,
      warning: `Cannot compute changed tests (${error.message}); running the full suite`,
    };
  }
}

export function resolveTestSelection(runtime, vitest, config, ref, alwaysRun, cwd) {
  const run = (command, args) => {
    const result = spawnSync(command, args, {
      cwd,
      encoding: "utf8",
      timeout: 120_000,
      maxBuffer: 16 * 1024 * 1024,
    });
    if (result.status !== 0 || result.error)
      throw new Error(
        result.error?.message ??
          `${command} exited ${result.status}: ${result.stderr?.trim().slice(-500) ?? ""}`,
      );
    return result.stdout.trim();
  };
  return selectTestFiles({
    ref,
    alwaysRun,
    git: (args) => run("git", args),
    list: (base) =>
      JSON.parse(
        run(runtime, [
          vitest,
          "list",
          "--config",
          config,
          "--filesOnly",
          "--json",
          ...(base ? ["--changed", base] : []),
        ]),
      ).map((entry) => (typeof entry === "string" ? entry : entry.file)),
  });
}
