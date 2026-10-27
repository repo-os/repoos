import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadConfig } from "../../core/repoos.js";
import { closeGitWorker, getGitWorker } from "../../server/git-worker.js";

describe("Git worker context-pack facts", () => {
  let root = "";

  afterEach(() => {
    if (root) {
      closeGitWorker(root);
      rmSync(root, { recursive: true, force: true });
      root = "";
    }
  });

  it("reads HEAD, untracked files, and diff summary outside the server process", async () => {
    root = mkdtempSync(join(tmpdir(), "repoos-context-facts-"));
    execFileSync("git", ["init", "-q"], { cwd: root });
    execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: root });
    execFileSync("git", ["config", "user.name", "Test"], { cwd: root });
    writeFileSync(join(root, "tracked.txt"), "before\n");
    execFileSync("git", ["add", "tracked.txt"], { cwd: root });
    execFileSync("git", ["commit", "-m", "initial"], { cwd: root });
    writeFileSync(join(root, "tracked.txt"), "after\n");
    writeFileSync(join(root, "new.txt"), "untracked\n");

    const facts = await getGitWorker(root).contextPackFacts(root, root);

    expect(facts.headHash).toMatch(/^[a-f0-9]{40,64}$/);
    expect(facts.worktreeState).toMatchObject({
      dirty: true,
      untracked: ["new.txt"],
    });
    expect(facts.worktreeState.diffSummary).toContain("tracked.txt");
  });

  it.each(["missing", "removed"])("returns absent git facts for a %s repository", async (state) => {
    root = mkdtempSync(join(tmpdir(), "repoos-missing-worker-"));
    if (state === "removed") rmSync(root, { recursive: true });
    else {
      rmSync(root, { recursive: true });
      root = join(root, "absent");
    }
    const overview = await getGitWorker(root).gitOverview();
    expect(overview.useGit).toBe(false);
    expect(overview.branches.size).toBe(0);
    expect(await getGitWorker(root).worktreePath("feat/missing")).toBeNull();
  });

  it("prepares the canary counter through the worker", async () => {
    root = mkdtempSync(join(tmpdir(), "repoos-canary-worker-"));
    execFileSync("git", ["init", "-q", "-b", "main"], { cwd: root });
    execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: root });
    execFileSync("git", ["config", "user.name", "Test"], { cwd: root });
    execFileSync("git", ["commit", "--allow-empty", "-m", "initial"], { cwd: root });

    const result = await getGitWorker(root).ensureCanaryReady(loadConfig(root));

    expect(result).toEqual({ ok: true, detail: null });
    expect(
      execFileSync("git", ["ls-files", ".gitignore", ".repoos/canary.txt"], {
        cwd: root,
        encoding: "utf8",
      }),
    ).toContain(".repoos/canary.txt");
  });
});
