import { describe, expect, it } from "vitest";
import { classifyTakeMainReviewMerge } from "../take-main-review.js";

function gitFor(overrides: Record<string, { status: number; stdout: string }> = {}) {
  return {
    async runGit(_cwd: string, args: string[]) {
      const key = args.join(" ");
      const result = overrides[key] ?? { status: 0, stdout: "" };
      return { ...result, stderr: "" };
    },
  };
}

describe("classifyTakeMainReviewMerge", () => {
  it("accepts net changes whose merged blobs match main", async () => {
    const git = gitFor({
      "status --porcelain": { status: 0, stdout: "" },
      "rev-list --parents -n 1 head": { status: 0, stdout: "head reviewed main" },
      "merge-base --is-ancestor reviewed reviewed": { status: 0, stdout: "" },
      "diff --name-only -z reviewed head": { status: 0, stdout: "src/a.ts\0" },
      "rev-parse head:src/a.ts": { status: 0, stdout: "blob1\n" },
      "rev-parse main:src/a.ts": { status: 0, stdout: "blob1\n" },
    });
    const result = await classifyTakeMainReviewMerge(git, "/repo/worktree", "reviewed", "head");
    expect(result.safe).toBe(true);
  });

  it("refuses a path whose merged blob differs from main", async () => {
    const git = gitFor({
      "status --porcelain": { status: 0, stdout: "" },
      "rev-list --parents -n 1 head": { status: 0, stdout: "head reviewed main" },
      "merge-base --is-ancestor reviewed reviewed": { status: 0, stdout: "" },
      "diff --name-only -z reviewed head": { status: 0, stdout: "src/a.ts\0" },
      "rev-parse head:src/a.ts": { status: 0, stdout: "branch blob\n" },
      "rev-parse main:src/a.ts": { status: 0, stdout: "main blob\n" },
    });
    const result = await classifyTakeMainReviewMerge(git, "/repo/worktree", "reviewed", "head");
    expect(result.safe).toBe(false);
    expect(result.reason).toContain("src/a.ts");
  });
});
