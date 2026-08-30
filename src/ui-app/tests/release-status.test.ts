import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RepoOSConfig } from "../../core/types";
import { cutNewRelease, getReleaseStatus, type ReleaseCommandRunner } from "../../server/release";

const roots: string[] = [];
afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })));

function config(): RepoOSConfig {
  const root = mkdtempSync(join(tmpdir(), "repoos-release-ui-"));
  roots.push(root);
  writeFileSync(join(root, "package.json"), JSON.stringify({ version: "1.2.3" }));
  return {
    root,
    workDir: "work",
    docsDir: "docs",
    skillsDir: "skills",
    taskExtensions: [".md"],
    defaultStatus: "inbox",
    defaultAssignee: "unassigned",
    cacheDir: ".repoos",
    release: { enabled: true, provider: "git-tag", repository: "repo-os/repoos" },
  };
}

function git({
  dirty = "",
  tag = "",
}: { dirty?: string; tag?: string } = {}): ReleaseCommandRunner {
  return async (_command, args) => {
    const key = args.join(" ");
    if (key === "branch --show-current") return { code: 0, stdout: "main\n", stderr: "" };
    if (key === "status --porcelain") return { code: 0, stdout: dirty, stderr: "" };
    if (key === "rev-parse --short HEAD") return { code: 0, stdout: "abc123\n", stderr: "" };
    if (key === "describe --tags --abbrev=0") return { code: 0, stdout: "v1.2.2\n", stderr: "" };
    if (key === "tag --list v1.2.3") return { code: 0, stdout: tag, stderr: "" };
    return { code: 1, stdout: "", stderr: "" };
  };
}

describe("git-tag release status", () => {
  it("is invisible when no repository opts in", async () => {
    const status = await getReleaseStatus({ ...config(), release: undefined }, git());
    expect(status).toMatchObject({ enabled: false, ready: false });
  });

  it("is ready only on clean configured main with a new tag", async () => {
    const status = await getReleaseStatus(config(), git());
    expect(status).toMatchObject({
      ready: true,
      tag: "v1.2.3",
      releaseUrl: "https://github.com/repo-os/repoos/releases/tag/v1.2.3",
    });
  });

  it("does not offer a duplicate or dirty release", async () => {
    const status = await getReleaseStatus(
      config(),
      git({ dirty: " M src/a.ts\n", tag: "v1.2.3\n" }),
    );
    expect(status.ready).toBe(false);
    expect(status.released).toBe(true);
    expect(status.blockers).toEqual(
      expect.arrayContaining([
        "Commit or stash all working-tree changes first.",
        "v1.2.3 already exists.",
      ]),
    );
  });

  it("commits the chosen version before verifying, pushing main, and pushing its tag", async () => {
    const cfg = config();
    const calls: string[] = [];
    const runner: ReleaseCommandRunner = async (command, args) => {
      calls.push([command, ...args].join(" "));
      if (command !== "git") return { code: 0, stdout: "check passed", stderr: "" };
      if (["add", "commit", "push"].includes(args[0]) || (args[0] === "tag" && args[1] === "-a")) {
        return { code: 0, stdout: "", stderr: "" };
      }
      return git()("git", args, cfg.root);
    };
    const result = await cutNewRelease(cfg, "1.2.4", "v1.2.4", runner);
    expect(result.ok).toBe(true);
    expect(JSON.parse(readFileSync(join(cfg.root, "package.json"), "utf8")).version).toBe("1.2.4");
    expect(calls).toEqual(
      expect.arrayContaining([
        "git add -- package.json",
        "git commit -m release: v1.2.4",
        "git push origin main",
        "git tag -a v1.2.4 -m Release v1.2.4",
        "git push origin v1.2.4",
      ]),
    );
  });
});
