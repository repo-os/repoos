/**
 * Tests for the Deployments surface (#0340): [[deployments]] config parsing,
 * the per-branch git state (derived from config rows, never hardcoded
 * main/prod), freshness scoped to a service's subdirectory, and the deploy
 * action's safety guards (dirty refusal, fast-forward-only, never force-push).
 */
import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RepoOSConfig } from "../../core/types";
import { loadConfig } from "../../core/config";
import { DEPLOYMENTS_NAV, NAV, RELEASE_NAV, navFor } from "../src/nav";
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
  fetch?: { code: number; stderr?: string };
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
    if (args[0] === "branch") return { code: 0, stdout: "main\n", stderr: "" };
    if (args[0] === "rev-parse") {
      const sha = shaOf(args[args.length - 1]);
      return sha
        ? { code: 0, stdout: `${sha}\n`, stderr: "" }
        : { code: 1, stdout: "", stderr: "" };
    }
    if (args[0] === "rev-list")
      return { code: 0, stdout: `${spec.counts?.[args[args.length - 1]] ?? 1}\n`, stderr: "" };
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
