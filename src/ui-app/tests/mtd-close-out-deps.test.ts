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
import { refreshMainDependencyInstall } from "../../core/dependency-install.js";
import type { RepoOSConfig } from "../../core/types.js";

function git(root: string, args: string[]): string {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

function makeRepo(): { root: string; clean: () => void } {
  const root = mkdtempSync(join(tmpdir(), "repoos-mtd-deps-"));
  git(root, ["init", "-q", "-b", "main"]);
  git(root, ["config", "user.email", "t@example.com"]);
  git(root, ["config", "user.name", "Test"]);
  return { root, clean: () => rmFixture(root) };
}

describe("post-publish main refresh (#0674)", () => {
  it("refreshes main after a lockfile-changing merge so symlink candidates stay valid", async () => {
    const { root, clean } = makeRepo();
    try {
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
      chmodSync(join(root, "scripts", "fake-install.sh"), 0o755);
      git(root, ["add", "."]);
      git(root, ["commit", "-m", "bootstrap workspace"]);

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

      const cfg = {
        root,
        workDir: "work",
        cacheDir: ".repoos",
        defaultStatus: "inbox",
        defaultAssignee: "unassigned",
        closeOut: { timeoutMs: 360_000, postPublishCommand: "sh scripts/fake-install.sh" },
      } as RepoOSConfig;

      const res = await refreshMainDependencyInstall(cfg);
      expect(res.ok).toBe(true);
      expect(existsSync(join(root, "node_modules", ".marker", "installed"))).toBe(true);
      expect(readFileSync(join(root, "apps", "web", "package.json"), "utf8")).toContain("lodash");
    } finally {
      clean();
    }
  });
});
