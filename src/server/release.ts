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

export interface ReleaseStatus {
  enabled: boolean;
  supported: boolean;
  name: string;
  provider: string | null;
  branch: string;
  version: string | null;
  tag: string | null;
  latestTag: string | null;
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
) => Promise<CommandResult>;
type Run = ReleaseCommandRunner;

const SEMVER =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

const run: Run = (command, args, cwd, timeout = 30_000) =>
  new Promise((resolveRun) => {
    const child = spawn(command, args, { cwd });
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
    latestTag: latestResult.code === 0 ? latestResult.stdout.trim() : null,
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

export async function cutNewRelease(
  config: RepoOSConfig,
  version: string,
  confirmTag: string,
  exec: Run = run,
  onProgress?: ReleaseProgress,
): Promise<{ ok: boolean; status: ReleaseStatus; output: string }> {
  onProgress?.("preparing", "Validating the configured branch and release version…");
  let status = await getReleaseStatus(config, exec);
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
        ? await exec("git", ["commit", "-m", `release: ${tag}`], config.root)
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
  // The same gate used for task close-out, before any remote ref is changed.
  onProgress?.("checking", "Running repoos check — this usually takes a few minutes.");
  const check = await exec(
    process.execPath,
    [join(config.root, "dist", "cli", "index.js"), "check"],
    config.root,
    600_000,
  );
  if (check.code !== 0)
    return {
      ok: false,
      status,
      output: captureOutput(check.stdout, check.stderr) || "repoos check failed.",
    };
  status = await getReleaseStatus(config, exec);
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
  const createdTag = await exec("git", ["tag", "-a", tag, "-m", `Release ${tag}`], config.root);
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
    output: `Pushed ${tag}. Your release workflow can now publish it.`,
  };
}
