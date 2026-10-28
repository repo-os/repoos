/** Structured Vitest reporter records, shared by local and remote history. */
export interface TestFileTiming {
  file: string;
  durationMs: number;
}

export function testFileTimings(output: string): TestFileTiming[] {
  const files = new Map<string, number>();
  for (const match of output.matchAll(/::repoos-test-file::([^\r\n]+)/g)) {
    try {
      const value = JSON.parse(match[1]!);
      if (
        typeof value.file !== "string" ||
        !Number.isFinite(value.durationMs) ||
        value.durationMs < 0
      )
        continue;
      files.set(value.file, (files.get(value.file) ?? 0) + value.durationMs);
    } catch {
      /* ignore a truncated record */
    }
  }
  return [...files]
    .map(([file, durationMs]) => ({ file, durationMs }))
    .sort((a, b) => b.durationMs - a.durationMs);
}

export function formatSlowestTestFiles(files: TestFileTiming[], limit = 10): string {
  return [...files]
    .sort((a, b) => b.durationMs - a.durationMs)
    .slice(0, limit)
    .map(({ file, durationMs }) => `  ${(durationMs / 1000).toFixed(2)}s  ${file}`)
    .join("\n");
}

/** Keep structured file samples even when the remote log tail is truncated. */
export class TestFileTimingCollector {
  private pending = "";
  private records = new Map<string, number>();
  push(chunk: string): void {
    this.pending += chunk;
    const end = this.pending.lastIndexOf("\n");
    if (end >= 0) {
      for (const value of testFileTimings(this.pending.slice(0, end + 1))) {
        this.records.set(value.file, (this.records.get(value.file) ?? 0) + value.durationMs);
      }
      this.pending = this.pending.slice(end + 1);
    }
  }
  values(): TestFileTiming[] {
    return [...this.records].map(([file, durationMs]) => ({ file, durationMs }));
  }
}
