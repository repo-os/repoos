/**
 * #0909 review: `repoos new` must finish the (async, model-backed) human-step
 * assessment BEFORE its first commit, so `needs_input` lands in the commit and
 * not only on disk afterwards. A slow mocked decision model proves the order.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rmFixture } from "./helpers";
import { cmdNew } from "../../commands/tasks";

function git(root: string, args: string[]): string {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

describe("cmdNew awaits the human-step assessment before committing (#0909)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("commits needs_input from a slow model decision in the first commit", async () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-newawait-"));
    git(root, ["init", "-q", "-b", "main"]);
    git(root, ["config", "user.email", "t@example.com"]);
    git(root, ["config", "user.name", "Test"]);
    mkdirSync(join(root, "work"), { recursive: true });
    writeFileSync(
      join(root, "repoos.toml"),
      'model_routing.mode = "automatic"\nmodel_routing.provider = "jev"\nmodel_routing.humanStepCheck = true\n',
    );
    git(root, ["add", "-A"]);
    git(root, ["commit", "-q", "-m", "init"]);
    vi.spyOn(
      await import("../../server/human-step-decision.js"),
      "runHumanStepDecisionCheck",
    ).mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 150));
      return {
        outcome: "human",
        detail: "Decision model (91%): needs a real account.",
        decision: {
          needsHumanStep: true,
          probability: 0.91,
          reason: "account",
          explanation: "Decision model (91%): needs a real account.",
        },
      };
    });
    const prev = process.cwd();
    process.chdir(root);
    try {
      await cmdNew([
        "Sign up for a third-party account",
        "--body",
        "## Problem\n\nCreate an account with the vendor and paste the API key.\n\n## Acceptance criteria\n\n- A real account exists.\n",
      ]);
    } finally {
      process.chdir(prev);
    }
    try {
      const file = git(root, ["ls-tree", "--name-only", "HEAD", "work/"]).split("\n")[0];
      expect(file).toBeTruthy();
      const committed = git(root, ["show", `HEAD:${file}`]);
      expect(committed).toMatch(/^needs_input: true$/m);
      expect(git(root, ["status", "--porcelain", "work/"])).toBe("");
    } finally {
      rmFixture(root);
    }
  }, 30_000);
});
