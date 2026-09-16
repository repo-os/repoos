#!/usr/bin/env bun
/**
 * Build only if stale, then serve — the task-preview entry point for this
 * repo's own `[preview] command` in repoos.toml.
 *
 * #0370 removed the special-cased "repoos" preview target (and with it,
 * `ensureFreshBuild`'s staleness check) in favor of every project — this
 * repo included — declaring a plain shell command. The command that landed,
 * `bun run build && bun dist/cli/index.js serve ...`, always rebuilds
 * unconditionally: a no-op rebuild on an already-fresh dist/ still costs
 * ~5s (measured), where the old code skipped straight to `serve` (~1s) when
 * nothing had changed — the common case, since the engineer's own
 * `repoos check` run before requesting review already builds. Confirmed via
 * user report (2026-09-16): previews here used to take 1-2s, not 5+.
 *
 * This restores that skip-if-fresh behavior without resurrecting the
 * removed special case in preview.ts itself — it's just what THIS repo's
 * own declared command runs, same as any project's command owns its own
 * build logic.
 */
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const buildInfoModule = new URL("../dist/core/build.js", import.meta.url);

let stale = true;
if (existsSync(buildInfoModule)) {
  try {
    const { checkBuildForRoot } = await import(buildInfoModule.href);
    const result = checkBuildForRoot(root);
    // `applicable: false` (no dist/, or this checkout doesn't use RepoOS's
    // build contract) also means "just build" — same as no marker at all.
    stale = result.stale || !result.applicable;
  } catch {
    // Corrupt/unreadable build-info — rebuild rather than risk serving
    // something we can't verify is current.
    stale = true;
  }
}

if (stale) {
  const build = spawnSync("bun", ["run", "build"], { stdio: "inherit" });
  if (build.status !== 0) process.exit(build.status ?? 1);
}

const serve = spawnSync("bun", ["dist/cli/index.js", "serve", ...process.argv.slice(2)], {
  stdio: "inherit",
});
process.exit(serve.status ?? 1);
