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
  return checkProgressDetailLabel(progress, { filesWord: true });
}

/** Compact label for card/drawer rows (no decorative step placeholder). */
export function checkProgressDetailLabel(
  progress: CheckProgress,
  opts: { filesWord?: boolean } = {},
): string {
  const filesWord = opts.filesWord ? " files" : "";
  const stepNumber = progress.currentStep ?? progress.stepsDone;
  const hasStep = stepNumber != null;
  const hasStepTotal = progress.stepsTotal != null && progress.stepsTotal > 0;
  const hasTests =
    progress.testsDone != null && progress.testsTotal != null && progress.testsTotal > 0;

  if (hasTests && !hasStep && !hasStepTotal) {
    return `tests ${progress.testsDone}/${progress.testsTotal}${filesWord}`;
  }
  if (!hasStep && !hasStepTotal) {
    if (hasTests) return `tests ${progress.testsDone}/${progress.testsTotal}${filesWord}`;
    if (progress.stepName) return `checking ${progress.stepName}`;
    return "starting…";
  }
  const step = hasStepTotal
    ? `step ${stepNumber ?? "—"} of ${progress.stepsTotal}`
    : `step ${stepNumber}`;
  if (!hasTests) return step;
  return `${step} · tests ${progress.testsDone}/${progress.testsTotal}${filesWord}`;
}

export function toCheckProgress(run: {
  stepsDone?: number | null;
  stepsTotal?: number | null;
  currentStep?: number | null;
  stepName?: string | null;
  testsDone?: number | null;
  testsTotal?: number | null;
  testsPass?: number | null;
}): CheckProgress {
  return {
    stepsDone: run.stepsDone ?? null,
    stepsTotal: run.stepsTotal ?? null,
    currentStep: run.currentStep ?? null,
    stepName: run.stepName ?? null,
    testsDone: run.testsDone ?? null,
    testsTotal: run.testsTotal ?? null,
    testsPass: run.testsPass ?? null,
  };
}
