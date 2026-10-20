import { afterEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { captureBrowserEvidence } from "../../../scripts/remote-runner/capture-browser.js";
import { worktreesDir } from "../../core/config.js";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("remote browser capture result artifact", () => {
  it("writes the actual setup error to result.json when capture cannot start", async () => {
    const output = mkdtempSync(join(tmpdir(), "repoos-browser-result-"));
    roots.push(output);
    const result = await captureBrowserEvidence(
      join(output, "missing-repo"),
      "0854",
      "shots",
      output,
    );
    const artifact = JSON.parse(readFileSync(join(output, "result.json"), "utf8")) as {
      ok: boolean;
      detail: string;
      results: { error: string };
    };
    expect(result.ok).toBe(false);
    expect(artifact.ok).toBe(false);
    expect(artifact.detail).toContain("Task #0854 was not found");
    expect(artifact.results.error).toBe(artifact.detail);
  });

  it("resolves the linked task worktree from the explicit runner repo root", async () => {
    const parent = mkdtempSync(join(tmpdir(), "repoos-browser-worktree-layout-"));
    roots.push(parent);
    const repoRoot = join(parent, "repo");
    mkdirSync(join(repoRoot, "work"), { recursive: true });
    const git = (args: string[]) => execFileSync("git", args, { cwd: repoRoot, stdio: "ignore" });
    git(["init", "-b", "main"]);
    git(["config", "user.email", "runner-test@example.com"]);
    git(["config", "user.name", "Runner test"]);
    writeFileSync(
      join(repoRoot, "work/0854-test.md"),
      '---\nid: "0854"\ntitle: Runner layout fixture\nstatus: review\nbranch: feat/runner-layout\narea: core\n---\n',
    );
    writeFileSync(join(repoRoot, "README.md"), "fixture\n");
    git(["add", "."]);
    git(["commit", "-m", "fixture"]);
    const linked = join(worktreesDir(repoRoot), "feat/runner-layout");
    mkdirSync(join(linked, ".."), { recursive: true });
    git(["worktree", "add", "-b", "feat/runner-layout", linked, "HEAD"]);

    const output = join(parent, "artifacts");
    const result = await captureBrowserEvidence(repoRoot, "0854", "verify", output);
    const artifact = JSON.parse(readFileSync(join(output, "result.json"), "utf8")) as {
      ok: boolean;
      results: { verification?: { ok?: boolean; skipped?: boolean } };
    };
    expect(result.ok).toBe(true);
    expect(artifact.ok).toBe(true);
    expect(artifact.results.verification).toMatchObject({ ok: true, skipped: true });
  });
});
