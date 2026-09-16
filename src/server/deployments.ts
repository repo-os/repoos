/**
 * Deployments status + push actions (#0340).
 *
 * Where `release.ts` models one versioned artifact, this module models the
 * grid of configured [[deployments]] rows (service × branch) and the shared
 * branch state behind them. Everything here is plain git against the already-
 * configured `origin` remote — no provider API calls, no new credentials.
 * Cloudflare (or any git-connected host) rebuilds from the push; whether that
 * build succeeded is deliberately out of scope for v1.
 */
import { spawn } from "node:child_process";
import { mainCheckoutRoot } from "../core/config.js";
import type { DeploymentConfig, RepoOSConfig } from "../core/types.js";

export interface DeploymentRow {
  name: string;
  /** Groups this row with others of the same service across branches (#0365). Defaults to `name`. */
  service: string;
  branch: string;
  /** Plain provider label from config (e.g. "cloudflare-workers"). */
  provider: string | null;
  /** The live URL — the row's primary link. */
  url: string | null;
  /** Optional provider-dashboard URL, also rendered as a link when present. */
  dashboardUrl: string | null;
  /** Subdirectory the freshness lookup was scoped to, when configured. */
  subdir: string | null;
  /** ISO timestamp of the last commit on the branch touching the subdir. */
  lastPushAt: string | null;
  /** Short SHA of that commit. */
  lastPushSha: string | null;
  /**
   * Subdir-scoped version of the branch's `mainSync` ahead/behind counts
   * (#0367): of the commits separating origin/<branch> from local main, how
   * many actually touch THIS row's subdir. Null when no `subdir` is
   * configured (the branch-level count already is this row's scope) or when
   * either ref couldn't be resolved.
   */
  changesVsMain: { aheadOfMain: number; behindMain: number } | null;
}

export interface DeploymentBranch {
  branch: string;
  /** Commits on local <branch> missing from origin/<branch>; null when the remote ref is unknown. */
  ahead: number | null;
  /** Commits on origin/<branch> missing from local <branch>. */
  behind: number | null;
  /** True when origin/<branch> resolves at all. */
  hasOrigin: boolean;
  /** True when the local branch exists (a configured-but-unborn branch can't deploy). */
  localExists: boolean;
  /**
   * When set, "Deploy" fast-forwards this branch to this configured branch
   * before pushing (e.g. prod ← main). Recomputed from actual git ancestry —
   * a branch equal to its neighbor (just deployed) drops back to a plain push.
   */
  ffFrom: string | null;
  /**
   * Where the DEPLOYED ref (`origin/<branch>`) stands relative to the LOCAL
   * `main` branch (#0365) — the headline sync metric, replacing the raw
   * ahead/behind-vs-own-origin chips. "same": origin/<branch> == local main.
   * "behind": origin/<branch> is a strict ancestor of local main (deploying
   * would fast-forward it up to date — see the `ffFrom` badge). "ahead":
   * local main is a strict ancestor of origin/<branch> (the deployed ref has
   * commits local main lacks — unusual, e.g. a hotfix landed directly on this
   * branch). "diverged": neither is an ancestor of the other. "unknown": no
   * origin/<branch>, or no local `main` ref to compare against.
   */
  mainSync: {
    state: "same" | "behind" | "ahead" | "diverged" | "unknown";
    /** Commits on origin/<branch> missing from local main (0 unless "ahead"/"diverged"). */
    aheadOfMain: number;
    /** Commits on local main missing from origin/<branch> (0 unless "behind"/"diverged"). */
    behindMain: number;
  };
}

export interface DeploymentsStatus {
  enabled: boolean;
  rows: DeploymentRow[];
  branches: DeploymentBranch[];
  /** Main checkout the git state was read from (a preview worktree resolves here). */
  root: string | null;
  /** Uncommitted changes in the main checkout — blocks every deploy. */
  dirty: boolean;
  /** Branch the main checkout is currently on (informational). */
  currentBranch: string | null;
}

export interface DeployResult {
  ok: boolean;
  output: string;
}

interface CommandResult {
  code: number | null;
  stdout: string;
  stderr: string;
  error?: Error;
}
export type DeployCommandRunner = (
  command: string,
  args: string[],
  cwd: string,
  timeout?: number,
) => Promise<CommandResult>;

export function captureOutput(stdout: string, stderr: string): string {
  return [stdout.trim(), stderr.trim()].filter(Boolean).join("\n");
}

const run: DeployCommandRunner = (command, args, cwd, timeout = 30_000) =>
  new Promise((resolveRun) => {
    const child = spawn(command, args, { cwd, env: process.env });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const finish = (code: number | null, error?: Error): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolveRun({ code, stdout, stderr, error });
    };
    child.stdout.on("data", (data: Buffer) => (stdout += data.toString("utf8")));
    child.stderr.on("data", (data: Buffer) => (stderr += data.toString("utf8")));
    child.on("error", (error: Error) => finish(null, error));
    child.on("close", (code) => finish(code));
    const timer = setTimeout(() => child.kill("SIGKILL"), timeout);
  });

export function configuredDeployments(config: RepoOSConfig): DeploymentConfig[] {
  return Array.isArray(config.deployments) ? config.deployments : [];
}

/**
 * The checkout deploys run against: the MAIN checkout, even when the server is
 * serving a task preview from a linked worktree — branch refs are shared
 * across worktrees, but dirty-state and branch-health belong to the checkout
 * the user actually manages (same resolution rule as board reads, #0068).
 */
export function deployRoot(config: RepoOSConfig): string {
  return mainCheckoutRoot(config.root) ?? config.root;
}

/** Distinct configured branches, in first-appearance order. */
export function deploymentBranches(rows: DeploymentConfig[]): string[] {
  const seen: string[] = [];
  for (const row of rows) if (!seen.includes(row.branch)) seen.push(row.branch);
  return seen;
}

function cmd(exec: DeployCommandRunner, args: string[], cwd: string, timeout?: number) {
  return exec("git", args, cwd, timeout);
}

/**
 * The local branch every deployment target's sync status is measured against
 * (#0365) — this repo's (and most repos') trunk, matching the same "main"
 * assumption `release.ts` already makes for cutting a release. Not sourced
 * from config: making this configurable is real scope this task explicitly
 * deferred (the user accepted the simplification of comparing every branch,
 * including prod, against local main directly rather than a stricter
 * prod-vs-origin/main chain).
 */
const SYNC_REFERENCE_BRANCH = "main";

/**
 * Where `origin/<branch>` (the deployed ref) stands relative to the local
 * `main` branch (#0365) — see `DeploymentBranch.mainSync`.
 */
async function branchVsMain(
  exec: DeployCommandRunner,
  branch: string,
  cwd: string,
): Promise<DeploymentBranch["mainSync"]> {
  const unknown = { state: "unknown" as const, aheadOfMain: 0, behindMain: 0 };
  const origin = `origin/${branch}`;
  const [originRef, mainRef] = await Promise.all([
    cmd(exec, ["rev-parse", "--verify", "--quiet", origin], cwd),
    cmd(exec, ["rev-parse", "--verify", "--quiet", SYNC_REFERENCE_BRANCH], cwd),
  ]);
  if (originRef.code !== 0 || mainRef.code !== 0) return unknown;
  const [aheadRes, behindRes] = await Promise.all([
    cmd(exec, ["rev-list", "--count", `${SYNC_REFERENCE_BRANCH}..${origin}`], cwd),
    cmd(exec, ["rev-list", "--count", `${origin}..${SYNC_REFERENCE_BRANCH}`], cwd),
  ]);
  if (aheadRes.code !== 0 || behindRes.code !== 0) return unknown;
  const aheadOfMain = Number(aheadRes.stdout.trim()) || 0;
  const behindMain = Number(behindRes.stdout.trim()) || 0;
  const state =
    aheadOfMain === 0 && behindMain === 0
      ? "same"
      : aheadOfMain === 0
        ? "behind"
        : behindMain === 0
          ? "ahead"
          : "diverged";
  return { state, aheadOfMain, behindMain };
}

/**
 * Same question as `branchVsMain`, scoped to one service's `subdir` (#0367):
 * of the commits separating `origin/<branch>` from local `main`, how many
 * actually touch this subtree? The branch-level count is honestly whole-
 * branch (a repo doing unrelated work between deploys inflates it), which
 * reads as misleading next to a specific service — this answers "does any of
 * that distance actually apply to what I'm looking at."
 *
 * Returns null when there's nothing to scope (no subdir configured — the
 * branch-level count already IS this row's scope) or when either ref can't
 * be resolved (mirrors `branchVsMain`'s "unknown" case without a redundant
 * ref-existence check, since a branch's own `branchVsMain` result already
 * covers that call site).
 */
async function subdirVsMain(
  exec: DeployCommandRunner,
  branch: string,
  subdir: string | undefined,
  cwd: string,
): Promise<{ aheadOfMain: number; behindMain: number } | null> {
  if (!subdir) return null;
  const origin = `origin/${branch}`;
  const [aheadRes, behindRes] = await Promise.all([
    cmd(exec, ["rev-list", "--count", `${SYNC_REFERENCE_BRANCH}..${origin}`, "--", subdir], cwd),
    cmd(exec, ["rev-list", "--count", `${origin}..${SYNC_REFERENCE_BRANCH}`, "--", subdir], cwd),
  ]);
  if (aheadRes.code !== 0 || behindRes.code !== 0) return null;
  return {
    aheadOfMain: Number(aheadRes.stdout.trim()) || 0,
    behindMain: Number(behindRes.stdout.trim()) || 0,
  };
}

/**
 * Nearest configured branch that this branch can be fast-forwarded to: a
 * strict ancestor relationship (branch behind, never diverged), closest first.
 * Derived entirely from actual topology + config — no main/prod constants, so
 * a repo with differently named (or more than two) branches gets the right
 * pairing. Returns null when the branch should just be pushed as-is.
 */
export async function fastForwardSource(
  exec: DeployCommandRunner,
  branch: string,
  branches: string[],
  cwd: string,
): Promise<string | null> {
  const others = branches.filter((b) => b !== branch);
  if (!others.length) return null;
  const sha = await cmd(exec, ["rev-parse", branch], cwd);
  if (sha.code !== 0) return null;
  const candidates: { branch: string; distance: number }[] = [];
  for (const other of others) {
    const otherSha = await cmd(exec, ["rev-parse", other], cwd);
    if (otherSha.code !== 0) continue;
    if (otherSha.stdout.trim() === sha.stdout.trim()) continue; // equal ≠ strict ancestor
    const isAncestor = await cmd(exec, ["merge-base", "--is-ancestor", branch, other], cwd);
    if (isAncestor.code !== 0) continue;
    const distance = await cmd(exec, ["rev-list", "--count", `${branch}..${other}`], cwd);
    if (distance.code !== 0) continue;
    candidates.push({ branch: other, distance: Number(distance.stdout.trim()) || 0 });
  }
  candidates.sort((a, b) => a.distance - b.distance);
  return candidates[0]?.branch ?? null;
}

async function branchSummary(
  exec: DeployCommandRunner,
  branch: string,
  branches: string[],
  cwd: string,
): Promise<DeploymentBranch> {
  const origin = `origin/${branch}`;
  const [originRef, localRef] = await Promise.all([
    cmd(exec, ["rev-parse", "--verify", "--quiet", origin], cwd),
    cmd(exec, ["rev-parse", "--verify", "--quiet", branch], cwd),
  ]);
  const hasOrigin = originRef.code === 0;
  const localExists = localRef.code === 0;
  let ahead: number | null = null;
  let behind: number | null = null;
  if (hasOrigin) {
    const [aheadRes, behindRes] = await Promise.all([
      cmd(exec, ["rev-list", "--count", `${origin}..${branch}`], cwd),
      cmd(exec, ["rev-list", "--count", `${branch}..${origin}`], cwd),
    ]);
    if (aheadRes.code === 0) ahead = Number(aheadRes.stdout.trim()) || 0;
    if (behindRes.code === 0) behind = Number(behindRes.stdout.trim()) || 0;
  }
  const [ffFrom, mainSync] = await Promise.all([
    fastForwardSource(exec, branch, branches, cwd),
    branchVsMain(exec, branch, cwd),
  ]);
  return { branch, ahead, behind, hasOrigin, localExists, ffFrom, mainSync };
}

interface RowFreshnessAndSync {
  lastPushAt: string | null;
  lastPushSha: string | null;
  changesVsMain: DeploymentRow["changesVsMain"];
}

async function rowFreshness(
  exec: DeployCommandRunner,
  row: DeploymentConfig,
  cwd: string,
): Promise<RowFreshnessAndSync> {
  // The revision goes BEFORE `--`: `git log -1 <branch> -- <subdir>`. Appending
  // the branch after `--` would read it as a path, silently degrading to HEAD.
  const args = ["log", "-1", "--format=%cI%n%h", row.branch];
  if (row.subdir) args.push("--", row.subdir);
  const [res, changesVsMain] = await Promise.all([
    cmd(exec, args, cwd),
    subdirVsMain(exec, row.branch, row.subdir, cwd),
  ]);
  if (res.code !== 0) return { lastPushAt: null, lastPushSha: null, changesVsMain };
  const [at, sha] = res.stdout.trim().split("\n");
  return { lastPushAt: at?.trim() || null, lastPushSha: sha?.trim() || null, changesVsMain };
}

export async function getDeploymentsStatus(
  config: RepoOSConfig,
  exec: DeployCommandRunner = run,
): Promise<DeploymentsStatus> {
  const rows = configuredDeployments(config);
  if (!rows.length) {
    return {
      enabled: false,
      rows: [],
      branches: [],
      root: null,
      dirty: false,
      currentBranch: null,
    };
  }
  const cwd = deployRoot(config);
  const branches = deploymentBranches(rows);
  const [dirtRes, currentRes, ...summaries] = await Promise.all([
    cmd(exec, ["status", "--porcelain"], cwd),
    cmd(exec, ["branch", "--show-current"], cwd),
    ...branches.map((b) => branchSummary(exec, b, branches, cwd)),
  ]);
  // Freshness (+ subdir-scoped sync, #0367) is cached per (branch, subdir) —
  // two rows sharing both run one set of git calls, not two.
  const freshness = new Map<string, Promise<RowFreshnessAndSync>>();
  const resolvedRows: DeploymentRow[] = await Promise.all(
    rows.map(async (row) => {
      const key = `${row.branch}\u0000${row.subdir ?? ""}`;
      let pending = freshness.get(key);
      if (!pending) {
        pending = rowFreshness(exec, row, cwd);
        freshness.set(key, pending);
      }
      const f = await pending;
      return {
        name: row.name,
        service: row.service ?? row.name,
        branch: row.branch,
        provider: row.provider ?? null,
        url: row.url ?? null,
        dashboardUrl: row.dashboardUrl ?? null,
        subdir: row.subdir ?? null,
        lastPushAt: f.lastPushAt,
        lastPushSha: f.lastPushSha,
        changesVsMain: f.changesVsMain,
      };
    }),
  );
  return {
    enabled: true,
    rows: resolvedRows,
    branches: summaries,
    root: cwd,
    dirty: dirtRes.code === 0 ? dirtRes.stdout.trim() !== "" : true,
    currentBranch: currentRes.code === 0 ? currentRes.stdout.trim() || null : null,
  };
}

/**
 * Deploy one branch: a plain `git push origin <branch>`, or — when the branch
 * is strictly behind another configured branch (prod behind main) — a
 * fast-forward of the local ref first, then the push. The fast-forward uses
 * `git merge --ff-only <src>` when the checkout is ON that branch (git refuses
 * to fetch into a checked-out branch) and `git fetch . <src>:<branch>` — which
 * git itself refuses on non-fast-forward — otherwise. There is no code path
 * that pushes with --force: every non-fast-forward case fails loudly with
 * git's own refusal in the output.
 */
export async function deployBranch(
  config: RepoOSConfig,
  branch: string,
  exec: DeployCommandRunner = run,
): Promise<DeployResult> {
  const rows = configuredDeployments(config);
  if (!rows.length)
    return { ok: false, output: "Deployments are not configured for this repository." };
  if (!deploymentBranches(rows).includes(branch))
    return { ok: false, output: `"${branch}" is not a configured deployment branch.` };
  const cwd = deployRoot(config);
  const dirty = await cmd(exec, ["status", "--porcelain"], cwd);
  if (dirty.code !== 0)
    return { ok: false, output: "Could not read the git status of the checkout." };
  if (dirty.stdout.trim() !== "")
    return {
      ok: false,
      output:
        "The checkout has uncommitted changes — commit or stash them before deploying. " +
        "This is the same dirty-tree guard `just release` uses.",
    };
  const local = await cmd(exec, ["rev-parse", "--verify", "--quiet", branch], cwd);
  if (local.code !== 0)
    return {
      ok: false,
      output:
        `No local branch "${branch}" exists in this checkout — fetch or create it before deploying ` +
        `(e.g. git fetch origin "${branch}:" then git checkout "${branch}").`,
    };

  const branches = deploymentBranches(rows);
  const src = await fastForwardSource(exec, branch, branches, cwd);
  if (src) {
    // On the target branch, `fetch . src:branch` refuses ("refusing to fetch
    // into branch … checked out"); merge --ff-only is the equivalent ref move
    // there, and equally refuses a non-fast-forward.
    const current = await cmd(exec, ["branch", "--show-current"], cwd);
    const onBranch = current.code === 0 && current.stdout.trim() === branch;
    const ff = onBranch
      ? await cmd(exec, ["merge", "--ff-only", src], cwd)
      : await cmd(exec, ["fetch", ".", `${src}:${branch}`], cwd);
    if (ff.code !== 0) {
      return {
        ok: false,
        output:
          `Could not fast-forward ${branch} to ${src} — the branches have diverged, ` +
          `so the deploy was refused rather than force-pushed.\n` +
          (captureOutput(ff.stdout, ff.stderr) || ff.error?.message || ""),
      };
    }
    const pushed = await cmd(exec, ["push", "origin", branch], cwd, 120_000);
    if (pushed.code !== 0) {
      return {
        ok: false,
        output:
          `Fast-forwarded ${branch} to ${src}, but the push to origin failed — the remote may have moved. ` +
          `Nothing was force-pushed; origin still has the old ${branch}. ` +
          `The local ${branch} is now at ${src}, so the NEXT deploy will be a plain push.\n` +
          (captureOutput(pushed.stdout, pushed.stderr) || pushed.error?.message || ""),
      };
    }
    return { ok: true, output: `Fast-forwarded ${branch} to ${src} and pushed to origin.` };
  }

  const pushed = await cmd(exec, ["push", "origin", branch], cwd, 120_000);
  if (pushed.code !== 0) {
    return {
      ok: false,
      output:
        `Could not push ${branch} to origin — the remote may have commits this checkout hasn't fetched. ` +
        `Nothing was force-pushed.\n` +
        (captureOutput(pushed.stdout, pushed.stderr) || pushed.error?.message || ""),
    };
  }
  return { ok: true, output: `Pushed ${branch} to origin.` };
}
