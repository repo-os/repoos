import { describe, expect, it, vi } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  commitStoryFileWithRetry,
  sweepOrphanedBookkeeping,
} from "../../server/orphan-bookkeeping";
import { mainDirtyCloseOutReason } from "../../server/request-close-out";

function repo(): { root: string; clean: () => void } {
  const root = mkdtempSync(join(tmpdir(), "repoos-orphan-sweep-"));
  const git = (args: string[]) => execFileSync("git", args, { cwd: root, stdio: "ignore" });
  git(["init", "-q"]);
  git(["config", "user.name", "RepoOS test"]);
  git(["config", "user.email", "repoos-test@example.com"]);
  mkdirSync(join(root, "stories"), { recursive: true });
  mkdirSync(join(root, "work"), { recursive: true });
  writeFileSync(join(root, "seed"), "seed");
  git(["add", "-A"]);
  git(["commit", "-m", "seed"]);
  return { root, clean: () => rmSync(root, { recursive: true, force: true }) };
}

describe("story commit retry and orphan sweep", () => {
  it("retries a transient commit failure and succeeds", async () => {
    const commit = vi.fn().mockReturnValueOnce(false).mockReturnValueOnce(true);
    await expect(
      commitStoryFileWithRetry("/repo", "/repo/stories/a.md", "add", commit),
    ).resolves.toBe(true);
    expect(commit).toHaveBeenCalledTimes(2);
  });

  it("leaves a warning condition after exhausted attempts, then sweep commits the orphan", async () => {
    const fixture = repo();
    try {
      const story = join(fixture.root, "stories", "orphan.md");
      writeFileSync(story, "---\nid: '0001'\ntitle: Orphan\ncreated_by: api\n---\nBody\n");
      const commit = vi.fn().mockReturnValue(false);
      await expect(commitStoryFileWithRetry(fixture.root, story, "add", commit)).resolves.toBe(
        false,
      );
      expect(commit).toHaveBeenCalledTimes(3);
      await expect(sweepOrphanedBookkeeping(fixture.root)).resolves.toEqual(["stories/orphan.md"]);
      const committed = execFileSync("git", ["ls-tree", "-r", "--name-only", "HEAD"], {
        cwd: fixture.root,
        encoding: "utf8",
      });
      expect(committed).toContain("stories/orphan.md");
      expect(readFileSync(story, "utf8")).toContain("created_by: api");
    } finally {
      fixture.clean();
    }
  });

  it("does not commit untracked files without RepoOS creator metadata", async () => {
    const fixture = repo();
    try {
      writeFileSync(join(fixture.root, "work", "human.md"), "---\ntitle: Human\n---\n");
      await expect(sweepOrphanedBookkeeping(fixture.root)).resolves.toEqual([]);
    } finally {
      fixture.clean();
    }
  });

  it("names dirty orphans and the checkpoint action in close-out refusal", () => {
    const reason = mainDirtyCloseOutReason(["stories/orphan.md", "work/0099-new.md"]);
    expect(reason).toContain("stories/orphan.md");
    expect(reason).toContain("work/0099-new.md");
    expect(reason).toContain("Commit & continue");
  });
});
