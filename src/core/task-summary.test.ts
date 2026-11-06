/**
 * Validation and prompt checks for the post-merge summary report (#1041).
 */
import { describe, expect, it } from "vitest";
import {
  TASK_SUMMARY_MAX_WORDS,
  buildTaskSummaryPrompt,
  countSummaryNarrativeWords,
  formatTaskSummaryFileChanges,
  summaryReportRelPath,
  validateTaskSummary,
  type TaskSummaryFacts,
} from "./task-summary.js";

const facts = (over: Partial<TaskSummaryFacts> = {}): TaskSummaryFacts => ({
  taskId: "1041",
  title: "Post-merge task summary report",
  type: "feature",
  area: "core, web",
  priority: "p2",
  status: "done",
  branch: "feat/x",
  createdAt: "2026-11-06T04:37:35Z",
  updatedAt: "2026-11-06T06:00:00Z",
  mergedCommit: null,
  body: "Some body text.",
  activity: ["2026-11-06T04:37:35Z · created · human"],
  rounds: [],
  reviews: [],
  sessions: [],
  linked: [],
  ...over,
});

describe("post-merge task summary", () => {
  it("lives beside the engineering and review reports", () => {
    expect(summaryReportRelPath({ workDir: "work" }, "1041")).toBe("work/reports/1041/summary.md");
  });

  it("requires a leading ## TL;DR", () => {
    expect(validateTaskSummary("## Outcome\n\nShipped.")).toContain(
      "Task summary must begin with ## TL;DR; remove any text before it.",
    );
    expect(validateTaskSummary("## TL;DR\n\nShipped.")).toEqual([]);
  });

  it("rejects an over-long narrative but ignores the file-changes listing", () => {
    const long = `## TL;DR\n\n${"word ".repeat(TASK_SUMMARY_MAX_WORDS + 1)}`;
    expect(validateTaskSummary(long).length).toBe(1);
    const withListing = `${`## TL;DR\n\n${"word ".repeat(TASK_SUMMARY_MAX_WORDS - 10)}`}\n\n${formatTaskSummaryFileChanges([{ path: "a.ts", status: "M", additions: "1", deletions: "2" }])}`;
    expect(countSummaryNarrativeWords(withListing)).toBeLessThanOrEqual(TASK_SUMMARY_MAX_WORDS);
    expect(validateTaskSummary(withListing)).toEqual([]);
  });

  it("builds a prompt with the required sections and a no-invented-numbers rule", () => {
    const prompt = buildTaskSummaryPrompt(
      facts({
        rounds: [
          {
            round: 1,
            at: "t",
            agent: "e",
            model: "m",
            branch: "b",
            wordCount: 10,
            markdown: "## TL;DR\n\nr1",
          },
        ],
      }),
    );
    for (const section of [
      "## TL;DR",
      "## Outcome",
      "## Process stats",
      "## What went wrong",
      "## Learnings",
      "## Follow-ups",
    ])
      expect(prompt).toContain(section);
    expect(prompt).toMatch(/MUST come from the recorded facts/);
    expect(prompt).toContain("Round 1");
  });
});
