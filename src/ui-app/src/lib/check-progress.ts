export interface CheckProgress {
  stepsDone: number | null;
  stepsTotal: number | null;
  currentStep?: number | null;
  stepName?: string | null;
  testsDone?: number | null;
  testsTotal?: number | null;
  testsPass?: number | null;
}

/** Return null for an indeterminate run; callers must not invent a percentage. */
export function checkProgressPercent(progress: CheckProgress): number | null {
  if (
    progress.stepName?.toLowerCase() === "tests" &&
    progress.testsDone != null &&
    progress.testsTotal != null &&
    progress.testsTotal > 0
  ) {
    return Math.min(100, Math.max(0, Math.round((progress.testsDone / progress.testsTotal) * 100)));
  }
  if (progress.stepsTotal != null && progress.stepsTotal > 0 && progress.stepsDone != null) {
    return Math.min(100, Math.max(0, Math.round((progress.stepsDone / progress.stepsTotal) * 100)));
  }
  if (progress.testsDone != null && progress.testsTotal != null && progress.testsTotal > 0) {
    return Math.min(100, Math.max(0, Math.round((progress.testsDone / progress.testsTotal) * 100)));
  }
  return null;
}

export function checkProgressLabel(progress: CheckProgress): string {
  const stepNumber = progress.currentStep ?? progress.stepsDone;
  const step =
    progress.stepsTotal == null
      ? `step ${stepNumber ?? "—"}`
      : `step ${stepNumber ?? "—"} of ${progress.stepsTotal}`;
  if (progress.testsDone == null || progress.testsTotal == null) return step;
  const pass = progress.testsPass == null ? "" : `pass ${progress.testsPass} · `;
  return `${step} · ${pass}tests ${progress.testsDone}/${progress.testsTotal} files`;
}
