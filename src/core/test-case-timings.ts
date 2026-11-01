/** Structured Vitest per-case records, shared by local and remote check history. */
export type TestCaseResult = "passed" | "failed" | "skipped";

export interface TestCaseTiming {
  file: string;
  /** Full Vitest name (`suite > case`), including parameterized titles. */
  name: string;
  /** Stable Vitest task id for this case (project + module + order). */
  caseId: string;
  /** Retry attempt index from Vitest diagnostics (0 = first run). */
  retry: number;
  durationMs: number;
  result: TestCaseResult;
}

export interface TestCaseTimingRow extends TestCaseTiming {
  runId: number;
  startedAt: string;
  taskId: string | null;
  phase: string;
  machine: string | null;
  remote: boolean;
  scope: string;
}

const MARKER = "::repoos-test-case::";

export function testCaseTimings(output: string): TestCaseTiming[] {
  const cases: TestCaseTiming[] = [];
  for (const match of output.matchAll(/::repoos-test-case::([^\r\n]+)/g)) {
    const parsed = parseTestCaseLine(match[1]!);
    if (parsed) cases.push(parsed);
  }
  return cases;
}

function parseTestCaseLine(raw: string): TestCaseTiming | null {
  try {
    const value = JSON.parse(raw) as Record<string, unknown>;
    if (typeof value.file !== "string" || typeof value.name !== "string") return null;
    if (typeof value.caseId !== "string" || !value.caseId) return null;
    const durationMs = Number(value.durationMs);
    if (!Number.isFinite(durationMs) || durationMs < 0) return null;
    const retry = Number(value.retry ?? 0);
    if (!Number.isInteger(retry) || retry < 0) return null;
    const result = value.result;
    if (result !== "passed" && result !== "failed" && result !== "skipped") return null;
    return {
      file: value.file,
      name: value.name,
      caseId: value.caseId,
      retry,
      durationMs,
      result,
    };
  } catch {
    return null;
  }
}

/** Distinct cases: same file/name/id/retry/result — keep the longest duration. */
export function mergeTestCaseTimings(cases: TestCaseTiming[]): TestCaseTiming[] {
  const byKey = new Map<string, TestCaseTiming>();
  for (const c of cases) {
    const key = `${c.file}\0${c.caseId}\0${c.retry}\0${c.result}`;
    const prev = byKey.get(key);
    if (!prev || c.durationMs > prev.durationMs) byKey.set(key, c);
  }
  return [...byKey.values()];
}

export function formatSlowestTestCases(cases: TestCaseTiming[], limit = 10): string {
  return [...cases]
    .sort((a, b) => b.durationMs - a.durationMs)
    .slice(0, limit)
    .map(({ file, name, durationMs, result, retry }) => {
      const retryNote = retry > 0 ? ` · retry ${retry}` : "";
      return `  ${(durationMs / 1000).toFixed(2)}s  ${result}${retryNote}  ${file} › ${name}`;
    })
    .join("\n");
}

/** Keep structured case samples even when the remote log tail is truncated. */
export class TestCaseTimingCollector {
  private pending = "";
  private records = new Map<string, TestCaseTiming>();

  push(chunk: string): void {
    this.pending += chunk;
    const end = this.pending.lastIndexOf("\n");
    if (end >= 0) {
      for (const value of testCaseTimings(this.pending.slice(0, end + 1))) {
        const key = `${value.file}\0${value.caseId}\0${value.retry}\0${value.result}`;
        const prev = this.records.get(key);
        if (!prev || value.durationMs >= prev.durationMs) this.records.set(key, value);
      }
      this.pending = this.pending.slice(end + 1);
    }
  }

  values(): TestCaseTiming[] {
    return [...this.records.values()];
  }
}

export function pushTimingOutputChunk(
  chunk: string,
  fileCollector: { push(chunk: string): void },
  caseCollector: TestCaseTimingCollector,
): void {
  fileCollector.push(chunk);
  caseCollector.push(chunk);
}
