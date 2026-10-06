/**
 * #0674 — after a dependency-changing merge, main's install is refreshed so the
 * next symlink-main candidate sees the new modules (task-2-after-task-1 scenario).
 */
import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
  existsSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rmFixture } from "./helpers";
import {
  refreshMainDependencyInstall,
  refreshMainInstallAfterPublish,
} from "../../core/dependency-install.js";
import { ensureWorktree } from "../../core/git.js";
import { createJobCoordinator } from "../../server/integration-job.js";
import { createRepositoryLock, createRootLock } from "../../server/repo-lock.js";
import { CloseOutOrchestrator } from "../../server/integration-orchestrator.js";
import type { RepoOSConfig } from "../../core/types.js";

function git(root: string, args: string[]): string {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

function makeRepo(): { root: string; clean: () => void } {
  const root = mkdtempSync(join(tmpdir(), "repoos-mtd-deps-"));
  git(root, ["init", "-q", "-b", "main"]);
  git(root, ["config", "user.email", "t@example.com"]);
  git(root, ["config", "user.name", "Test"]);
  writeFileSync(join(root, ".gitignore"), ".repoos/\n");
  return { root, clean: () => rmFixture(root) };
}

function bootstrapWorkspace(root: string): void {
  writeFileSync(
    join(root, "package.json"),
    JSON.stringify({ name: "ws", private: true, workspaces: ["apps/*"] }, null, 2) + "\n",
  );
  writeFileSync(join(root, "bun.lock"), "# stub lockfile\n");
  mkdirSync(join(root, "apps", "web"), { recursive: true });
  writeFileSync(
    join(root, "apps", "web", "package.json"),
    JSON.stringify({ name: "web", version: "1.0.0" }, null, 2) + "\n",
  );
  mkdirSync(join(root, "scripts"), { recursive: true });
  writeFileSync(
    join(root, "scripts", "fake-install.sh"),
    "#!/bin/sh\nmkdir -p node_modules/.marker\ntouch node_modules/.marker/installed\n",
  );
  writeFileSync(join(root, "scripts", "fail-install.sh"), "#!/bin/sh\nexit 1\n");
  chmodSync(join(root, "scripts", "fake-install.sh"), 0o755);
  chmodSync(join(root, "scripts", "fail-install.sh"), 0o755);
  git(root, ["add", "."]);
  git(root, ["commit", "-m", "bootstrap workspace"]);
}

function configFor(root: string): RepoOSConfig {
  return {
    root,
    workDir: "work",
    cacheDir: ".repoos",
    defaultStatus: "inbox",
    defaultAssignee: "unassigned",
    closeOut: { timeoutMs: 360_000, postPublishCommand: "sh scripts/fake-install.sh" },
  } as RepoOSConfig;
}

/** Candidate integrate branch with a package-input change over current main. */
function makeDependencyCandidate(
  root: string,
  id: string,
): { branch: string; candidateSha: string; baseMainSha: string } {
  const baseMainSha = git(root, ["rev-parse", "main"]);
  const branch = `repoos/integrate/${id}`;
  const wt = ensureWorktree(root, branch);
  expect(wt.ok).toBe(true);
  writeFileSync(
    join(wt.path!, "apps", "web", "package.json"),
    JSON.stringify({ name: "web", version: "1.0.0", dependencies: { lodash: "1.0.0" } }, null, 2) +
      "\n",
  );
  git(wt.path!, ["add", "apps/web/package.json"]);
  git(wt.path!, ["commit", "-m", "add lodash dep"]);
  return {
    branch,
    candidateSha: git(wt.path!, ["rev-parse", "HEAD"]),
    baseMainSha,
  };
}

describe("post-publish main refresh (#0674)", () => {
  it("refreshes main after a lockfile-changing merge so symlink candidates stay valid", async () => {
    const { root, clean } = makeRepo();
    try {
      bootstrapWorkspace(root);
      writeFileSync(
        join(root, "apps", "web", "package.json"),
        JSON.stringify(
          { name: "web", version: "1.0.0", dependencies: { lodash: "1.0.0" } },
          null,
          2,
        ) + "\n",
      );
      git(root, ["add", "apps/web/package.json"]);
      git(root, ["commit", "-m", "task1: add lodash"]);

      expect(existsSync(join(root, "node_modules", ".marker", "installed"))).toBe(false);

      const res = await refreshMainDependencyInstall(configFor(root));
      expect(res.ok).toBe(true);
      expect(existsSync(join(root, "node_modules", ".marker", "installed"))).toBe(true);
      expect(readFileSync(join(root, "apps", "web", "package.json"), "utf8")).toContain("lodash");
    } finally {
      clean();
    }
  });

  it("publishCandidate runs post-publish refresh and a later symlink-main candidate sees it", async () => {
    const { root, clean } = makeRepo();
    try {
      bootstrapWorkspace(root);
      const { branch, candidateSha, baseMainSha } = makeDependencyCandidate(root, "dep1");
      const cfg = configFor(root);
      const coordinator = createJobCoordinator(root);
      const orchestrator = new CloseOutOrchestrator(
        cfg,
        coordinator,
        createRepositoryLock(root),
        createRootLock(root),
      );
      coordinator.enqueue({ id: "dep1", branch } as never);
      coordinator.updateJob("dep1", {
        phase: "publishing",
        startedAt: new Date().toISOString(),
        baseMainSha,
        branchSha: candidateSha,
        candidateSha,
      });

      await orchestrator.processNext();

      const job = coordinator.getJob("dep1");
      expect(job?.phase).toBe("done");
      expect(existsSync(join(root, "node_modules", ".marker", "installed"))).toBe(true);

      // Task 2: src-only branch; symlink-main candidate should see main's refreshed tree.
      const feat = ensureWorktree(root, "feat/task2-ui");
      writeFileSync(join(feat.path!, "apps", "web", "index.js"), "export const x = 1;\n");
      git(feat.path!, ["add", "apps/web/index.js"]);
      git(feat.path!, ["commit", "-m", "ui only"]);

      const cand2 = ensureWorktree(root, "repoos/integrate/t2");
      git(cand2.path!, ["reset", "--hard", "main"]);
      git(cand2.path!, ["merge", "feat/task2-ui", "-m", "merge task2"]);
      execFileSync("ln", ["-sfn", join(root, "node_modules"), join(cand2.path!, "node_modules")]);
      expect(existsSync(join(cand2.path!, "node_modules", ".marker", "installed"))).toBe(true);
    } finally {
      clean();
    }
  }, 30_000);

  it("fails close-out when post-publish refresh fails after the merge lands", async () => {
    const { root, clean } = makeRepo();
    try {
      bootstrapWorkspace(root);
      const { branch, candidateSha, baseMainSha } = makeDependencyCandidate(root, "dep2");
      const baseCfg = configFor(root);
      const cfg = {
        ...baseCfg,
        closeOut: {
          ...baseCfg.closeOut!,
          postPublishCommand: "sh scripts/fail-install.sh",
        },
      };
      const coordinator = createJobCoordinator(root);
      const orchestrator = new CloseOutOrchestrator(
        cfg,
        coordinator,
        createRepositoryLock(root),
        createRootLock(root),
      );
      coordinator.enqueue({ id: "dep2", branch } as never);
      coordinator.updateJob("dep2", {
        phase: "publishing",
        startedAt: new Date().toISOString(),
        baseMainSha,
        branchSha: candidateSha,
        candidateSha,
      });

      await orchestrator.processNext();

      const job = coordinator.getJob("dep2");
      expect(job?.phase).toBe("failed");
      expect(job?.reason).toMatch(/dependency install failed/i);
      expect(job?.reason).toMatch(/merge to main succeeded/i);
      expect(existsSync(join(root, "node_modules", ".marker", "installed"))).toBe(false);
    } finally {
      clean();
    }
  }, 30_000);

  it("refreshMainInstallAfterPublish skips when the publish diff has no package inputs", async () => {
    const { root, clean } = makeRepo();
    try {
      bootstrapWorkspace(root);
      const outcome = await refreshMainInstallAfterPublish(configFor(root), "abc", "def", [
        "src/a.ts",
      ]);
      expect(outcome).toEqual({ kind: "skipped" });
    } finally {
      clean();
    }
  });
});
