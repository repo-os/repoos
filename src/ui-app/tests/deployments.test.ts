/**
 * Tests for the Deployments surface (#0340): [[deployments]] config parsing,
 * the per-branch git state (derived from config rows, never hardcoded
 * main/prod), freshness scoped to a service's subdirectory, and the deploy
 * action's safety guards (dirty refusal, fast-forward-only, never force-push).
 */
import { afterEach, describe, expect, it } from "vitest";
import { execSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RepoOSConfig } from "../../core/types";
import { loadConfig } from "../../core/config";
import { DEPLOYMENTS_NAV, NAV, RELEASE_NAV, navFor } from "../src/nav";
import { startServer, type ServerHandle } from "../../server/server";
import {
  deployBranch,
  deployRoot,
  deploymentBranches,
  getDeploymentsStatus,
  type DeployCommandRunner,
} from "../../server/deployments";

const roots: string[] = [];
afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })));

function tmpDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "repoos-deployments-"));
  roots.push(dir);
  return dir;
}

function config(root: string, deployments?: unknown[]): RepoOSConfig {
  return {
    root,
    workDir: "work",
    docsDir: "docs",
    skillsDir: "skills",
    taskExtensions: [".md"],
    defaultStatus: "inbox",
    defaultAssignee: "unassigned",
    cacheDir: ".repoos",
    ...(deployments !== undefined
      ? { deployments: deployments as RepoOSConfig["deployments"] }
      : {}),
  };
}

interface MockSpec {
  dirty?: string;
  /** branch -> sha, the local refs. */
  local?: Record<string, string>;
  /** branch -> sha, the origin/* remote-tracking refs. */
  origin?: Record<string, string>;
  /** "a..b" -> count, for `rev-list --count`. */
  counts?: Record<string, number>;
  /** "A->B" pairs: A is a strict git ancestor of B. */
  ancestors?: string[];
  /** "branch|subdir" (subdir may be empty) -> "%cI%n%h" output. */
  logs?: Record<string, string>;
  /** What `branch --show-current` reports (default "main"). */
  current?: string;
  fetch?: { code: number; stderr?: string };
  merge?: { code: number; stderr?: string };
  push?: { code: number; stderr?: string };
}

/** A scripted git that records every invocation as `git <args joined>`. */
function mockGit(spec: MockSpec = {}): { exec: DeployCommandRunner; calls: string[] } {
  const calls: string[] = [];
  const shaOf = (ref: string): string | undefined =>
    ref.startsWith("origin/") ? spec.origin?.[ref.slice("origin/".length)] : spec.local?.[ref];
  const exec: DeployCommandRunner = async (_command, args) => {
    calls.push(args.join(" "));
    if (args[0] === "status") return { code: 0, stdout: spec.dirty ?? "", stderr: "" };
    if (args[0] === "branch") return { code: 0, stdout: `${spec.current ?? "main"}\n`, stderr: "" };
    if (args[0] === "rev-parse") {
      const sha = shaOf(args[args.length - 1]);
      return sha
        ? { code: 0, stdout: `${sha}\n`, stderr: "" }
        : { code: 1, stdout: "", stderr: "" };
    }
    if (args[0] === "rev-list") {
      // Key is everything after "rev-list --count", joined — just the range
      // for a plain call ("origin/main..main"), or "range -- subdir" once a
      // pathspec is appended (#0367's subdir-scoped sync counts). Backward
      // compatible with existing single-token range keys: slice(2).join(" ")
      // equals args[args.length - 1] when there's nothing after the range.
      const key = args.slice(2).join(" ");
      return { code: 0, stdout: `${spec.counts?.[key] ?? 1}\n`, stderr: "" };
    }
    if (args[0] === "merge") {
      const m = spec.merge ?? { code: 0 };
      return { code: m.code, stdout: "", stderr: m.stderr ?? "" };
    }
    if (args[0] === "merge-base") {
      const pair = `${args[2]}->${args[3]}`;
      return (spec.ancestors ?? []).includes(pair)
        ? { code: 0, stdout: "", stderr: "" }
        : { code: 1, stdout: "", stderr: "" };
    }
    if (args[0] === "log") {
      const subdirIdx = args.indexOf("--");
      const key = `${args[3] ?? "HEAD"}|${subdirIdx !== -1 ? (args[subdirIdx + 1] ?? "") : ""}`;
      const out = spec.logs?.[key];
      return out ? { code: 0, stdout: out, stderr: "" } : { code: 1, stdout: "", stderr: "" };
    }
    if (args[0] === "fetch") {
      const f = spec.fetch ?? { code: 0 };
      return { code: f.code, stdout: "", stderr: f.stderr ?? "" };
    }
    if (args[0] === "push") {
      const p = spec.push ?? { code: 0 };
      return { code: p.code, stdout: "", stderr: p.stderr ?? "" };
    }
    return { code: 1, stdout: "", stderr: "" };
  };
  return { exec, calls };
}

const TWO_BRANCH_ROWS = [
  { name: "Landing page (prod)", branch: "prod", url: "https://repoos.org", subdir: "landing" },
  {
    name: "Landing page (dev)",
    branch: "main",
    url: "https://main-landing.example.workers.dev",
    subdir: "landing",
  },
  { name: "Docs (prod)", branch: "prod", url: "https://docs.repoos.org", subdir: "user-docs" },
  {
    name: "Docs (dev)",
    branch: "main",
    url: "https://main-docs.example.workers.dev",
    subdir: "user-docs",
  },
];

const BASE_SPEC: MockSpec = {
  local: { main: "a".repeat(8), prod: "b".repeat(8) },
  origin: { main: "a".repeat(8), prod: "b".repeat(8) },
  counts: {
    "origin/main..main": 8,
    "main..origin/main": 0,
    "origin/prod..prod": 0,
    "prod..origin/prod": 0,
    "prod..main": 5,
  },
  ancestors: ["prod->main"],
  logs: {
    "main|landing": "2026-09-14T01:00:00Z\nabcd1234",
    "main|user-docs": "2026-09-13T09:00:00Z\nef567890",
    "prod|landing": "2026-09-12T08:00:00Z\n0759a36f",
    "prod|user-docs": "2026-09-12T08:00:00Z\n0759a36f",
  },
};

describe("getDeploymentsStatus", () => {
  it("is dormant without [[deployments]] config", async () => {
    const { exec } = mockGit(BASE_SPEC);
    const status = await getDeploymentsStatus(config(tmpDir()), exec);
    expect(status).toMatchObject({ enabled: false, rows: [], branches: [] });
  });

  it("derives distinct branches from the config rows, in first-appearance order", async () => {
    const { exec } = mockGit(BASE_SPEC);
    const status = await getDeploymentsStatus(config(tmpDir(), TWO_BRANCH_ROWS), exec);
    expect(status.enabled).toBe(true);
    expect(status.branches.map((b) => b.branch)).toEqual(["prod", "main"]);
  });

  it("scopes freshness to the row's subdir with the branch as the revision", async () => {
    const { exec, calls } = mockGit(BASE_SPEC);
    const status = await getDeploymentsStatus(config(tmpDir(), TWO_BRANCH_ROWS), exec);
    const landing = status.rows.find((r) => r.name === "Landing page (dev)");
    expect(landing?.lastPushAt).toBe("2026-09-14T01:00:00Z");
    expect(landing?.lastPushSha).toBe("abcd1234");
    // The revision must come BEFORE `--`: a branch after `--` reads as a path
    // and would silently degrade the lookup to HEAD.
    expect(calls).toContain("log -1 --format=%cI%n%h main -- landing");
    expect(calls).toContain("log -1 --format=%cI%n%h prod -- user-docs");
  });

  it("runs one git log per (branch, subdir) pair, not per row", async () => {
    const { exec, calls } = mockGit(BASE_SPEC);
    await getDeploymentsStatus(config(tmpDir(), TWO_BRANCH_ROWS), exec);
    expect(calls.filter((c) => c.startsWith("log "))).toHaveLength(4);
  });

  it("reports ahead/behind against each branch's own origin ref", async () => {
    const { exec } = mockGit(BASE_SPEC);
    const status = await getDeploymentsStatus(config(tmpDir(), TWO_BRANCH_ROWS), exec);
    expect(status.branches).toEqual([
      expect.objectContaining({
        branch: "prod",
        ahead: 0,
        behind: 0,
        hasOrigin: true,
        ffFrom: "main",
      }),
      expect.objectContaining({
        branch: "main",
        ahead: 8,
        behind: 0,
        hasOrigin: true,
        ffFrom: null,
      }),
    ]);
    expect(status.dirty).toBe(false);
  });

  it("reports an unknown branch (no local ref, no origin ref) as undeployable", async () => {
    const { exec } = mockGit({ dirty: "" });
    const status = await getDeploymentsStatus(
      config(tmpDir(), [{ name: "Site", branch: "trunk", url: "https://example.com" }]),
      exec,
    );
    expect(status.branches[0]).toMatchObject({
      branch: "trunk",
      hasOrigin: false,
      localExists: false,
      ahead: null,
      behind: null,
      ffFrom: null,
    });
    expect(status.rows[0]?.lastPushAt).toBeNull();
  });

  it("picks the NEAREST downstream branch as the fast-forward source", async () => {
    // A dev -> staging -> prod pipeline: dev is behind both, staging behind
    // prod. Each branch pairs with its nearest descendant, not the pipeline's end.
    const spec: MockSpec = {
      ...BASE_SPEC,
      local: { dev: "1".repeat(8), staging: "2".repeat(8), prod: "3".repeat(8) },
      ancestors: ["dev->staging", "dev->prod", "staging->prod"],
      counts: { "dev..staging": 2, "dev..prod": 9, "staging..prod": 7 },
    };
    const rows = [
      { name: "A", branch: "dev" },
      { name: "B", branch: "staging" },
      { name: "C", branch: "prod" },
    ];
    const { exec } = mockGit(spec);
    const status = await getDeploymentsStatus(config(tmpDir(), rows), exec);
    expect(Object.fromEntries(status.branches.map((b) => [b.branch, b.ffFrom]))).toEqual({
      dev: "staging",
      staging: "prod",
      prod: null,
    });
  });

  it("treats an already-equal neighbor as a plain push, not a fast-forward source", async () => {
    // Right after "Deploy prod", prod == main; neither is a STRICT ancestor of
    // the other, so both branches just push — and the module must not even ask
    // merge-base, or a future divergence check would misread equality.
    const sha = "c".repeat(8);
    const spec: MockSpec = {
      ...BASE_SPEC,
      local: { main: sha, prod: sha },
      origin: { main: sha, prod: "d".repeat(8) },
      counts: {
        "origin/main..main": 0,
        "main..origin/main": 3,
        "origin/prod..prod": 1,
        "prod..origin/prod": 0,
      },
      ancestors: [],
    };
    const { exec, calls } = mockGit(spec);
    const status = await getDeploymentsStatus(config(tmpDir(), TWO_BRANCH_ROWS), exec);
    expect(status.branches.map((b) => b.ffFrom)).toEqual([null, null]);
    expect(calls.filter((c) => c.startsWith("merge-base"))).toHaveLength(0);
  });

  it("marks the checkout dirty when it has uncommitted changes", async () => {
    const { exec } = mockGit({ ...BASE_SPEC, dirty: " M src/a.ts\n" });
    const status = await getDeploymentsStatus(config(tmpDir(), TWO_BRANCH_ROWS), exec);
    expect(status.dirty).toBe(true);
  });

  it("resolves a non-worktree root to itself for deploys", () => {
    const cfg = config(tmpDir());
    expect(deployRoot(cfg)).toBe(cfg.root);
  });

  it("collapses duplicate branches when deriving the branch list", () => {
    expect(deploymentBranches(TWO_BRANCH_ROWS)).toEqual(["prod", "main"]);
    expect(deploymentBranches([])).toEqual([]);
  });

  it("resolves each row's service, defaulting to its own name when unconfigured", async () => {
    const { exec } = mockGit(BASE_SPEC);
    const rows = [
      { name: "Landing page (prod)", service: "Landing page", branch: "prod" },
      { name: "Landing page (dev)", service: "Landing page", branch: "main" },
      { name: "Solo target", branch: "main" }, // no `service` configured
    ];
    const status = await getDeploymentsStatus(config(tmpDir(), rows), exec);
    expect(status.rows.map((r) => r.service)).toEqual([
      "Landing page",
      "Landing page",
      "Solo target",
    ]);
  });
});

describe("mainSync — deployed ref vs local main (#0365)", () => {
  it("reports 'same' when origin/<branch> equals local main", async () => {
    const spec: MockSpec = {
      ...BASE_SPEC,
      counts: { ...BASE_SPEC.counts, "main..origin/main": 0, "origin/main..main": 0 },
    };
    const { exec } = mockGit(spec);
    const status = await getDeploymentsStatus(config(tmpDir(), TWO_BRANCH_ROWS), exec);
    const main = status.branches.find((b) => b.branch === "main")!;
    expect(main.mainSync).toEqual({ state: "same", aheadOfMain: 0, behindMain: 0 });
  });

  it("reports 'behind' with a count when origin/<branch> is a strict ancestor of local main", async () => {
    // Reuses the existing "origin/main..main": 8 / "main..origin/main": 0 pair
    // from BASE_SPEC — the same numbers that already drive the unrelated
    // ahead/behind-vs-own-origin fields, just read with main as the reference.
    const { exec } = mockGit(BASE_SPEC);
    const status = await getDeploymentsStatus(config(tmpDir(), TWO_BRANCH_ROWS), exec);
    const main = status.branches.find((b) => b.branch === "main")!;
    expect(main.mainSync).toEqual({ state: "behind", aheadOfMain: 0, behindMain: 8 });
  });

  it("reports 'ahead' when the deployed ref has commits local main lacks", async () => {
    const spec: MockSpec = {
      ...BASE_SPEC,
      counts: { ...BASE_SPEC.counts, "main..origin/prod": 3, "origin/prod..main": 0 },
    };
    const { exec } = mockGit(spec);
    const status = await getDeploymentsStatus(config(tmpDir(), TWO_BRANCH_ROWS), exec);
    const prod = status.branches.find((b) => b.branch === "prod")!;
    expect(prod.mainSync).toEqual({ state: "ahead", aheadOfMain: 3, behindMain: 0 });
  });

  it("reports 'diverged' when both sides have commits the other lacks", async () => {
    const spec: MockSpec = {
      ...BASE_SPEC,
      counts: { ...BASE_SPEC.counts, "main..origin/prod": 2, "origin/prod..main": 4 },
    };
    const { exec } = mockGit(spec);
    const status = await getDeploymentsStatus(config(tmpDir(), TWO_BRANCH_ROWS), exec);
    const prod = status.branches.find((b) => b.branch === "prod")!;
    expect(prod.mainSync).toEqual({ state: "diverged", aheadOfMain: 2, behindMain: 4 });
  });

  it("reports 'unknown' when the branch has no origin ref yet", async () => {
    const { exec } = mockGit({ dirty: "", local: { main: "a".repeat(8) } });
    const status = await getDeploymentsStatus(
      config(tmpDir(), [{ name: "Site", branch: "trunk", url: "https://example.com" }]),
      exec,
    );
    expect(status.branches[0].mainSync).toEqual({
      state: "unknown",
      aheadOfMain: 0,
      behindMain: 0,
    });
  });

  it("compares against local main regardless of which branch is being measured", async () => {
    // Sanity check on the framing itself: the function never substitutes the
    // branch's own name for "main" — it is always the literal local `main`
    // ref, including when measuring the "main" deployment branch against
    // itself (a deliberate, documented simplification — see #0365's task).
    const spec: MockSpec = {
      ...BASE_SPEC,
      counts: { ...BASE_SPEC.counts, "main..origin/prod": 0, "origin/prod..main": 5 },
    };
    const { exec, calls } = mockGit(spec);
    await getDeploymentsStatus(config(tmpDir(), TWO_BRANCH_ROWS), exec);
    expect(calls).toContain("rev-list --count main..origin/prod");
    expect(calls).toContain("rev-list --count origin/prod..main");
  });
});

describe("changesVsMain — subdir-scoped breakdown of mainSync (#0367)", () => {
  it("is null for a row with no subdir configured (the branch-level count already is its scope)", async () => {
    const { exec } = mockGit(BASE_SPEC);
    const rows = [{ name: "Whole-branch service", branch: "prod" }];
    const status = await getDeploymentsStatus(config(tmpDir(), rows), exec);
    expect(status.rows[0].changesVsMain).toBeNull();
  });

  it("reproduces the live discrepancy: whole-branch distance nonzero, subdir-scoped distance zero", async () => {
    // The exact scenario reported live: prod shows 17 commits behind main,
    // but none of them touch "landing" or "user-docs".
    const spec: MockSpec = {
      ...BASE_SPEC,
      counts: {
        ...BASE_SPEC.counts,
        "main..origin/prod": 0,
        "origin/prod..main": 17,
        "main..origin/prod -- landing": 0,
        "origin/prod..main -- landing": 0,
      },
    };
    const { exec } = mockGit(spec);
    const status = await getDeploymentsStatus(
      config(tmpDir(), [{ name: "Landing page", branch: "prod", subdir: "landing" }]),
      exec,
    );
    const prodBranch = status.branches.find((b) => b.branch === "prod")!;
    expect(prodBranch.mainSync).toEqual({ state: "behind", aheadOfMain: 0, behindMain: 17 });
    expect(status.rows[0].changesVsMain).toEqual({ aheadOfMain: 0, behindMain: 0 });
  });

  it("counts the commits that DO touch the subdir when some of the distance is relevant", async () => {
    const spec: MockSpec = {
      ...BASE_SPEC,
      counts: {
        ...BASE_SPEC.counts,
        "main..origin/prod": 0,
        "origin/prod..main": 17,
        "main..origin/prod -- landing": 0,
        "origin/prod..main -- landing": 3,
      },
    };
    const { exec } = mockGit(spec);
    const status = await getDeploymentsStatus(
      config(tmpDir(), [{ name: "Landing page", branch: "prod", subdir: "landing" }]),
      exec,
    );
    expect(status.rows[0].changesVsMain).toEqual({ aheadOfMain: 0, behindMain: 3 });
  });

  it("passes the correct pathspec-scoped rev-list calls, sharing them across rows with the same (branch, subdir)", async () => {
    const { exec, calls } = mockGit(BASE_SPEC);
    const rows = [
      { name: "Landing page (prod)", branch: "prod", subdir: "landing" },
      { name: "Landing page (dupe)", branch: "prod", subdir: "landing" },
    ];
    await getDeploymentsStatus(config(tmpDir(), rows), exec);
    expect(calls).toContain("rev-list --count main..origin/prod -- landing");
    expect(calls).toContain("rev-list --count origin/prod..main -- landing");
    expect(calls.filter((c) => c === "rev-list --count origin/prod..main -- landing")).toHaveLength(
      1,
    );
  });
});

describe("deployBranch", () => {
  it("refuses a branch no [[deployments]] row configures, before any git call", async () => {
    const cfg = config(tmpDir(), TWO_BRANCH_ROWS);
    const { exec, calls } = mockGit(BASE_SPEC);
    const result = await deployBranch(cfg, "staging", exec);
    expect(result.ok).toBe(false);
    expect(result.output).toContain("not a configured deployment branch");
    expect(calls).toHaveLength(0);
  });

  it("refuses while the checkout is dirty, without touching the remote", async () => {
    const cfg = config(tmpDir(), TWO_BRANCH_ROWS);
    const { exec, calls } = mockGit({ ...BASE_SPEC, dirty: " M src/a.ts\n" });
    const result = await deployBranch(cfg, "main", exec);
    expect(result.ok).toBe(false);
    expect(result.output).toContain("uncommitted changes");
    expect(calls.filter((c) => c.startsWith("push"))).toHaveLength(0);
  });

  it("refuses a configured branch with no local ref, with a clean message", async () => {
    // A direct API call for a branch the checkout has never created must not
    // surface git's opaque "src refspec … does not match any".
    const cfg = config(tmpDir(), TWO_BRANCH_ROWS);
    const { exec, calls } = mockGit({
      ...BASE_SPEC,
      local: { main: "a".repeat(8) }, // no local prod
    });
    const result = await deployBranch(cfg, "prod", exec);
    expect(result.ok).toBe(false);
    expect(result.output).toContain('No local branch "prod"');
    expect(result.output).toContain("git fetch origin");
    expect(calls.filter((c) => c.startsWith("push"))).toHaveLength(0);
  });

  it("uses merge --ff-only when the checkout is ON the branch being fast-forwarded", async () => {
    // `fetch . main:prod` refuses when prod is checked out; merge --ff-only is
    // the equivalent ref move there.
    const cfg = config(tmpDir(), TWO_BRANCH_ROWS);
    const { exec, calls } = mockGit({ ...BASE_SPEC, current: "prod" });
    const result = await deployBranch(cfg, "prod", exec);
    expect(result.ok).toBe(true);
    expect(calls).toContain("merge --ff-only main");
    expect(calls.filter((c) => c.startsWith("fetch"))).toHaveLength(0);
    expect(calls.indexOf("merge --ff-only main")).toBeLessThan(calls.indexOf("push origin prod"));
  });

  it("states the resulting local state when the push fails after a fast-forward", async () => {
    const cfg = config(tmpDir(), TWO_BRANCH_ROWS);
    const { exec } = mockGit({
      ...BASE_SPEC,
      push: { code: 1, stderr: "! [rejected] prod -> prod (fetch first)" },
    });
    const result = await deployBranch(cfg, "prod", exec);
    expect(result.ok).toBe(false);
    // The local ref HAS moved even though the push failed — the message must
    // say so, so the next deploy's plain-push shape isn't a surprise.
    expect(result.output).toContain("origin still has the old prod");
    expect(result.output).toContain("NEXT deploy will be a plain push");
  });

  it("deploys a leading branch with a plain push and never a force flag", async () => {
    const cfg = config(tmpDir(), TWO_BRANCH_ROWS);
    const { exec, calls } = mockGit(BASE_SPEC);
    const result = await deployBranch(cfg, "main", exec);
    expect(result.ok).toBe(true);
    expect(result.output).toContain("Pushed main to origin");
    expect(calls).toContain("push origin main");
    expect(calls.filter((c) => c.startsWith("fetch"))).toHaveLength(0);
    expect(calls.every((c) => !c.includes("--force"))).toBe(true);
  });

  it("fast-forwards a trailing branch to its nearest descendant before pushing", async () => {
    const cfg = config(tmpDir(), TWO_BRANCH_ROWS);
    const { exec, calls } = mockGit(BASE_SPEC);
    const result = await deployBranch(cfg, "prod", exec);
    expect(result.ok).toBe(true);
    expect(result.output).toContain("Fast-forwarded prod to main");
    // Ref update first (git itself refuses a non-fast-forward ref update), then push.
    expect(calls.indexOf("fetch . main:prod")).toBeGreaterThanOrEqual(0);
    expect(calls.indexOf("fetch . main:prod")).toBeLessThan(calls.indexOf("push origin prod"));
    expect(calls.every((c) => !c.includes("--force"))).toBe(true);
  });

  it("refuses without pushing when the fast-forward is not clean", async () => {
    const cfg = config(tmpDir(), TWO_BRANCH_ROWS);
    const { exec, calls } = mockGit({
      ...BASE_SPEC,
      fetch: { code: 1, stderr: "! [rejected] main -> prod (non-fast-forward)" },
    });
    const result = await deployBranch(cfg, "prod", exec);
    expect(result.ok).toBe(false);
    expect(result.output).toContain("diverged");
    expect(result.output).toContain("non-fast-forward");
    expect(calls.filter((c) => c.startsWith("push"))).toHaveLength(0);
  });

  it("surfaces a refused push (remote moved) as a failure", async () => {
    const cfg = config(tmpDir(), TWO_BRANCH_ROWS);
    const { exec, calls } = mockGit({
      ...BASE_SPEC,
      push: { code: 1, stderr: "! [rejected] main -> main (fetch first)" },
    });
    const result = await deployBranch(cfg, "main", exec);
    expect(result.ok).toBe(false);
    expect(result.output).toContain("fetch first");
    expect(result.output).toContain("Nothing was force-pushed");
  });
});

describe("loadConfig [[deployments]] parsing", () => {
  it("parses rows from repoos.toml, normalizing dashboard_url to dashboardUrl", () => {
    const root = tmpDir();
    writeFileSync(
      join(root, "repoos.toml"),
      [
        "[[deployments]]",
        'name = "Landing page (prod)"',
        'branch = "prod"',
        'provider = "cloudflare-workers"',
        'url = "https://repoos.org"',
        'dashboard_url = "https://dash.example.com/workers"',
        'subdir = "landing"',
        "",
        "[[deployments]]",
        'name = "Landing page (dev)"',
        'branch = "main"',
        'url = "https://main-landing.example.workers.dev"',
        'dashboard_url = ""',
        "",
      ].join("\n"),
      "utf8",
    );
    const cfg = loadConfig(root);
    expect(cfg.deployments).toEqual([
      {
        name: "Landing page (prod)",
        branch: "prod",
        provider: "cloudflare-workers",
        url: "https://repoos.org",
        dashboardUrl: "https://dash.example.com/workers",
        subdir: "landing",
      },
      {
        name: "Landing page (dev)",
        branch: "main",
        url: "https://main-landing.example.workers.dev",
      },
    ]);
  });

  it("drops rows without a name or branch and stays dormant when none survive", () => {
    const root = tmpDir();
    writeFileSync(
      join(root, "repoos.toml"),
      '[[deployments]]\nname = "No branch"\n\n[[deployments]]\nbranch = "main"\n',
      "utf8",
    );
    expect(loadConfig(root).deployments).toBeUndefined();
  });

  it("leaves deployments unset when the repo has no [[deployments]] block", () => {
    expect(loadConfig(tmpDir()).deployments).toBeUndefined();
  });

  it("parses the optional service field (#0365), omitting it when unset", () => {
    const root = tmpDir();
    writeFileSync(
      join(root, "repoos.toml"),
      [
        "[[deployments]]",
        'name = "Landing page (prod)"',
        'service = "Landing page"',
        'branch = "prod"',
        "",
        "[[deployments]]",
        'name = "Solo target"',
        'branch = "main"',
        "",
      ].join("\n"),
      "utf8",
    );
    const cfg = loadConfig(root);
    expect(cfg.deployments).toEqual([
      { name: "Landing page (prod)", service: "Landing page", branch: "prod" },
      { name: "Solo target", branch: "main" },
    ]);
  });
});

describe("navFor deployments gating", () => {
  it("hides Deployments unless the repo configures any", () => {
    expect(navFor(false, false)).toEqual(NAV);
    expect(navFor(false, false).map((n) => n.id)).not.toContain("deployments");
  });

  it("slots Deployments after Work (and after Releases when both are on)", () => {
    const both = navFor(true, true);
    expect(both.map((n) => n.id)).toEqual([
      "dashboard",
      "inputs",
      "work",
      "releases",
      "deployments",
      "agents",
      "repo",
      "settings",
    ]);
    const onlyDeployments = navFor(false, true);
    expect(onlyDeployments.map((n) => n.id)).toContain("deployments");
    expect(onlyDeployments.map((n) => n.id)).not.toContain("releases");
    expect(DEPLOYMENTS_NAV.path).toBe("/deployments");
  });
});

/**
 * Contract tests against a REAL server + REAL git: a temp repo with a local
 * bare remote, so deploy pushes run for real (no network). These pin the
 * HTTP shapes the browser depends on — in particular that a 409 refusal
 * carries its full text in `error`, which is the only field the client's
 * api() wrapper reads on a non-2xx response.
 */
function git(root: string, args: string): void {
  execSync(`git ${args}`, { cwd: root, stdio: "pipe" });
}

/**
 * A temp repo shaped like a deployments target: main strictly ahead of prod
 * (so "deploy prod" is a fast-forward), a local bare origin both branches are
 * pushed to, and a repoos.toml the server actually loads — the server's
 * config comes from disk, not from any in-memory fixture.
 */
function makeSiteRepo(opts: { dirty?: boolean; extraRow?: string[] } = {}): {
  root: string;
  origin: string;
} {
  const root = tmpDir();
  const origin = tmpDir();
  execSync(`git init -q --bare "${origin}"`);
  git(root, "init -q -b main");
  git(root, "config user.email t@t");
  git(root, "config user.name t");
  mkdirSync(join(root, "site"), { recursive: true });
  // RepoOS's own runtime cache (`.repoos/`) is untracked in a fresh repo and
  // the server creates it at boot — ignore it exactly like a real repo would,
  // so the dirty-tree guard only sees genuine human changes.
  writeFileSync(join(root, ".gitignore"), ".repoos/\n");
  // The config is committed, so it never dirties the tree mid-test.
  writeFileSync(
    join(root, "repoos.toml"),
    [
      "[[deployments]]",
      'name = "Site (prod)"',
      'branch = "prod"',
      'url = "https://example.com"',
      'subdir = "site"',
      "",
      "[[deployments]]",
      'name = "Site (dev)"',
      'branch = "main"',
      'url = "https://dev.example.com"',
      'subdir = "site"',
      ...(opts.extraRow ? ["", ...opts.extraRow] : []),
      "",
    ].join("\n"),
    "utf8",
  );
  writeFileSync(join(root, "site", "index.html"), "v1\n");
  git(root, "add -A");
  git(root, 'commit -qm "base"');
  git(root, `remote add origin "${origin}"`);
  git(root, "push -q origin main");
  git(root, "branch prod");
  git(root, "push -q origin prod");
  if (opts.dirty) {
    writeFileSync(join(root, "uncommitted.txt"), "dirty\n");
  } else {
    // Leave main strictly ahead of prod so "deploy prod" is a fast-forward.
    writeFileSync(join(root, "site", "index.html"), "v2\n");
    git(root, "add -A");
    git(root, 'commit -qm "next"');
  }
  return { root, origin };
}

async function withServer(root: string, fn: (s: ServerHandle) => Promise<void>): Promise<void> {
  const server = await startServer({ root, host: "127.0.0.1", port: 0 });
  try {
    await fn(server);
  } finally {
    await server.close();
  }
}

async function postDeploy(url: string, branch: string): Promise<Response> {
  return fetch(`${url}/api/deployments/deploy`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ branch }),
  });
}

describe("deploy API contract (real server + real git)", () => {
  it("serves the grid and carries refusal text in `error` on 409", async () => {
    const { root } = makeSiteRepo({ dirty: true });
    await withServer(root, async (s) => {
      const grid = (await (await fetch(`${s.url}/api/deployments`)).json()) as {
        enabled: boolean;
        dirty: boolean;
      };
      expect(grid).toMatchObject({ enabled: true, dirty: true });

      const res = await postDeploy(s.url, "main");
      expect(res.status).toBe(409);
      const body = (await res.json()) as { ok: boolean; error?: string; output: string };
      expect(body.ok).toBe(false);
      // The refusal must arrive in BOTH fields: `output` is the canonical
      // result text, `error` is what api() actually surfaces to the user.
      expect(body.output).toContain("uncommitted changes");
      expect(body.error).toBe(body.output);
    });
  });

  it("fast-forwards and pushes prod to a real bare origin", async () => {
    const { root, origin } = makeSiteRepo();
    await withServer(root, async (s) => {
      const res = await postDeploy(s.url, "prod");
      expect(res.status).toBe(200);
      const body = (await res.json()) as { ok: boolean; output: string };
      expect(body.ok).toBe(true);
      expect(body.output).toContain("Fast-forwarded prod to main");
      // The bare origin's prod ref now matches local main.
      const originProd = execSync("git rev-parse prod", { cwd: origin }).toString().trim();
      const localMain = execSync("git rev-parse main", { cwd: root }).toString().trim();
      expect(originProd).toBe(localMain);
    });
  });

  it("refuses a configured-but-unborn branch with 409 and a clean message", async () => {
    // "staging" is in the config but the repo never created it — the refusal
    // must be RepoOS's message, not git's "src refspec … does not match any".
    const { root } = makeSiteRepo({
      extraRow: [
        "[[deployments]]",
        'name = "Stage"',
        'branch = "staging"',
        'url = "https://st.example.com"',
      ],
    });
    await withServer(root, async (s) => {
      const res = await postDeploy(s.url, "staging");
      expect(res.status).toBe(409);
      const body = (await res.json()) as { ok: boolean; error?: string; output: string };
      expect(body.ok).toBe(false);
      expect(body.error).toContain('No local branch "staging"');
      expect(body.error).not.toContain("refspec");
    });
  });
});
