import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { finalizeEngineeringReport, listEngineeringReports } from "../engineering-reports.js";
import { reviewMission } from "../review.js";

const narrative = `## TL;DR\nRecorded a concise summary.\n\n## Work and rationale\nChanged the implementation to preserve task context.\n\n## Approaches tried\nCompared the existing persistence patterns and selected tracked artifacts.\n\n## Challenges and blockers\nThe handoff gate must bind this report to the checked source tree.\n\n## Key learnings\nKeep generated Git facts separate from engineer-authored narrative.`;

describe("engineering reports", () => {
  let root: string;
  const git = (args: string) => execSync(`git -C "${root}" ${args}`, { encoding: "utf8" }).trim();
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "repoos-engineering-report-"));
    git("init -b main");
    git('config user.email "tests@example.com"');
    git('config user.name "RepoOS tests"');
    mkdirSync(join(root, "src"), { recursive: true });
    writeFileSync(join(root, "src", "old.ts"), "one\ntwo\n");
    git("add .");
    git('commit -m "base"');
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it("computes a tree-bound diff, stores immutable rounds, and rejects retries over the limit", async () => {
    const baseSha = git("rev-parse HEAD");
    git("mv src/old.ts src/new.ts");
    writeFileSync(join(root, "src", "new.ts"), "one\ntwo\nthree\n");
    git("add .");
    git('commit -m "implementation"');
    const sourceSha = git("rev-parse HEAD");
    const cacheDir = ".repoos";
    const draftDir = join(root, cacheDir, "engineering-report-drafts");
    mkdirSync(draftDir, { recursive: true });
    writeFileSync(join(draftDir, "T1.md"), narrative);
    const config = { root, cacheDir } as any;
    const args = {
      config,
      taskId: "T1",
      workdir: root,
      branch: "feat/report",
      agent: "codex",
      model: "test-model",
      baseSha,
      sourceSha,
    };
    const first = await finalizeEngineeringReport(args);
    expect(first.error).toBeUndefined();
    expect(first.report?.markdown).toContain("## Generated change summary");
    expect(first.report?.markdown).toContain("src/old.ts → src/new.ts");
    expect(first.report?.markdown).toContain("+1 / −0");
    expect(first.report?.sourceSha).toBe(sourceSha);
    expect(first.report?.wordCount).toBeGreaterThan(0);
    expect(listEngineeringReports(config, "T1")).toHaveLength(1);
    expect(existsSync(join(root, "work", "engineering-reports", "T1", "round-1.json"))).toBe(true);
    const mission = reviewMission(
      {
        id: "T1",
        title: "report test",
        body: "Task spec",
        branch: "feat/report",
        extra: {},
      } as any,
      { instructions: "Review carefully." } as any,
      root,
      "main",
      { ...config, review: {} } as any,
      { engineeringReportMatches: false },
    );
    expect(mission).toContain("Engineering round 1");
    expect(mission).toContain("STALE REPORT");
    expect(mission).toContain(
      "consider the engineer's rationale, experiments, blockers, and limitations",
    );
    expect(mission).toContain("Recorded a concise summary.");
    const retry = await finalizeEngineeringReport(args);
    expect(retry.report?.round).toBe(1);
    expect(listEngineeringReports(config, "T1")).toHaveLength(1);

    writeFileSync(join(root, "src", "new.ts"), "one\ntwo\nthree\nfour\n");
    git("add .");
    git('commit -m "fix round"');
    const nextArgs = { ...args, sourceSha: git("rev-parse HEAD") };
    writeFileSync(
      join(draftDir, "T1.md"),
      narrative.replace("preserve task context", "improve task context"),
    );
    const secondRound = await finalizeEngineeringReport(nextArgs);
    expect(secondRound.report?.round).toBe(2);
    expect(listEngineeringReports(config, "T1")).toHaveLength(2);

    writeFileSync(join(draftDir, "T1.md"), `${narrative} ${"long ".repeat(1001)}`);
    const tooLong = await finalizeEngineeringReport(args);
    expect(tooLong.error).toContain("1–1,000 words");
    expect(listEngineeringReports(config, "T1")).toHaveLength(2);
  });

  it("requires every narrative section in the prescribed order", async () => {
    const baseSha = git("rev-parse HEAD");
    writeFileSync(join(root, "src", "old.ts"), "changed\n");
    git("add .");
    git('commit -m "implementation"');
    const sourceSha = git("rev-parse HEAD");
    const cacheDir = ".repoos";
    const draftDir = join(root, cacheDir, "engineering-report-drafts");
    mkdirSync(draftDir, { recursive: true });
    const config = { root, cacheDir } as any;
    const args = {
      config,
      taskId: "T1",
      workdir: root,
      branch: "feat/report",
      agent: "codex",
      model: "test-model",
      baseSha,
      sourceSha,
    };
    writeFileSync(join(draftDir, "T1.md"), narrative.replace("## TL;DR", "## Work and rationale"));
    const missing = await finalizeEngineeringReport(args);
    expect(missing.error).toContain("missing required sections");
    const reordered = narrative
      .replace("## TL;DR", "## TEMP SECTION")
      .replace("## Work and rationale", "## TL;DR")
      .replace("## TEMP SECTION", "## Work and rationale");
    writeFileSync(join(draftDir, "T1.md"), reordered);
    const unordered = await finalizeEngineeringReport(args);
    expect(unordered.error).toContain("required order");
    expect(listEngineeringReports(config, "T1")).toHaveLength(0);
  });

  it("enforces the word limit after adding the generated file summary", async () => {
    const baseSha = git("rev-parse HEAD");
    for (let index = 0; index < 140; index++) {
      writeFileSync(join(root, "src", `generated-report-file-${index}.ts`), "line\n");
    }
    git("add .");
    git('commit -m "many changed files"');
    const sourceSha = git("rev-parse HEAD");
    const draftDir = join(root, ".repoos", "engineering-report-drafts");
    mkdirSync(draftDir, { recursive: true });
    writeFileSync(join(draftDir, "T1.md"), `${narrative} ${"lesson ".repeat(700)}`);
    const config = { root, cacheDir: ".repoos" } as any;
    const result = await finalizeEngineeringReport({
      config,
      taskId: "T1",
      workdir: root,
      branch: "feat/report",
      agent: "codex",
      model: "test-model",
      baseSha,
      sourceSha,
    });

    expect(result.report).toBeNull();
    expect(result.error).toContain("including its generated change summary");
    expect(result.error).toContain("final report has");
    expect(listEngineeringReports(config, "T1")).toHaveLength(0);
  });

  it("fails clearly when the engineer draft is missing", async () => {
    const baseSha = git("rev-parse HEAD");
    const result = await finalizeEngineeringReport({
      config: { root, cacheDir: ".repoos" } as any,
      taskId: "T1",
      workdir: root,
      branch: "feat/report",
      agent: "codex",
      model: "test-model",
      baseSha,
      sourceSha: baseSha,
    });
    expect(result.report).toBeNull();
    expect(result.error).toContain("Engineering report draft is missing");
  });

  it("summarizes added and deleted files independently", async () => {
    const baseSha = git("rev-parse HEAD");
    rmSync(join(root, "src", "old.ts"));
    writeFileSync(join(root, "src", "added.ts"), "new\nfile\n");
    git("add -A");
    git('commit -m "replace file"');
    const sourceSha = git("rev-parse HEAD");
    const draftDir = join(root, ".repoos", "engineering-report-drafts");
    mkdirSync(draftDir, { recursive: true });
    writeFileSync(join(draftDir, "T1.md"), narrative);
    const result = await finalizeEngineeringReport({
      config: { root, cacheDir: ".repoos" } as any,
      taskId: "T1",
      workdir: root,
      branch: "feat/report",
      agent: "codex",
      model: "test-model",
      baseSha,
      sourceSha,
    });
    expect(result.report?.markdown).toContain("A src/added.ts: +2 / −0");
    expect(result.report?.markdown).toContain("D src/old.ts: +0 / −2");
  });
});
