import type {
  AgentOutputEntry,
  ReviewReport,
  ShotMeta,
  Task,
  TaskLogEntry,
} from "../../../src/types";

/**
 * Long-content fixtures for the task drawer's QA pass (#1221).
 *
 * Everything the drawer renders in its long-content surfaces is oversized here:
 * a very long task body, a many-file diff whose code lines are far wider than
 * any drawer width, 24 captured shots, a 60-paragraph review report, a 120-line
 * agent transcript and a 120-entry task log. Lines intentionally use one
 * unbroken token so wrapping cannot hide a horizontal-overflow bug.
 *
 * Consumed by the harness entry (as transport responses) and asserted against
 * by the browser test, so the test and the rendered content can never drift
 * apart.
 */

/** One long unbroken token — wrapping must never split or clip it silently. */
const token = "fixture/unbroken-path-segment/".repeat(8);
const sentence = `${token} tail-${Math.random().toString(36).slice(2, 6)}`;

export const longTaskBody = [
  "## Problem",
  ...Array.from(
    { length: 12 },
    (_, i) => `Paragraph ${i + 1}: ${sentence} ${"detail ".repeat(10)}`,
  ),
  "## Step-by-step guide",
  ...Array.from(
    { length: 10 },
    (_, i) => `${i + 1}. ${sentence} — verify the drawer keeps every control reachable.`,
  ),
].join("\n");

export const fixtureTask: Task = {
  id: "0001",
  title: `QA fixture: long drawer content — ${token}`,
  type: "bug",
  status: "active",
  priority: "p2",
  area: "web",
  assignee: "ai",
  assignedTo: "ai",
  createdBy: "t@t",
  branch: "feat/drawer-long-content-fixture",
  tags: [],
  needsInput: false,
  needsMerge: false,
  created_at: "2026-11-19T06:47:59Z",
  updated_at: "2026-11-19T06:47:59Z",
  path: "work/0001-qa-fixture-long-drawer-content-that-must-never-overflow.md",
  absPath: "/tmp/repo/work/0001-qa-fixture-long-drawer-content-that-must-never-overflow.md",
  body: longTaskBody,
  extra: {},
  agentOverride: null,
  cliOverride: null,
  modelOverride: null,
  git: {
    branchExists: true,
    worktreeExists: true,
    lastCommit: "fixture",
    lastCommitAt: "2026-11-19T06:47:59Z",
    worktreePath: "/tmp/repo/.worktrees/0001",
    dirty: false,
  },
  preview: null,
  automaticReview: { running: false, enabled: false },
};

/** Six files, each with 40 unbroken ~200-char code lines. */
export const fixtureDiff = {
  truncated: false,
  patch: Array.from({ length: 6 }, (_, f) => {
    const name = `src/fixture/module-${f + 1}/very-long-module-name-${f + 1}.ts`;
    const body = Array.from(
      { length: 40 },
      (_, i) => `+export const fixtureLine${f + 1}_${i + 1} = "${token}line-${f + 1}-${i + 1}";`,
    ).join("\n");
    return [
      `diff --git a/${name} b/${name}`,
      "index 1111111..2222222 100644",
      `--- a/${name}`,
      `+++ b/${name}`,
      "@@ -1,3 +1,43 @@",
      ' import { existing } from "./existing";',
      body,
      " ",
    ].join("\n");
  }).join("\n"),
};

const svg = (label: string) =>
  `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="200"><rect width="320" height="200" fill="#1c2434"/><text x="20" y="100" fill="#9fd6ff" font-family="monospace" font-size="18">${label}</text></svg>`,
  )}`;

export const fixtureShots: ShotMeta[] = Array.from({ length: 24 }, (_, i) => ({
  name: `qa-fixture-default-work-${String(i + 1).padStart(2, "0")}.webp`,
  target: "default",
  route: i % 2 === 0 ? "/work" : "/",
  label: `Fixture shot ${i + 1}`,
  provenance: "declared: Fixture shot",
  url: svg(`fixture shot ${i + 1}`),
  path: `shots/qa-fixture-default-work-${String(i + 1).padStart(2, "0")}.webp`,
  size: 48_000 + i,
  mime: "image/webp",
  capturedAt: "2026-11-19T06:47:59Z",
}));

export const fixtureReviewReport: ReviewReport = {
  id: "0001",
  at: "2026-11-19T07:08:55.458Z",
  agent: "reviewer",
  cli: "fixture",
  model: "fixture",
  branch: "feat/drawer-long-content-fixture",
  state: "ok",
  markdown: [
    "## Verdict",
    "",
    "good to go",
    "",
    "## Findings",
    ...Array.from(
      { length: 60 },
      (_, i) => `Paragraph ${i + 1}: ${sentence} ${"finding detail ".repeat(8)}`,
    ),
  ].join("\n"),
};

export const fixtureLogs: TaskLogEntry[] = Array.from({ length: 120 }, (_, i) => ({
  timestamp: new Date(2026, 10, 19, 6, 48, i).toISOString(),
  level: i % 17 === 0 ? "warn" : "info",
  component: i % 3 === 0 ? "agent" : "task",
  message: `Log entry ${i + 1}: ${sentence} ${"state detail ".repeat(6)}`,
}));

export const fixtureOutput: AgentOutputEntry[] = Array.from({ length: 120 }, (_, i) =>
  i % 19 === 0
    ? { s: "err" as const, d: `error line ${i + 1}: ${sentence}` }
    : { s: "out" as const, d: `transcript line ${i + 1}: ${sentence} ${"output ".repeat(6)}` },
);
