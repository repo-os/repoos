/**
 * The first product-release provider.  It intentionally knows only how to
 * confirm and push a git tag: CI remains the system that builds/deploys it.
 * This makes the integration useful without baking a GitHub or npm client
 * into RepoOS's zero-dependency core.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { join, relative, resolve } from "node:path";
import type { ReleaseConfig, RepoOSConfig } from "../core/types.js";
import { captureOutput } from "./done.js";
import { listCachedReleaseNotes } from "./release-notes-cache.js";
import type { RemoteValidator } from "./remote-validation.js";
import {
  checkEnvAfterRemoteGate,
  runRemotePreReviewGate,
  spawnedRepoosCheckArgs,
} from "./pre-review-remote-gate.js";

export interface ReleaseStatus {
  enabled: boolean;
  supported: boolean;
  name: string;
  provider: string | null;
  branch: string;
  version: string | null;
  tag: string | null;
  latestTag: string | null;
  /** ISO date the latest tag was created (taggerdate, else commit date). */
  latestTagAt: string | null;
  /** Short SHA the latest tag points at. */
  latestTagSha: string | null;
  /**
   * Newest tag reachable from HEAD whose version has no prerelease suffix
   * (no "-"). Tracked separately from `latestTag` so cutting a beta/canary/rc
   * doesn't bury the last real stable release in the UI.
   */
  latestStableTag: string | null;
  head: string | null;
  clean: boolean;
  onReleaseBranch: boolean;
  tagExists: boolean;
  released: boolean;
  ready: boolean;
  blockers: string[];
  releaseUrl: string | null;
  workflowUrl: string | null;
}

export type ReleasePhase =
  | "preparing"
  | "committing"
  | "building"
  | "checking"
  | "pushing_main"
  | "tagging"
  | "pushing_tag";
export type ReleaseProgress = (phase: ReleasePhase, message: string) => void;

interface CommandResult {
  code: number | null;
  stdout: string;
  stderr: string;
  error?: Error;
}
export type ReleaseCommandRunner = (
  command: string,
  args: string[],
  cwd: string,
  timeout?: number,
  env?: NodeJS.ProcessEnv,
) => Promise<CommandResult>;
type Run = ReleaseCommandRunner;

const SEMVER =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

const run: Run = (command, args, cwd, timeout = 30_000, env) =>
  new Promise((resolveRun) => {
    const child = spawn(command, args, { cwd, env: env ?? process.env });
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

function configured(config: RepoOSConfig): ReleaseConfig | null {
  return config.release?.enabled === true ? config.release : null;
}

/**
 * Commit routine, server-written churn that landed on the release branch while
 * the multi-minute build+check was running, so it can't abort an otherwise
 * ready release. This mirrors the close-out publish guard's auto-checkpoint
 * (`integration-orchestrator.ts`): `repoos.toml` is always written whole by the
 * settings API (an agent's model changed, `maxActiveTasks`, …) and task files
 * under the work dir are bookkeeping stamps — a dirty moment in either is
 * expected traffic on a busy board, not a signal a human is mid-edit.
 *
 * Scoped narrowly: if ANY dirty path is outside that safe set (source, other
 * config, a stray artifact) nothing is committed and the caller fails closed
 * exactly as before. Returns true when a checkpoint commit was made.
 */
async function checkpointSafeChurn(config: RepoOSConfig, exec: Run): Promise<boolean> {
  const res = await exec("git", ["status", "--porcelain"], config.root);
  if (res.code !== 0) return false;
  const entries = res.stdout.split("\n").filter((l) => l.trim());
  if (entries.length === 0) return false;
  const workPrefix = `${config.workDir}/`;
  const paths = entries.map((l) => l.slice(3).replace(/^"|"$/g, "").split(" -> ").pop()!.trim());
  const isSafeChurn = (p: string): boolean => p === "repoos.toml" || p.startsWith(workPrefix);
  if (!paths.every(isSafeChurn)) return false;
  const added = await exec("git", ["add", "--", ...paths], config.root);
  if (added.code !== 0) return false;
  const committed = await exec(
    "git",
    ["commit", "-m", "chore: checkpoint bookkeeping/config before release"],
    config.root,
  );
  return committed.code === 0;
}

function safeVersionFile(root: string, filename: string): string | null {
  const absolute = resolve(root, filename);
  return relative(root, absolute).startsWith("..") ? null : absolute;
}

function versionFor(
  config: RepoOSConfig,
  release: ReleaseConfig,
  blockers: string[],
): string | null {
  const path = safeVersionFile(config.root, release.versionFile ?? "package.json");
  if (!path || !existsSync(path)) {
    blockers.push(`Version file ${release.versionFile ?? "package.json"} is missing.`);
    return null;
  }
  try {
    const version = JSON.parse(readFileSync(path, "utf8")).version;
    if (typeof version !== "string" || !SEMVER.test(version)) {
      blockers.push("The configured version must be a semantic version.");
      return null;
    }
    return version;
  } catch {
    blockers.push("The configured version file is not valid JSON.");
    return null;
  }
}

function githubUrl(repository: string | undefined, path: string): string | null {
  return repository && /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)
    ? `https://github.com/${repository}/${path}`
    : null;
}

export async function getReleaseStatus(
  config: RepoOSConfig,
  exec: Run = run,
): Promise<ReleaseStatus> {
  const release = configured(config);
  const empty: ReleaseStatus = {
    enabled: false,
    supported: false,
    name: "Releases",
    provider: null,
    branch: "main",
    version: null,
    tag: null,
    latestTag: null,
    latestTagAt: null,
    latestTagSha: null,
    latestStableTag: null,
    head: null,
    clean: false,
    onReleaseBranch: false,
    tagExists: false,
    released: false,
    ready: false,
    blockers: ["Releases are not configured for this repository."],
    releaseUrl: null,
    workflowUrl: null,
  };
  if (!release) return empty;
  const blockers: string[] = [];
  const branch = release.branch ?? "main";
  const provider = release.provider ?? "git-tag";
  const version = versionFor(config, release, blockers);
  const tag = version ? `${release.tagPrefix ?? "v"}${version}` : null;
  if (provider !== "git-tag") blockers.push(`Release provider "${provider}" is not installed.`);
  const [branchResult, dirtyResult, headResult, latestResult, tagResult] = await Promise.all([
    exec("git", ["branch", "--show-current"], config.root),
    exec("git", ["status", "--porcelain"], config.root),
    exec("git", ["rev-parse", "--short", "HEAD"], config.root),
    exec("git", ["describe", "--tags", "--abbrev=0"], config.root),
    tag
      ? exec("git", ["tag", "--list", tag], config.root)
      : Promise.resolve({ code: 1, stdout: "", stderr: "" }),
  ]);
  const currentBranch = branchResult.code === 0 ? branchResult.stdout.trim() : null;
  const latestTag = latestResult.code === 0 ? latestResult.stdout.trim() : null;
  // One extra cheap call: when the tag was cut and where it points, so the UI
  // can say "shipped 2h ago from 684b1d5" instead of just naming the tag.
  let latestTagAt: string | null = null;
  let latestTagSha: string | null = null;
  if (latestTag) {
    const meta = await exec(
      "git",
      ["log", "-1", "--format=%cI%n%h", `${latestTag}^{commit}`],
      config.root,
    );
    if (meta.code === 0) {
      const [at, sha] = meta.stdout.trim().split("\n");
      latestTagAt = at?.trim() || null;
      latestTagSha = sha?.trim() || null;
    }
  }
  // `git describe --tags --abbrev=0` above walks commit ancestry, so a beta
  // cut off HEAD reports as "the" latest tag even with stable releases in the
  // same history. Find the newest one that isn't a prerelease (no "-")
  // separately, so a channel cut never hides the last real stable release.
  let latestStableTag: string | null = null;
  const stableList = await exec(
    "git",
    ["tag", "--list", "--merged", "HEAD", "--sort=-creatordate"],
    config.root,
  );
  if (stableList.code === 0) {
    latestStableTag =
      stableList.stdout
        .split("\n")
        .map((t) => t.trim())
        .find((t) => t && !t.includes("-")) ?? null;
  }
  const clean = dirtyResult.code === 0 && dirtyResult.stdout.trim() === "";
  const onReleaseBranch = currentBranch === branch;
  const tagExists = !!tag && tagResult.code === 0 && tagResult.stdout.trim() === tag;
  if (!currentBranch) blockers.push("This checkout is not on a git branch.");
  else if (!onReleaseBranch)
    blockers.push(`Release from ${branch}; currently on ${currentBranch}.`);
  if (!clean) blockers.push("Commit or stash all working-tree changes first.");
  if (tagExists) blockers.push(`${tag} already exists.`);
  if (headResult.code !== 0) blockers.push("Could not read the current git commit.");
  return {
    enabled: true,
    supported: provider === "git-tag",
    name: release.name ?? "Cut release",
    provider,
    branch,
    version,
    tag,
    latestTag,
    latestTagAt,
    latestTagSha,
    latestStableTag,
    head: headResult.code === 0 ? headResult.stdout.trim() : null,
    clean,
    onReleaseBranch,
    tagExists,
    released: tagExists,
    ready: blockers.length === 0,
    blockers,
    releaseUrl: tag
      ? githubUrl(release.repository, `releases/tag/${encodeURIComponent(tag)}`)
      : null,
    workflowUrl: release.workflow
      ? githubUrl(release.repository, `actions/workflows/${release.workflow.split("/").pop()}`)
      : null,
  };
}

/**
 * The most recent AI-drafted release notes that never made it out with a
 * release, for the panel to offer as a retry (#0641).
 *
 * The draft cache stores the commit context (`head`, `sinceTag`) a draft was
 * made from, so "was this ever released?" is a git question over that stored
 * context rather than new state: a draft is *unpushed* while its generation
 * HEAD is not reachable from the latest release tag. Once a cut succeeds, the
 * fresh tag is created on top of that HEAD, so the draft drops out of the
 * result on the next read.
 */
export interface UnpushedReleaseNotes {
  notes: string;
  /** ISO timestamp of when the draft was generated. */
  createdAt: string;
  /** Full SHA of HEAD when the draft was generated. */
  head: string;
  /** Short SHA of that commit. */
  headShort: string;
  /** Tag the underlying draft range started after (context only). */
  sinceTag: string | null;
  /** Commits on the branch since the draft's context; null when unknown. */
  commitsBehind: number | null;
  /** Newest-first subjects of those commits, capped for the panel. */
  commits: string[];
  /** Current branch HEAD, so the panel can name the distance. */
  currentHead: string | null;
  currentHeadShort: string | null;
}

const UNPUSHED_NOTES_COMMIT_LIMIT = 5;

/**
 * The newest cached draft that was not released, or null. Walks cache entries
 * newest-first so an older-but-unreleased entry is still surfaced when a newer
 * one has since shipped. Uses the same `exec` seam as the rest of this module.
 */
export async function findUnpushedReleaseNotes(
  config: RepoOSConfig,
  exec: Run = run,
): Promise<UnpushedReleaseNotes | null> {
  const entries = listCachedReleaseNotes(config.root, config.cacheDir);
  if (!entries.length) return null;

  const [headRes, latestRes] = await Promise.all([
    exec("git", ["rev-parse", "HEAD"], config.root),
    exec("git", ["describe", "--tags", "--abbrev=0"], config.root),
  ]);
  const currentHead = headRes.code === 0 ? headRes.stdout.trim() || null : null;
  const latestTag = latestRes.code === 0 ? latestRes.stdout.trim() || null : null;

  for (const entry of entries) {
    if (!entry.head) continue;
    // Reachable from the latest release tag means it already shipped with that
    // release, so it is not the "unpushed" draft the panel is looking for.
    if (latestTag) {
      const anc = await exec(
        "git",
        ["merge-base", "--is-ancestor", entry.head, latestTag],
        config.root,
      );
      if (anc.code === 0) continue;
    }
    let commitsBehind: number | null = null;
    let commits: string[] = [];
    if (currentHead) {
      const countRes = await exec(
        "git",
        ["rev-list", "--count", `${entry.head}..${currentHead}`],
        config.root,
      );
      if (countRes.code === 0) {
        const count = Number(countRes.stdout.trim());
        if (Number.isFinite(count)) commitsBehind = count;
      }
      const logRes = await exec(
        "git",
        [
          "log",
          "-n",
          String(UNPUSHED_NOTES_COMMIT_LIMIT),
          "--pretty=format:%h %s",
          `${entry.head}..${currentHead}`,
        ],
        config.root,
      );
      if (logRes.code === 0) {
        commits = logRes.stdout
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean);
      }
    }
    const shortRes = await exec("git", ["rev-parse", "--short", entry.head], config.root);
    const shortHead = shortRes.code === 0 ? shortRes.stdout.trim() : "";
    return {
      notes: entry.notes,
      createdAt: entry.createdAt,
      head: entry.head,
      headShort: shortHead || entry.head.slice(0, 7),
      sinceTag: entry.sinceTag,
      commitsBehind,
      commits,
      currentHead,
      currentHeadShort: currentHead ? currentHead.slice(0, 7) : null,
    };
  }
  return null;
}

/**
 * Commit subjects to draft release notes from, and the range they cover.
 */
export interface ReleaseCommits {
  /** Tag the range starts after, or null when no previous release exists. */
  sinceTag: string | null;
  /**
   * Full SHA of HEAD while the range was collected, or null when it couldn't
   * be read. Kept as metadata for the release-notes cache entry.
   */
  head: string | null;
  /**
   * `git log` subject lines, newest first — **release-relevant commits only**
   * (#0605): commits whose file changes all sit under the work dir are
   * RepoOS's own task bookkeeping, not product changes, so they are dropped
   * from the notes' input (and from the draft's cache key) and the "new
   * commit is on main" feeling they'd otherwise cause every time a task
   * moves. Empty commits (no file changes at all) are never classified
   * bookkeeping — an empty commit touched nothing, so it can't be assumed
   * churn.
   */
  commits: string[];
  /**
   * Full SHAs backing `commits`, in the same order (newest first). The
   * release-notes cache key hashes this list with `sinceTag`: adding a
   * bookkeeping-only commit leaves it unchanged, so the saved draft still
   * hits, while any source commit changes it (task #0605).
   */
  relevantShas: string[];
  /** True when more commits existed than `limit` and the oldest were dropped. */
  truncated: boolean;
}

/**
 * True when a commit's file changes are all RepoOS bookkeeping under the work
 * dir — the task files the board writes itself. Only commits WITH files can
 * be bookkeeping: an empty commit changed nothing, so it stays.
 */
function isWorkDirOnly(paths: string[], workDir: string): boolean {
  if (paths.length === 0) return false;
  const prefix = `${workDir}/`;
  return paths.every((p) => p === workDir || p.startsWith(prefix));
}

/**
 * Collect the commit subjects an AI draft of release notes should summarize:
 * everything since the last reachable tag, or the whole history when no
 * release has been cut yet (task #0361's stated fallback). Capped at `limit`
 * raw commits so a long history can't blow the prompt; the newest commits
 * win, and `truncated` tells the caller the oldest were dropped. `head` is
 * resolved alongside the range; `relevantShas` carries the release-relevant
 * subset a draft's cache key is built from (#0590, #0605).
 */
export async function collectReleaseCommits(
  config: RepoOSConfig,
  exec: Run = run,
  limit = 300,
): Promise<ReleaseCommits> {
  const headRes = await exec("git", ["rev-parse", "HEAD"], config.root);
  const head = headRes.code === 0 ? headRes.stdout.trim() || null : null;
  const latest = await exec("git", ["describe", "--tags", "--abbrev=0"], config.root);
  const sinceTag = latest.code === 0 ? latest.stdout.trim() || null : null;
  const range = sinceTag ? `${sinceTag}..HEAD` : "HEAD";
  // One atomic call. Each record starts with `\x1e` so the record boundary is
  // unambiguous regardless of how git spaces the `--name-only` path lines
  // that follow the one-line `%H \x1f %h \x1f %s` header; the paths that
  // follow belong to the record just ended, not the next one.
  const res = await exec(
    "git",
    ["log", range, "-n", String(limit + 1), "--pretty=format:%x1e%H%x1f%h%x1f%s", "--name-only"],
    config.root,
  );
  const raw = res.code === 0 ? res.stdout : "";
  interface Record {
    sha: string;
    shortSha: string;
    subject: string;
    paths: string[];
  }
  const records: Record[] = [];
  for (const block of raw.split("\x1e")) {
    const lines = block.split("\n");
    const header = lines[0] ?? "";
    const [sha, shortSha, subject] = header.split("\x1f");
    if (!sha?.trim()) continue;
    records.push({
      sha: sha.trim(),
      shortSha: shortSha?.trim() || sha.trim().slice(0, 7),
      subject: (subject ?? "").trim(),
      paths: lines
        .slice(1)
        .map((l) => l.trim())
        .filter((p) => p !== ""),
    });
  }
  const truncated = records.length > limit;
  const inScope = truncated ? records.slice(0, limit) : records;
  const relevant = inScope.filter((r) => !isWorkDirOnly(r.paths, config.workDir));
  return {
    head,
    sinceTag,
    commits: relevant.map((r) => `${r.shortSha} ${r.subject}`),
    relevantShas: relevant.map((r) => r.sha),
    truncated,
  };
}

/**
 * One-shot prompt for drafting release notes from a commit list. Pure and
 * exported so the wording is unit-testable without spawning an agent.
 */
export function releaseNotesPrompt(
  commits: string[],
  opts: { sinceTag: string | null; version: string | null; truncated?: boolean },
): string {
  const context = [
    opts.version ? `Upcoming version: ${opts.version}` : null,
    opts.sinceTag
      ? `Commits since the previous release (${opts.sinceTag}):`
      : "There is no previous release tag, so the commits below are the repository's full history:",
    opts.truncated ? "(Older commits were omitted for length.)" : null,
  ]
    .filter((line): line is string => !!line)
    .join("\n");
  return [
    "Draft release notes for the next version of this software, written for the people who use it.",
    "",
    context,
    "",
    commits.join("\n"),
    "",
    "Write concise, user-facing release notes in Markdown. Summarize what changed and why it matters to a user; group related changes under short headings only when it helps. Lead with the most significant change. Do not invent changes that the commits do not support. Output only the release notes themselves — no version heading, no date, no preamble, and no commentary about these instructions.",
  ].join("\n");
}

export async function cutNewRelease(
  config: RepoOSConfig,
  version: string,
  confirmTag: string,
  exec: Run = run,
  onProgress?: ReleaseProgress,
  /**
   * Runs the expensive half of the gate (build + test) on a cloud VM when
   * `config.remoteValidation.enabled && remoteValidation.useForReleases` — see
   * docs/remote-validation.md. Undefined disables remote validation regardless
   * of config, so the release falls back to the full local `repoos check`.
   */
  remoteValidator?: RemoteValidator,
  /**
   * Optional human/AI-authored release notes. Written into the annotated tag's
   * body (the git-native release record this provider creates), where CI reads
   * them back as the GitHub release body. Empty/undefined keeps the previous
   * `Release <tag>` annotation exactly as before.
   */
  notes?: string,
): Promise<{ ok: boolean; status: ReleaseStatus; output: string }> {
  onProgress?.("preparing", "Validating the configured branch and release version…");
  let status = await getReleaseStatus(config, exec);
  if (!status.clean && (await checkpointSafeChurn(config, exec))) {
    status = await getReleaseStatus(config, exec);
  }
  const release = configured(config);
  const tag = `${release?.tagPrefix ?? "v"}${version}`;
  if (
    !release ||
    !status.supported ||
    !status.clean ||
    !status.onReleaseBranch ||
    !SEMVER.test(version) ||
    confirmTag !== tag
  ) {
    return {
      ok: false,
      status,
      output: "Release needs a clean configured branch and an exact semantic-version confirmation.",
    };
  }
  const existing = await exec("git", ["tag", "--list", tag], config.root);
  if (existing.code === 0 && existing.stdout.trim() === tag) {
    return { ok: false, status, output: `${tag} already exists.` };
  }
  const versionPath = safeVersionFile(config.root, release.versionFile ?? "package.json");
  if (!versionPath || !existsSync(versionPath)) {
    return { ok: false, status, output: "Configured version file is missing." };
  }
  // The release version is a committed source-of-truth change. A retry for a
  // version already committed (for example after a transient tag push failure)
  // skips this block and safely resumes from the gate.
  if (status.version !== version) {
    onProgress?.("committing", `Committing the ${version} version bump…`);
    try {
      const manifest = JSON.parse(readFileSync(versionPath, "utf8")) as Record<string, unknown>;
      manifest.version = version;
      writeFileSync(versionPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    } catch {
      return { ok: false, status, output: "Could not update the configured version file." };
    }
    const relVersionPath = relative(config.root, versionPath);
    const staged = await exec("git", ["add", "--", relVersionPath], config.root);
    const committed =
      staged.code === 0
        ? await exec(
            "git",
            // `--only` commits just the version bump; a plain commit would take
            // the whole index and sweep in whatever else was staged (#0353).
            ["commit", "-o", "-m", `release: ${tag}`, "--", relVersionPath],
            config.root,
          )
        : staged;
    if (committed.code !== 0) {
      return {
        ok: false,
        status: await getReleaseStatus(config, exec),
        output:
          captureOutput(committed.stdout, committed.stderr) || "Could not commit the version bump.",
      };
    }
  }
  // Rebuild first. `repoos check`'s first gate is a src/-vs-dist/ staleness
  // check — any edit or `bun run fmt` since the operator's last build (or a
  // background agent's work) trips it and aborts the whole release. The release
  // artifact is built fresh by CI from the tag anyway, so a stale local dist is
  // irrelevant to what ships; building here makes the gate a non-issue and also
  // confirms the tree actually compiles before any ref is pushed.
  onProgress?.("building", "Rebuilding (bun run build)…");
  const build = await exec("bun", ["run", "build"], config.root, 600_000);
  if (build.code !== 0)
    return {
      ok: false,
      status,
      output:
        captureOutput(build.stdout, build.stderr) ||
        (build.error?.message.includes("ENOENT")
          ? "Could not run `bun run build` — is bun on PATH?"
          : "`bun run build` failed."),
    };
  // Remote Validation Runner (docs/remote-validation.md): hand the expensive
  // half of the gate — `bun install` + `bun run build` + `bun run test` — to a
  // disposable cloud VM, which is where `repoos check` flakes under local
  // memory pressure. Only when the operator has opted releases in
  // (`remoteValidation.useForReleases`), since close-out's runner is unattended
  // but a release is watched live in the modal and a ~1-2 min remote-provision
  // delay reads as a regression there. On a remote pass, the LOCAL `repoos
  // check` below runs only the cheap static guards + UI smoke (REPOOS_SKIP_TESTS=1).
  // A transient infra failure fails the release unless `remoteValidation.fallbackToLocal`
  // is set (then we drop to the full local gate); a real remote test failure is
  // non-retryable — fix it and cut again. Close-out's resume-from-check flow has
  // no release analogue, so neither transient case auto-retries.
  let remoteGateOutcome: Awaited<ReturnType<typeof runRemotePreReviewGate>> = { kind: "skip" };
  const rv = config.remoteValidation;
  if (remoteValidator && rv?.enabled && rv.useForReleases) {
    onProgress?.("checking", "Running remote validation on the runner…");
    remoteGateOutcome = await runRemotePreReviewGate({
      config,
      remoteValidator,
      worktreePath: config.root,
      taskId: "release",
      phase: "release",
      onChunk: (chunk) => onProgress?.("checking", chunk),
    });
    if (remoteGateOutcome.kind === "fail") {
      const infra = remoteGateOutcome.retryable;
      return {
        ok: false,
        status,
        output: infra
          ? `Remote validation unavailable (infrastructure): ${remoteGateOutcome.detail} — the release was not cut.`
          : `Remote validation failed: ${remoteGateOutcome.detail}`,
      };
    }
    if (remoteGateOutcome.kind === "local-only" && !remoteGateOutcome.skipTests) {
      onProgress?.(
        "checking",
        "Remote validation unavailable — falling back to the full local gate…",
      );
    }
  }
  // The same gate used for task close-out, before any remote ref is changed.
  onProgress?.("checking", "Running repoos check — this usually takes a few minutes.");
  const checkEnv: NodeJS.ProcessEnv = {
    ...process.env,
    // The rebuild above already refreshed dist/ (and its build marker), and
    // `bun run build` is staleness-aware now (#0377), so check's own "Full
    // build" step skips itself — no private skip env flag needed.
    ...checkEnvAfterRemoteGate(remoteGateOutcome),
    // Identify the caller to the check-run history (#0564): a release-phase
    // run, no task attached.
    REPOOS_CHECK_PHASE: "release",
    REPOOS_CHECK_STORE_ROOT: config.root,
  };
  const checkArgs = spawnedRepoosCheckArgs(config, remoteGateOutcome);
  const check = await exec(
    process.execPath,
    [join(config.root, "dist", "cli", "index.js"), "check", ...checkArgs],
    config.root,
    600_000,
    checkEnv,
  );
  if (check.code !== 0)
    return {
      ok: false,
      status,
      output: captureOutput(check.stdout, check.stderr) || "repoos check failed.",
    };
  status = await getReleaseStatus(config, exec);
  if ((!status.ready || status.tag !== tag) && !status.clean) {
    // A routine settings save or task-file bookkeeping write can land during
    // the multi-minute build+check window and flip `clean` false. Checkpoint
    // that safe churn rather than aborting a release that's ready to push.
    if (await checkpointSafeChurn(config, exec)) status = await getReleaseStatus(config, exec);
  }
  if (!status.ready || status.tag !== tag)
    return { ok: false, status, output: "Repository state changed while release checks ran." };
  onProgress?.("pushing_main", `Pushing ${status.branch}…`);
  const pushedMain = await exec(
    "git",
    ["push", release.remote ?? "origin", status.branch],
    config.root,
    120_000,
  );
  if (pushedMain.code !== 0) {
    return {
      ok: false,
      status,
      output:
        captureOutput(pushedMain.stdout, pushedMain.stderr) || `Could not push ${status.branch}.`,
    };
  }
  onProgress?.("tagging", `Creating annotated tag ${tag}…`);
  const trimmedNotes = notes?.trim();
  // `--cleanup=verbatim` keeps Markdown headings ("# " lines) verbatim.
  // Strictly a belt-and-braces move here: with `-m` supplied (never an
  // editor), git's default cleanup mode is already "whitespace", not
  // "strip" — it would not eat "#" lines on its own. `--cleanup=verbatim`
  // additionally skips the trailing-whitespace/blank-line trimming that
  // "whitespace" mode does, so it's the more literal, more future-proof
  // choice regardless. The first `-m` is the subject; the second is the
  // body CI reads.
  const createdTag = await exec(
    "git",
    trimmedNotes
      ? ["tag", "-a", tag, "--cleanup=verbatim", "-m", `Release ${tag}`, "-m", trimmedNotes]
      : ["tag", "-a", tag, "-m", `Release ${tag}`],
    config.root,
  );
  if (createdTag.code !== 0)
    return {
      ok: false,
      status,
      output: captureOutput(createdTag.stdout, createdTag.stderr) || "Could not create the tag.",
    };
  onProgress?.("pushing_tag", `Pushing ${tag} to trigger the release workflow…`);
  const pushed = await exec("git", ["push", release.remote ?? "origin", tag], config.root, 120_000);
  if (pushed.code !== 0) {
    await exec("git", ["tag", "-d", tag], config.root);
    return {
      ok: false,
      status: await getReleaseStatus(config, exec),
      output:
        captureOutput(pushed.stdout, pushed.stderr) ||
        "Could not push the tag; the local tag was removed.",
    };
  }
  return {
    ok: true,
    status: await getReleaseStatus(config, exec),
    output: `${tag} pushed. CI is now building the release — it becomes downloadable once that finishes.`,
  };
}
