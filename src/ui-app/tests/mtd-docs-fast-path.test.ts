/**
 * #0355 — the MTD close-out gate's docs-only fast path.
 *
 * `validateCandidate` runs a full `bun run build` plus a candidate `repoos
 * check` (build/lockfile/fmt/lint/tests/ui-smoke) for every task, even one
 * whose merged diff is nothing but markdown. A diff that touches no
 * code/source path cannot be affected by any of those steps, so the gate
 * skips them — but ONLY when the literal path predicate says so, and never at
 * the cost of the merge/conflict handling that surrounds it.
 */
import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { rmFixture } from "./helpers";
import { ensureWorktree, getChangedFilePaths } from "../../core/git.js";
import { createJobCoordinator } from "../../server/integration-job.js";
import { CloseOutOrchestrator, isDocsOnlyChange } from "../../server/integration-orchestrator.js";

function git(root: string, args: string[]): string {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

function commitFile(dir: string, name: string, content: string, msg: string): void {
  const full = join(dir, name);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, content);
  git(dir, ["add", "--", name]);
  git(dir, ["commit", "-m", msg]);
}

function makeRepo(): { root: string; clean: () => void } {
  const root = mkdtempSync(join(tmpdir(), "repoos-mtd-docs-"));
  git(root, ["init", "-q", "-b", "main"]);
  git(root, ["config", "user.email", "t@example.com"]);
  git(root, ["config", "user.name", "Test"]);
  git(root, ["commit", "--allow-empty", "-m", "init"]);
  return { root, clean: () => rmFixture(root) };
}

interface ValidateResult {
  ok: boolean;
  reason?: string;
  retryable?: boolean;
  candidateSha?: string;
}

/** A candidate worktree reset to main, plus an orchestrator wired to it. */
function makeCandidate(root: string, taskId: string, branch: string) {
  const cand = ensureWorktree(root, `repoos/integrate/${taskId}`);
  expect(cand.ok).toBe(true);
  git(cand.path!, ["reset", "--hard", "main"]);

  const coordinator = createJobCoordinator(root);
  coordinator.enqueue({ id: taskId, branch } as never);
  coordinator.updateJob(taskId, { phase: "validating" });

  const config = {
    root,
    workDir: "work",
    cacheDir: ".repoos",
    defaultStatus: "inbox",
    defaultAssignee: "unassigned",
  };
  const orch = new CloseOutOrchestrator(config as never, coordinator);
  const validate = (job: unknown): Promise<ValidateResult> =>
    (
      orch as never as { validateCandidate: (j: unknown) => Promise<ValidateResult> }
    ).validateCandidate(job);
  return { candPath: cand.path!, coordinator, validate };
}

describe("isDocsOnlyChange (#0355)", () => {
  it("accepts docs/, user-docs/, markdown anywhere, and the task's own file", () => {
    expect(isDocsOnlyChange(["docs/architecture.md"])).toBe(true);
    expect(isDocsOnlyChange(["user-docs/getting-started.md"])).toBe(true);
    expect(isDocsOnlyChange(["README.md"])).toBe(true);
    expect(isDocsOnlyChange(["work/0200-some-task.md"])).toBe(true);
    expect(isDocsOnlyChange(["docs/a.md", "user-docs/b.md", "work/0200-x.md"])).toBe(true);
  });

  it("rejects a single non-docs path — no 'mostly docs' scoring", () => {
    expect(isDocsOnlyChange(["docs/a.md", "src/server/x.ts"])).toBe(false);
    expect(isDocsOnlyChange(["repoos.toml"])).toBe(false);
    expect(isDocsOnlyChange(["package.json"])).toBe(false);
    expect(isDocsOnlyChange(["scripts/run-tests.mjs"])).toBe(false);
    expect(isDocsOnlyChange([".github/workflows/ci.yml"])).toBe(false);
  });

  it("treats an empty diff as docs-only (a legitimate no-op merge has nothing to gate)", () => {
    expect(isDocsOnlyChange([])).toBe(true);
  });
});

describe("getChangedFilePaths (#0355)", () => {
  it("returns the paths a branch adds over the base", async () => {
    const { root, clean } = makeRepo();
    try {
      const feat = ensureWorktree(root, "feat/task150");
      commitFile(feat.path!, "docs/a.md", "# a\n", "docs a");
      commitFile(feat.path!, "src/b.ts", "export const b = 1;\n", "src b");

      const paths = await getChangedFilePaths(feat.path!, "main");
      expect(paths?.sort()).toEqual(["docs/a.md", "src/b.ts"]);
    } finally {
      clean();
    }
  });

  it("returns null (not []) when git cannot tell, so the caller fails safe to the full gate", async () => {
    const notARepo = mkdtempSync(join(tmpdir(), "repoos-mtd-not-repo-"));
    try {
      expect(await getChangedFilePaths(notARepo, "main")).toBeNull();
    } finally {
      rmFixture(notARepo);
    }
  });
});

describe("validateCandidate docs-only fast path (#0355)", () => {
  it("skips build + check for a markdown-only diff and still publishes", async () => {
    const { root, clean } = makeRepo();
    try {
      const feat = ensureWorktree(root, "feat/task200");
      commitFile(feat.path!, "docs/guide.md", "# guide\n", "docs only");
      commitFile(feat.path!, "work/0200-doc-task.md", "---\nid: '0200'\n---\nbody\n", "task file");

      const { coordinator, validate } = makeCandidate(root, "0200", "feat/task200");
      const res = await validate(coordinator.getJob("0200"));

      // This fixture has no package.json, so a build could only fail — the
      // sole way to reach a green result is by taking the fast path past it.
      expect(res.ok).toBe(true);
      expect(res.candidateSha).toBeTruthy();
    } finally {
      clean();
    }
  });

  it("runs the full gate when even one source file is in the diff", async () => {
    const { root, clean } = makeRepo();
    try {
      const feat = ensureWorktree(root, "feat/task202");
      commitFile(feat.path!, "docs/guide.md", "# guide\n", "docs");
      commitFile(feat.path!, "src/thing.ts", "export const x = 1;\n", "one line of src");

      const { coordinator, validate } = makeCandidate(root, "0202", "feat/task202");
      const res = await validate(coordinator.getJob("0202"));

      // The mixed diff must NOT take the fast path; the fixture's missing
      // build config surfaces as a real build failure.
      expect(res.ok).toBe(false);
      expect(res.reason).toContain("build failed");
    } finally {
      clean();
    }
  });

  it("still classifies a docs-only merge conflict before the fast-path check", async () => {
    const { root, clean } = makeRepo();
    try {
      commitFile(root, "docs/guide.md", "base\n", "base docs");
      const feat = ensureWorktree(root, "feat/task201");
      commitFile(feat.path!, "docs/guide.md", "branch edit\n", "branch edit");
      commitFile(root, "docs/guide.md", "main edit\n", "main edit");

      const { coordinator, validate } = makeCandidate(root, "0201", "feat/task201");
      const res = await validate(coordinator.getJob("0201"));

      expect(res.ok).toBe(false);
      expect(res.retryable).toBe(false);
      expect(res.reason).toContain("merge conflict in docs/guide.md");
    } finally {
      clean();
    }
  });
});
