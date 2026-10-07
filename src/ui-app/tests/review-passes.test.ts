/**
 * #0733 — review pass records carry the reviewer coding agent + model.
 *
 * The drawer renders one table row per review pass (newest first). Every field
 * that row shows — pass number, timestamp, state, verdict, and the reviewer
 * agent/model that ran it — must come back from `listReviewPasses`, so this
 * exercises the reader against real pass files on disk.
 */
import { describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { listReviewPasses, reviewPassPath } from "../../core/review-passes";
import type { RepoOSConfig } from "../../core/types";

function config(root: string): RepoOSConfig {
  return {
    root,
    workDir: "work",
    docsDir: "docs",
    skillsDir: "skills",
    taskExtensions: [".md"],
    defaultStatus: "inbox",
    defaultAssignee: "unassigned",
    cacheDir: ".repoos",
  };
}

/** A pass file exactly as the server writes it (`MonitoredReview.write`). */
function writePass(
  cfg: RepoOSConfig,
  taskId: string,
  pass: number,
  fields: { at: string; state?: string; agent?: string; cli?: string; model?: string; body: string },
): void {
  const file = reviewPassPath(cfg, taskId, pass);
  mkdirSync(join(cfg.root, cfg.cacheDir!, "reviews", taskId), { recursive: true });
  const fm = [
    `task: "${taskId}"`,
    `pass: ${pass}`,
    `at: "${fields.at}"`,
    `agent: "${fields.agent ?? ""}"`,
    `cli: "${fields.cli ?? ""}"`,
    `model: "${fields.model ?? ""}"`,
    `branch: "feat/${taskId}"`,
    `state: "${fields.state ?? "ok"}"`,
  ].join("\n");
  writeFileSync(file, `---\n${fm}\n---\n\n${fields.body}\n`);
}

describe("listReviewPasses (#0733)", () => {
  it("returns pass number, timestamp, verdict and the reviewer agent/model for every run", () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-rp-"));
    try {
      const cfg = config(root);
      writePass(cfg, "0733", 1, {
        at: "2026-10-06T01:00:00Z",
        agent: "opencode",
        cli: "opencode",
        model: "deepseek-v4",
        body: "## Verdict\n\nGood to go.",
      });
      writePass(cfg, "0733", 2, {
        at: "2026-10-07T02:00:00Z",
        agent: "claude",
        cli: "claude",
        model: "opus-4",
        body: "Verdict: needs changes.",
      });

      const passes = listReviewPasses(cfg, "0733");
      expect(passes.map((p) => p.pass)).toEqual([1, 2]);

      expect(passes[0]).toMatchObject({
        pass: 1,
        at: "2026-10-06T01:00:00Z",
        agent: "opencode",
        cli: "opencode",
        model: "deepseek-v4",
        verdict: "good to go",
      });
      expect(passes[1]).toMatchObject({
        pass: 2,
        at: "2026-10-07T02:00:00Z",
        agent: "claude",
        cli: "claude",
        model: "opus-4",
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("keeps agent/model empty (not invented) when a legacy pass file lacks them", () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-rp-"));
    try {
      const cfg = config(root);
      const dir = join(cfg.root, cfg.cacheDir!, "reviews", "0733");
      mkdirSync(dir, { recursive: true });
      writeFileSync(
        join(dir, "1.md"),
        `---\ntask: "0733"\npass: 1\nat: "2026-10-01T00:00:00Z"\nstate: ok\n---\n\nGood to go.\n`,
      );

      const [pass] = listReviewPasses(cfg, "0733");
      expect(pass.agent).toBe("");
      expect(pass.model).toBe("");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
