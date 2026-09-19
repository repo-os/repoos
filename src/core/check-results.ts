/**
 * Parse the `── Results ──` block that `repoos check` prints at the end of its
 * run, so a failed close-out's recorded reason can name the checks that
 * actually failed instead of the tail of the combined output (#0428).
 *
 * The motivating incident: on 2026-09-18 #0423/#0425 failed because main
 * itself was unformatted (`oxfmt --check`), but the saved reason was the tail
 * of the test run — Vue custom-element warnings, init-scaffold/auth-invite
 * stderr, a `[global-reap]` notice. The formatting failure never appeared, so
 * the retry's differing tail read as "machine load". The summary below leads
 * with the gate's own Results block: which checks failed, the key detail for
 * each (files for a format failure, the `FAIL` test for a test failure), and
 * which later checks were skipped because an earlier one failed.
 */
import { summarizeCheckFailure } from "./check-failure-summary.js";

/** ANSI SGR escapes; the gate's output is colored. Kept local so this module
 *  has no server dependency and can be reused by the CLI/UI. */
const ANSI_RE = /\u001b\[[0-9;]*m/g;

/** Strip ANSI SGR escapes so the Results block is machine-parseable. */
function stripAnsi(text: string): string {
  return text.replace(ANSI_RE, "");
}

export type CheckStatus = "passed" | "failed" | "skipped";

export interface ParsedCheckResult {
  /** Check name as printed, e.g. `check-fmt:check`, `build`, `tests`. */
  name: string;
  status: CheckStatus;
  /** Full detail printed after the em-dash, which may span several lines. */
  detail?: string;
  /** A skip caused by an earlier check failing (`formatting/lint failed`). */
  blocked: boolean;
}

export interface CheckFailureSummary {
  /** Human-readable, multi-line summary that leads with the Results block. */
  summary: string;
  /** Names of the checks that failed, in printed order. */
  failedChecks: string[];
}

/**
 * The printed icon + name + optional `— detail` header of one result line.
 * Icons (#0446): `✔` passed, `✗` failed (including timeout / missing
 * prerequisite — both name themselves in the detail), `⏭` skipped, `⚠` failed
 * but optional (reported, never gating).
 */
const RESULT_HEADER =
  /^\s*([✔✗⏭⚠])\s+([a-z][a-z0-9_.-]*(?::[a-z0-9_.-]+)*)\s*(?:\u2014\s*([\s\S]*))?$/i;

/** Locate the `── Results ──` marker and return the lines that follow it. */
function resultsLines(output: string): string[] | null {
  const lines = stripAnsi(output).split("\n");
  const start = lines.findIndex((l) => /──\s*Results\s*──/.test(l));
  if (start === -1) return null;
  return lines.slice(start + 1);
}

/**
 * Parse the Results block. Returns `null` when the output has no Results block
 * at all (the process was killed, timed out, or the CLI predates this format),
 * so callers can fall back to the old tail-of-output behaviour.
 */
export function parseCheckResults(output: string): ParsedCheckResult[] | null {
  const lines = resultsLines(output);
  if (lines === null) return null;

  const results: ParsedCheckResult[] = [];
  let current: ParsedCheckResult | null = null;
  const detailParts: string[] = [];

  const flush = (): void => {
    if (!current) return;
    const detail = detailParts.join("\n").trim();
    if (detail) current.detail = detail;
    current.blocked =
      current.status === "skipped" &&
      /blocked by failed step|formatting\/lint failed|build was skipped/i.test(detail);
    results.push(current);
    current = null;
    detailParts.length = 0;
  };

  for (const line of lines) {
    // Stop at the terminal summary; anything after it is not a result.
    if (/^\s*(?:All checks passed\.|\d+ check\(s\) failed\.)/.test(line)) break;
    const header = line.match(RESULT_HEADER);
    if (header) {
      flush();
      const [, icon, name, detail] = header;
      const status: CheckStatus =
        icon === "⏭"
          ? "skipped"
          : icon === "✔"
            ? (detail ?? "").trim().startsWith("skipped")
              ? "skipped"
              : "passed"
            : "failed";
      current = { name, status, blocked: false };
      if (detail) detailParts.push(detail);
      continue;
    }
    if (current) detailParts.push(line);
  }
  flush();

  return results.length > 0 ? results : null;
}

/**
 * The files named by a formatting/lint failure's detail. `oxfmt --check` prints
 * one path per line as `path/to/file.ts (12ms)`; a missing file may also be
 * reported as `File is not formatted: path`. Falls back to empty when the shape
 * isn't recognized.
 */
function formatIssueFiles(detail: string): string[] {
  const files = new Set<string>();
  for (const raw of detail.split("\n")) {
    const line = raw.trim();
    const ms = line.match(/^(.+?)\s+\(\d+(?:\.\d+)?ms\)$/);
    if (ms) files.add(ms[1]);
    const named = line.match(/^File is not formatted:?\s*(.+)$/i);
    if (named) files.add(named[1]);
  }
  return [...files];
}

/** Collapse whitespace and cap a detail fragment for a one-line summary. */
function clip(text: string, max = 200): string {
  const flat = text
    .replace(/\s*\n\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return flat.length > max ? flat.slice(0, max - 1) + "…" : flat;
}

/**
 * The key detail to show for one failed check. Formatting/lint failures name
 * the offending files; test failures name the failing test; anything else
 * leads with the first line of its detail.
 */
function keyDetail(result: ParsedCheckResult, fullOutput: string): string {
  const detail = result.detail ?? "";
  if (/^check-(?:fmt:check|lint)\b/.test(result.name)) {
    const files = formatIssueFiles(detail);
    if (files.length > 0) return files.slice(0, 5).join(", ");
    const first = detail.split("\n")[0] ?? "";
    return clip(first.replace(/^[^:]*check failed\s*—\s*/i, ""), 200) || "formatting failed";
  }
  if (result.name === "tests") {
    const fromDetail = summarizeCheckFailure(detail);
    if (fromDetail) return clip(fromDetail, 240);
    const fromFull = summarizeCheckFailure(fullOutput);
    if (fromFull) return clip(fromFull, 240);
    return "test suite failed";
  }
  const first = detail.split("\n").find((l) => l.trim()) ?? "";
  return clip(first, 200) || "failed";
}

/**
 * Summarize a failed `repoos check` run for a stored close-out reason.
 *
 * Leads with the Results block: each failed check (`✗ name — key detail`) then
 * each check skipped because an earlier one failed (`⏭ name — skipped — …`).
 * Returns `null` when the output has no parseable Results block or no failed
 * checks, so callers keep their existing fallback.
 */
export function summarizeCheckOutput(output: string): CheckFailureSummary | null {
  const results = parseCheckResults(output);
  if (!results) return null;
  const failed = results.filter((r) => r.status === "failed");
  if (failed.length === 0) return null;

  const lines: string[] = ["Results:"];
  for (const r of failed) {
    lines.push(`  ✗ ${r.name} — ${keyDetail(r, output)}`);
  }
  // Skipped checks are shown as skipped, and only when the skip is a direct
  // consequence of the failure (e.g. build/tests after a format failure) — a
  // routine `skipped — no bun.lock` is not part of the diagnosis.
  for (const r of results.filter((x) => x.status === "skipped" && x.blocked)) {
    const skipDetail = clip((r.detail ?? "skipped").replace(/^skipped\s*—\s*/i, ""), 120);
    lines.push(`  ⏭ ${r.name} — skipped — ${skipDetail}`);
  }

  return { summary: lines.join("\n"), failedChecks: failed.map((r) => r.name) };
}

/**
 * A stable identity for a gate failure: the sorted set of failed checks when
 * known, else the raw reason. Used by the close-out retry heuristic so
 * "the same failure twice" is judged by which checks failed, never by the
 * output tail — a deterministic failure must never read as machine load.
 */
export function checkFailureSignature(failedChecks: string[] | undefined, reason: string): string {
  if (failedChecks && failedChecks.length > 0) {
    return `checks:${[...failedChecks].sort().join(",")}`;
  }
  // Drop the per-attempt durable-log reference so two unparseable failures
  // that differ only by log filename still compare as the same failure.
  const normalized = reason.replace(/\n?Full check output: .*/g, "");
  return `reason:${normalized}`;
}
