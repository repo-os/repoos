export interface CheckProgress {
  stepsDone: number;
  stepsTotal: number | null;
  testsDone?: number | null;
  testsTotal?: number | null;
}

/** Return null for an indeterminate run; callers must not invent a percentage. */
export function checkProgressPercent(progress: CheckProgress): number | null {
  if (progress.stepsTotal != null && progress.stepsTotal > 0) {
    return Math.min(100, Math.max(0, Math.round((progress.stepsDone / progress.stepsTotal) * 100)));
  }
  if (progress.testsDone != null && progress.testsTotal != null && progress.testsTotal > 0) {
    return Math.min(100, Math.max(0, Math.round((progress.testsDone / progress.testsTotal) * 100)));
  }
  return null;
}

export function checkProgressLabel(progress: CheckProgress): string {
  const step =
    progress.stepsTotal == null
      ? `step ${progress.stepsDone}`
      : `step ${progress.stepsDone} of ${progress.stepsTotal}`;
  if (progress.testsDone == null || progress.testsTotal == null) return step;
  return `${step} · tests ${progress.testsDone}/${progress.testsTotal} files`;
}
