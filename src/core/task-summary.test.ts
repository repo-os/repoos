/**
 * Validation and prompt checks for the post-merge summary report (#1041).
 */
import { describe, expect, it } from "vitest";
import {
  GENERATED_CHANGES_MARKER,
  TASK_SUMMARY_MAX_WORDS,
  buildTaskSummaryPrompt,
  countSummaryNarrativeWords,
  formatTaskSummaryFileChanges,
  stripTaskSummaryMarkerLines,
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
  loadErrors: [],
  ...over,
});

describe("post-merge task summary", () => {
  it("lives beside the engineering and review reports", () => {
    expect(summaryReportRelPath({ workDir: "work" }, "1041")).toBe("work/reports/1041/summary.md");
  });

  it("requires ## TL;DR as the first non-blank line (raw and outside fences)", () => {
    expect(validateTaskSummary("## Outcome\n\nShipped.").length).toBeGreaterThan(0);
    const validMinimal = `## TL;DR\n\nShipped.\n\n## Outcome\n\nx\n\n## Process stats\n\nx\n\n## What went wrong\n\nx\n\n## Learnings\n\nx\n\n## Follow-ups\n\nNone`;
    expect(validateTaskSummary(validMinimal)).toEqual([]);
  });

  it("rejects a fenced preamble before ## TL;DR", () => {
    const md = [
      "```",
      "note",
      "```",
      "",
      "## TL;DR",
      "",
      "x",
      "",
      "## Outcome",
      "",
      "x",
      "",
      "## Process stats",
      "",
      "x",
      "",
      "## What went wrong",
      "",
      "x",
      "",
      "## Learnings",
      "",
      "x",
      "",
      "## Follow-ups",
      "",
      "x",
    ].join("\n");
    expect(validateTaskSummary(md).length).toBeGreaterThan(0);
  });

  it("does not treat headings inside fenced code as real sections", () => {
    const md = [
      "## TL;DR",
      "",
      "Intro.",
      "",
      "```md",
      "## Outcome",
      "fake",
      "```",
      "",
      "## Outcome",
      "",
      "Real.",
      "",
      "## Process stats",
      "",
      "x",
      "",
      "## What went wrong",
      "",
      "x",
      "",
      "## Learnings",
      "",
      "x",
      "",
      "## Follow-ups",
      "",
      "None",
    ].join("\n");
    expect(validateTaskSummary(md)).toEqual([]);
  });

  it("rejects wrong titles, order, and near-matches", () => {
    const wrongTitle = `## TL;DR\n\nx\n\n## Outcomes\n\nx\n\n## Process stats\n\nx\n\n## What went wrong\n\nx\n\n## Learnings\n\nx\n\n## Follow-ups\n\nx`;
    expect(validateTaskSummary(wrongTitle).some((e) => /order|Outcome|Outcomes/i.test(e))).toBe(
      true,
    );
    const outOfOrder = `## TL;DR\n\nx\n\n## Process stats\n\nx\n\n## Outcome\n\nx\n\n## What went wrong\n\nx\n\n## Learnings\n\nx\n\n## Follow-ups\n\nx`;
    expect(validateTaskSummary(outOfOrder).some((e) => /order/i.test(e))).toBe(true);
  });

  it("rejects an over-long narrative but ignores the file-changes listing", () => {
    const long = `## TL;DR\n\n${"word ".repeat(TASK_SUMMARY_MAX_WORDS + 1)}\n\n## Outcome\n\nx\n\n## Process stats\n\nx\n\n## What went wrong\n\nx\n\n## Learnings\n\nx\n\n## Follow-ups\n\nNone`;
    const errors = validateTaskSummary(long);
    expect(errors.filter((e) => e.includes("narrative is")).length).toBe(1);
    const withListing = `${`## TL;DR\n\n${"word ".repeat(TASK_SUMMARY_MAX_WORDS - 50)}`}\n\n## Outcome\n\nx\n\n## Process stats\n\nx\n\n## What went wrong\n\nx\n\n## Learnings\n\nx\n\n## Follow-ups\n\nNone\n\n${formatTaskSummaryFileChanges([{ path: "a.ts", status: "M", additions: "1", deletions: "2" }])}`;
    expect(countSummaryNarrativeWords(withListing)).toBeLessThanOrEqual(TASK_SUMMARY_MAX_WORDS);
    expect(validateTaskSummary(withListing)).toEqual([]);
  });

  it.each([
    ["no listing counts every word", "## TL;DR\n\none two three", 5],
    [
      "trailing listing is excluded",
      `## TL;DR\n\none two\n\n${formatTaskSummaryFileChanges([{ path: "a.ts", status: "M", additions: "100", deletions: "200" }])}`,
      4,
    ],
    [
      "mid-narrative heading cannot hide later words",
      "## TL;DR\n\none two\n\n## Changed files\n\nthree four five six",
      10,
    ],
    [
      "lookalike heading without the server marker counts fully",
      `## TL;DR\n\none\n\n## Generated change summary\n\n- M x`,
      8,
    ],
    ["document without headings counts fully", "just some words here", 4],
  ])("counts narrative words: %s", (_name, markdown, expected) => {
    expect(countSummaryNarrativeWords(markdown)).toBe(expected);
  });

  it("rejects a padded narrative hidden after a mid-text listing heading", () => {
    const padded = `## TL;DR\n\nok\n\n## Outcome\n\nx\n\n## Process stats\n\nx\n\n## What went wrong\n\nx\n\n## Learnings\n\nx\n\n## Follow-ups\n\nx\n\n## Changed files\n\n${"word ".repeat(TASK_SUMMARY_MAX_WORDS)}`;
    expect(validateTaskSummary(padded).length).toBe(1);
  });

  it.each([
    ["text without a marker is unchanged", "## TL;DR\n\none two", "## TL;DR\n\none two"],
    [
      "a lone marker line is removed",
      `## TL;DR\n\n${GENERATED_CHANGES_MARKER}\none`,
      "## TL;DR\n\none",
    ],
    [
      "a padded marker line is removed",
      `## TL;DR\n\n  ${GENERATED_CHANGES_MARKER}  \none`,
      "## TL;DR\n\none",
    ],
    [
      "multiple markers are all removed, surrounding text kept",
      `## TL;DR\n\none\n${GENERATED_CHANGES_MARKER}\ntwo\n${GENERATED_CHANGES_MARKER}\nthree`,
      "## TL;DR\n\none\ntwo\nthree",
    ],
    [
      "a lookalike heading is kept — only the exact marker is a protocol token",
      "## TL;DR\n\none\n\n## Changed files\n\ntwo",
      "## TL;DR\n\none\n\n## Changed files\n\ntwo",
    ],
    ["empty stays empty", "", ""],
  ])("strips server marker lines: %s", (_name, markdown, expected) => {
    expect(stripTaskSummaryMarkerLines(markdown)).toBe(expected);
  });

  it("rejects padding hidden after an injected server marker", () => {
    const injected = `## TL;DR\n\nok\n\n## Outcome\n\nx\n\n## Process stats\n\nx\n\n## What went wrong\n\nx\n\n## Learnings\n\nx\n\n## Follow-ups\n\nx\n${GENERATED_CHANGES_MARKER}\n${"word ".repeat(TASK_SUMMARY_MAX_WORDS)}`;
    // Without stripping, the tail after the marker would evade validation, but the marker itself doesn't pass validation without sections.
    const errors = validateTaskSummary(injected);
    expect(errors.filter((e) => !e.includes("Task summary narrative is")).length).toBe(0);
    const sanitized = stripTaskSummaryMarkerLines(injected);
    expect(validateTaskSummary(sanitized).length).toBe(1);
  });

  it("formats an unavailable changed-files reason for the listing", () => {
    const out = formatTaskSummaryFileChanges([], { unavailableReason: "numstat: bogus" });
    expect(out).toContain("Changed files unavailable: numstat: bogus");
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
