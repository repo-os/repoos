/**
 * Per-agent-run temporary directories (#0989). Managed agent CLIs (notably Bun-
 * compiled opencode) extract shared libraries into $TMPDIR and never remove them.
 * RepoOS gives each spawn its own directory under the repo cache and deletes it
 * when the run ends; orphans from a crashed server are swept on the next boot.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

export const AGENT_RUN_TMP_DIRNAME = "agent-run-tmp";

/**
 * Root where per-run dirs live: `~/.repoos/agent-run-tmp/<repo hash>/`.
 *
 * It must be OUTSIDE every git checkout. Under `<repo>/.repoos` the children's
 * TMPDIR sat inside the main repo, so any test that made a throwaway directory
 * and asked "is this a git repo?" walked up into the real checkout and failed
 * (38 failures in 20 files in an engineer's own full-suite run). The hash keeps
 * two checkouts' runs apart. Tests may redirect it with REPOOS_AGENT_TMP_HOME.
 * `cacheDir` stays in the signature for call-site compatibility.
 */
export function agentRunTmpRoot(repoRoot: string, _cacheDir: string): string {
  const home = process.env.REPOOS_AGENT_TMP_HOME?.trim() || join(homedir(), ".repoos");
  const repoKey = createHash("sha1").update(resolve(repoRoot)).digest("hex").slice(0, 12);
  return join(home, AGENT_RUN_TMP_DIRNAME, repoKey);
}

export interface AgentRunTmpHandle {
  /** Absolute path passed to the child as TMPDIR/TMP/TEMP/BUN_TMPDIR. */
  dir: string;
  /** Idempotent best-effort removal of {@link dir}. */
  cleanup: () => void;
}

/**
 * Create (or reuse) the per-run directory named by `runId`. The id matches
 * AgentRunner's run id so boot sweeps can preserve dirs for adopted children.
 */
export function prepareAgentRunTmpdir(
  repoRoot: string,
  cacheDir: string,
  runId: string,
): AgentRunTmpHandle {
  const root = agentRunTmpRoot(repoRoot, cacheDir);
  mkdirSync(root, { recursive: true });
  const dir = join(root, runId);
  mkdirSync(dir, { recursive: true });
  let cleaned = false;
  const cleanup = (): void => {
    if (cleaned) return;
    cleaned = true;
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      /* process may still be unwinding; boot sweep catches orphans */
    }
  };
  return { dir, cleanup };
}

/** Remove a per-run directory by id (idempotent; safe after reload adoption). */
export function removeAgentRunTmpdir(repoRoot: string, cacheDir: string, runId: string): void {
  const root = agentRunTmpRoot(repoRoot, cacheDir);
  try {
    rmSync(join(root, runId), { recursive: true, force: true });
    if (existsSync(root) && readdirSync(root).length === 0) {
      rmSync(root, { recursive: true, force: true });
    }
  } catch {
    /* already gone */
  }
}

/** Standard isolated TMPDIR opts for repo-scoped one-shot agent runs (#0989). */
export function repoAgentRunTmpOpts(config: { root: string; cacheDir?: string }): {
  repoRoot: string;
  cacheDir: string;
} {
  return { repoRoot: config.root, cacheDir: config.cacheDir ?? ".repoos" };
}

/** Point a child environment at an isolated temp directory. */
export function applyAgentRunTmpEnv(env: NodeJS.ProcessEnv, dir: string): void {
  env.TMPDIR = dir;
  env.TMP = dir;
  env.TEMP = dir;
  env.BUN_TMPDIR = dir;
}

/**
 * Remove orphaned per-run directories left when the server died mid-run.
 * Preserves dirs whose `runId` is still listed in `preserveRunIds` (adopted
 * agent children from the durable registry).
 */
export function sweepStaleAgentRunTmpdirs(
  repoRoot: string,
  cacheDir: string,
  opts: { preserveRunIds?: readonly string[] } = {},
): number {
  const root = agentRunTmpRoot(repoRoot, cacheDir);
  if (!existsSync(root)) return 0;
  const preserve = new Set(opts.preserveRunIds ?? []);
  let removed = 0;
  for (const name of readdirSync(root)) {
    if (preserve.has(name)) continue;
    try {
      rmSync(join(root, name), { recursive: true, force: true });
      removed++;
    } catch {
      /* leave for a later sweep */
    }
  }
  return removed;
}
