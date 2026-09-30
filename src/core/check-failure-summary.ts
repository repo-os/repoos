import { parseCheckResults } from "./check-results.js";

/**
 * Pull the useful, human-readable diagnosis out of a Vitest failure block.
 *
 * Full check output can be large and often ends with a coloured received-vs-
 * expected diff. That diff is valuable in the expandable log, but it makes a
 * poor headline: it can begin halfway through a JSON object and hide the test
 * that actually failed. Keep the test name, source location, and error kind
 * together for compact status surfaces.
 */
export function summarizeCheckFailure(output: string): string | null {
  const lines = output
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  let failureIndex = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (/^(?:[❯×]\s*)?FAIL\s+/.test(lines[i])) {
      failureIndex = i;
      break;
    }
  }
  if (failureIndex === -1) return null;

  const heading = lines[failureIndex].replace(/^(?:[❯×]\s*)?FAIL\s+/, "");
  const block = lines.slice(failureIndex + 1);
  const location = block.find((line) =>
    /(?:^|\s)(?:[^\s:]+\/)?[^\s:]+\.(?:test|spec)\.[cm]?[jt]sx?:\d+:\d+/.test(line),
  );
  const error = block.find((line) => /^(?:[A-Za-z]*Error|Error):/.test(line));

  const parts = [heading];
  if (location) parts.push(`at ${location.replace(/^[❯×]\s*/, "")}`);
  if (error) parts.push(error);
  return parts.join(" — ");
}

/** Cap so one catastrophic run (whole suite red) cannot bloat a history row. */
const MAX_FAILED_TESTS = 50;

/**
 * Every distinct failing test in a Vitest run, as `file > suite > test`.
 *
 * `summarizeCheckFailure` names only the last failure; a run with several
 * failures (or a flaky one) needs the whole list, and the stored log tail is
 * too short to keep it. Vitest prints one `FAIL  <file> > <name>` heading per
 * failed test in its failure block (plus `FAIL` lines for suites that failed
 * to load, which carry only the file). Duplicates across the two passes of
 * `scripts/run-tests.mjs` collapse to one entry.
 */
export function extractFailedTests(output: string): string[] {
  // eslint-disable-next-line no-control-regex
  const plain = output.replace(/\u001b\[[0-9;]*m/g, "");
  const seen = new Set<string>();
  for (const raw of plain.split("\n")) {
    const m = /^\s*(?:[❯×]\s*)?FAIL\s+(\S.*?)\s*$/.exec(raw);
    if (!m) continue;
    // Drop vitest's trailing "[ project ]" tag and any retry suffix.
    const name = m[1].replace(/\s*\[[^\]]*\]\s*$/, "").replace(/\s+\d+ms$/, "");
    if (name) seen.add(name);
    if (seen.size >= MAX_FAILED_TESTS) break;
  }
  return [...seen];
}

/** Fields written into `.repoos/checks.db` for a remote validation run (#0589). */
export interface RemoteRunHistoryMeta {
  failedStep: string | null;
  failedTests: string[];
}

/**
 * Derive `failedStep` and `failedTests` for a remote check-run history row.
 * Dispatch, transport, and infra failures stay on `remote-validation`; a real
 * gate failure from the runner names the step (e.g. `tests`) and lists Vitest
 * failures when the output still carries them.
 */
export function remoteRunHistoryMeta(
  outcome: "pass" | "fail" | "cancelled",
  opts: {
    output?: string;
    detail?: string | null;
    transient?: boolean;
    configError?: boolean;
    cancelled?: boolean;
  },
): RemoteRunHistoryMeta {
  if (outcome === "pass") return { failedStep: null, failedTests: [] };

  const combined = [opts.output, opts.detail].filter(Boolean).join("\n");

  if (outcome === "cancelled" || opts.cancelled) {
    return { failedStep: "remote-validation", failedTests: [] };
  }
  if (opts.transient || opts.configError) {
    return { failedStep: "remote-validation", failedTests: extractFailedTests(combined) };
  }

  const failedTests = extractFailedTests(combined);
  const parsed = parseCheckResults(combined);
  if (parsed) {
    const failed = parsed.filter((r) => r.status === "failed");
    if (failed.length > 0) {
      return { failedStep: failed[0]!.name, failedTests };
    }
  }
  if (failedTests.length > 0) return { failedStep: "tests", failedTests };
  if (/error TS\d+|Failed to compile|tsc.*(?:error|failed)|Build failed/i.test(combined)) {
    return { failedStep: "build", failedTests: [] };
  }
  return { failedStep: "remote-validation", failedTests: [] };
}
