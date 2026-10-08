/**
 * Mechanical review verification (#0714): after the review agent finishes, RepoOS
 * checks handoff browser evidence and guard-test coverage on the branch diff.
 * Failures clamp a `good to go` verdict to `needs some work` and are recorded in
 * the report under `## Automated verification`.
 */
import type { PageGateIssue } from "./page-browser-gate.js";
import { isBenignFailedResourceUrl } from "./page-browser-gate.js";
import type { ReviewVerdict } from "./review-verdict.js";
import { parseReviewVerdict, replaceReviewVerdict } from "./review-verdict.js";

/** Outcome of one mechanical check — never conflate skipped with passed. */
export type ReviewMechanicalCheckStatus = "passed" | "failed" | "skipped" | "not_run";

export interface ConsoleErrorReviewCheck {
  status: ReviewMechanicalCheckStatus;
  detail: string;
  /** Blocking console/page issues when status is `failed`. */
  issues?: PageGateIssue[];
}

export interface GuardNegativeTestCheck {
  guardId: string;
  status: ReviewMechanicalCheckStatus;
  detail: string;
  /** Changed test files that satisfied the negative-test requirement. */
  evidenceTests?: string[];
}

export interface ReviewVerificationResult {
  consoleErrors: ConsoleErrorReviewCheck;
  guardTests: GuardNegativeTestCheck[];
  /** True when a clean human sign-off must wait on fixes. */
  blocksApproval: boolean;
}

/**
 * Console / page errors that count at review time. Request failures use the same
 * benign URL allowlist as the handoff gate (#0680); documented exceptions stay
 * narrow and live in `page-browser-gate.ts`.
 */
export function isBlockingBrowserIssueForReview(issue: PageGateIssue): boolean {
  if (issue.kind === "console" || issue.kind === "pageerror") return true;
  if (issue.kind === "request") {
    const url = issue.url ?? issue.message;
    if (url && isBenignFailedResourceUrl(url)) return false;
    return true;
  }
  if (issue.kind === "overflow" || issue.kind === "blank") return true;
  if (issue.kind === "assertion" || issue.kind === "missing-target" || issue.kind === "route") {
    return true;
  }
  return true;
}

export function evaluateConsoleErrorReviewCheck(input: {
  uiVerificationRequired: boolean;
  evidence: { issues: PageGateIssue[]; at?: string } | null;
}): ConsoleErrorReviewCheck {
  if (!input.uiVerificationRequired) {
    return {
      status: "skipped",
      detail: "UI handoff browser verification did not apply to this task.",
    };
  }
  if (!input.evidence) {
    return {
      status: "not_run",
      detail:
        "Required UI handoff browser verification has no stored evidence — console errors were not checked.",
    };
  }
  const blocking = input.evidence.issues.filter(isBlockingBrowserIssueForReview);
  if (blocking.length === 0) {
    return {
      status: "passed",
      detail: `No blocking browser console errors in handoff evidence (${input.evidence.at ?? "unknown time"}).`,
    };
  }
  const preview = blocking
    .slice(0, 5)
    .map((i) => `[${i.kind}] ${i.message}`)
    .join("; ");
  return {
    status: "failed",
    detail: `Handoff browser verification recorded ${blocking.length} blocking issue(s): ${preview}`,
    issues: blocking,
  };
}

/** Built-in check kinds and the symbols / names that identify them in code and tests. */
export const GUARD_REVIEW_MARKERS: Record<string, string[]> = {
  "bare-require": ["bareRequireOffenders", "bare-require", "bareRequire"],
  "hardcoded-colors": ["hardcodedColorOffenders", "hardcoded-colors", "hardcodedColor"],
  "task-assets": ["taskAssetOffenders", "task-assets", "taskAsset"],
  "theme-contrast": ["themeContrastOffenders", "theme-contrast", "themeContrast"],
  "css-layers": ["cssLayeringOffenders", "css-layers", "cssLayering"],
  "ui-smoke": ["runUISmokeTest", "cmdUISmoke", "ui-smoke"],
  "lockfile-sync": ["lockfile-sync", "lockfileSync"],
  "zero-runtime-deps": ["zero-runtime-deps", "zeroRuntimeDeps"],
  staleness: ["staleness", "build-info"],
  format: ["oxfmt", "format"],
  lint: ["oxlint", "lint"],
  build: ["tsc", "build:raw"],
  tests: ["vitest", "run-tests"],
};

/**
 * True when test source shows prohibited input is rejected, not only that valid
 * input passes.
 */
export function testContentDemonstratesGuardRejection(content: string): boolean {
  if (/\b(toThrow|rejects)\b/.test(content)) return true;
  if (/\.not\.toEqual\(\s*\[\s*\]\s*\)/.test(content)) return true;
  if (/process\.exit\(1\)|exit code 1|\.status\)\.toBe\(1\)/.test(content)) return true;
  if (
    /\.toEqual\(\s*\[[^\]]+\]/.test(content) &&
    /\b(flags?|offenders?|violat|prohibit|invalid|bad input|rejects?)\b/i.test(content)
  ) {
    return true;
  }
  return false;
}

export function testContentReferencesGuard(guardId: string, content: string): boolean {
  const markers = GUARD_REVIEW_MARKERS[guardId] ?? [guardId];
  const lower = content.toLowerCase();
  return markers.some((m) => lower.includes(m.toLowerCase()));
}

/** Guards whose implementation or declaration changed on this branch (from diff text). */
export function guardsMateriallyChangedFromDiff(input: {
  changedPaths: string[];
  checkTsDiff?: string;
  repoosTomlDiff?: string;
}): string[] {
  const touched = new Set<string>();
  const { changedPaths, checkTsDiff = "", repoosTomlDiff = "" } = input;

  if (changedPaths.includes("src/commands/check.ts") && checkTsDiff) {
    for (const [guardId, markers] of Object.entries(GUARD_REVIEW_MARKERS)) {
      if (markers.some((m) => checkTsDiff.includes(m))) touched.add(guardId);
    }
  }

  if (changedPaths.includes("repoos.toml") && repoosTomlDiff) {
    for (const line of repoosTomlDiff.split("\n")) {
      if (!line.startsWith("+")) continue;
      const kind = /kind\s*=\s*["']([^"']+)["']/.exec(line)?.[1];
      if (kind) touched.add(kind);
      const name = /^\+\s*name\s*=\s*["']([^"']+)["']/.exec(line)?.[1];
      if (name && /command\s*=/.test(repoosTomlDiff)) touched.add(name);
    }
  }

  return [...touched];
}

export function evaluateGuardNegativeTestChecks(input: {
  guardIds: string[];
  changedTestFiles: { path: string; content: string }[];
}): GuardNegativeTestCheck[] {
  if (input.guardIds.length === 0) return [];
  return input.guardIds.map((guardId) => {
    const candidates = input.changedTestFiles.filter((f) =>
      testContentReferencesGuard(guardId, f.content),
    );
    const withNegative = candidates.filter((f) => testContentDemonstratesGuardRejection(f.content));
    if (withNegative.length > 0) {
      return {
        guardId,
        status: "passed",
        detail: `Negative guard test evidence in ${withNegative.map((f) => f.path).join(", ")}.`,
        evidenceTests: withNegative.map((f) => f.path),
      };
    }
    if (candidates.length > 0) {
      return {
        guardId,
        status: "failed",
        detail:
          `Guard \`${guardId}\` was materially changed but changed tests (${candidates.map((f) => f.path).join(", ")}) ` +
          "only exercise valid input — add a case that asserts representative prohibited input is rejected.",
      };
    }
    return {
      guardId,
      status: "failed",
      detail: `Guard \`${guardId}\` was materially changed on this branch but no changed test demonstrates rejection of bad input.`,
    };
  });
}

export function evaluateReviewVerification(input: {
  uiVerificationRequired: boolean;
  evidence: { issues: PageGateIssue[]; at?: string } | null;
  changedPaths: string[] | null;
  checkTsDiff?: string;
  repoosTomlDiff?: string;
  changedTestFiles: { path: string; content: string }[];
}): ReviewVerificationResult {
  const consoleErrors = evaluateConsoleErrorReviewCheck({
    uiVerificationRequired: input.uiVerificationRequired,
    evidence: input.evidence,
  });

  let guardTests: GuardNegativeTestCheck[] = [];
  if (input.changedPaths === null) {
    guardTests = [
      {
        guardId: "(branch diff)",
        status: "not_run",
        detail:
          "Could not read changed paths on the task branch — guard test evidence was not checked.",
      },
    ];
  } else {
    const guardIds = guardsMateriallyChangedFromDiff({
      changedPaths: input.changedPaths,
      checkTsDiff: input.checkTsDiff,
      repoosTomlDiff: input.repoosTomlDiff,
    });
    guardTests = evaluateGuardNegativeTestChecks({
      guardIds,
      changedTestFiles: input.changedTestFiles,
    });
  }

  const blocksApproval =
    consoleErrors.status === "failed" ||
    consoleErrors.status === "not_run" ||
    guardTests.some((g) => g.status === "failed" || g.status === "not_run");

  return { consoleErrors, guardTests, blocksApproval };
}

function statusLabel(status: ReviewMechanicalCheckStatus): string {
  switch (status) {
    case "passed":
      return "**passed**";
    case "failed":
      return "**failed**";
    case "skipped":
      return "**skipped**";
    case "not_run":
      return "**not run**";
  }
}

/** Markdown block appended to every review report that ran mechanical checks. */
export function formatReviewVerificationSection(result: ReviewVerificationResult): string {
  const lines: string[] = ["## Automated verification", ""];
  lines.push(
    `- Browser console-error check (handoff evidence): ${statusLabel(result.consoleErrors.status)} — ${result.consoleErrors.detail}`,
  );
  if (result.guardTests.length === 0) {
    lines.push(
      "- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.",
    );
  } else {
    for (const g of result.guardTests) {
      lines.push(`- Guard \`${g.guardId}\`: ${statusLabel(g.status)} — ${g.detail}`);
    }
  }
  lines.push("");
  return lines.join("\n");
}

export interface AppliedReviewVerification {
  markdown: string;
  verification: ReviewVerificationResult;
  /** When mechanical checks block approval despite the agent's verdict. */
  verdictOverride?: ReviewVerdict;
}

/**
 * Append the verification section and, when needed, clamp `good to go` to
 * `needs some work` with a blocking bug entry.
 */
export function applyMechanicalReviewVerification(
  reportMarkdown: string,
  verification: ReviewVerificationResult,
): AppliedReviewVerification {
  const section = formatReviewVerificationSection(verification);
  let markdown = `${reportMarkdown.trimEnd()}\n\n${section}`;

  const agentVerdict = parseReviewVerdict(reportMarkdown);
  if (!verification.blocksApproval || agentVerdict !== "good to go") {
    return { markdown, verification };
  }

  const bugs: string[] = [];
  if (
    verification.consoleErrors.status === "failed" ||
    verification.consoleErrors.status === "not_run"
  ) {
    bugs.push(`Browser verification: ${verification.consoleErrors.detail}`);
  }
  for (const g of verification.guardTests) {
    if (g.status === "failed" || g.status === "not_run") {
      bugs.push(g.detail);
    }
  }

  markdown = replaceReviewVerdict(markdown, "needs some work");
  const bugLines = bugs.map((b) => `- ${b}`).join("\n");
  if (/^## Bugs\s*$/im.test(markdown)) {
    markdown = markdown.replace(/^## Bugs\s*\n([\s\S]*?)(?=^## |\z)/im, (_, body: string) => {
      const trimmed = body.trim();
      const prefix =
        trimmed && !/^none found$/i.test(trimmed) ? `${trimmed}\n${bugLines}\n` : `${bugLines}\n`;
      return `## Bugs\n\n${prefix}`;
    });
  } else {
    markdown = markdown.replace(/^## Relevance\s*$/im, `## Bugs\n\n${bugLines}\n\n## Relevance`);
    if (!/^## Bugs\s*$/im.test(markdown)) {
      markdown = `${markdown.trimEnd()}\n\n## Bugs\n\n${bugLines}\n`;
    }
  }

  return { markdown, verification, verdictOverride: "needs some work" };
}
