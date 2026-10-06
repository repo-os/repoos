/**
 * "This run is unusually slow" detection (#0720).
 *
 * While a check / handoff gate / close-out stage / bundle upload is still
 * RUNNING, compare its elapsed time against the rolling median of recent
 * PASSING runs of the same KIND (phase + remote/local + scope). When elapsed
 * exceeds `multiplier ×` that median (default 1.5, at least 5 samples) raise
 * exactly one attention item, auto-cleared when the run ends. When 3+ of the
 * last 10 runs of a kind were slow, raise one persistent notice naming the
 * common factor.
 *
 * Deliberately pure and dependency-free so it can be unit-tested without a
 * server: the caller supplies the running runs (with server-side startedAt and
 * sleep-adjusted elapsed ms) and the passing history rows from
 * `.repoos/checks.db`. Sleep gaps are excluded via the awake-time helpers in
 * `agent-run-health.ts` (#0678), so a sleeping laptop is not reported as a
 * slow run.
 */
import type { CheckRunOutcome, CheckRunPhase } from "./check-store.js";

/** One completed run, reduced to just what the median needs. */
export interface CheckRunSample {
  phase: CheckRunPhase;
  remote: boolean;
  scope: string;
  outcome: CheckRunOutcome;
  durationMs: number | null;
}

/**
 * One run that is still in flight. `elapsedMs` is already sleep-adjusted by the
 * caller (see `effectiveElapsedMs`); `startedAt` is the server-side wall-clock
 * start (never a client-derived timestamp — see #0719).
 */
export interface RunningRun {
  /** Stable per run, e.g. `check:0042:handoff-finalize:3`. */
  id: string;
  taskId: string | null;
  phase: CheckRunPhase;
  remote: boolean;
  scope: string;
  /** Short hostname that is (or will be) running it. */
  machine: string | null;
  /** Server-side start, ISO-8601 — the true origin of `elapsedMs`. */
  startedAt: string;
  /** Elapsed credited ms, sleep-adjustment already applied. */
  elapsedMs: number;
  /**
   * Which stage of the run is current when known: e.g. `upload`, `install`,
   * `build`, `tests`, `check`. The remote runner reports it as the job moves
   * through its phases.
   */
  stage?: string | null;
  /** Bundle size and upload time, when the remote runner recorded them. */
  uploadBytes?: number | null;
  uploadSeconds?: number | null;
}

/** A single in-flight run that crossed the threshold. */
export interface SlowRunFlag {
  /** Stable while the run is in flight; auto-clears when it finishes. */
  id: string;
  runId: string;
  taskId: string | null;
  phase: CheckRunPhase;
  remote: boolean;
  scope: string;
  machine: string | null;
  /** Server-side start of the run, ISO-8601 — for keying back to host rows. */
  startedAt: string;
  /** Human label for the kind of run, e.g. "close-out on bee". */
  kindLabel: string;
  elapsedMs: number;
  medianMs: number;
  ratio: number;
  sampleCount: number;
  stage: string | null;
  uploadBytes: number | null;
  uploadSeconds: number | null;
  /** Best guess at why, from the stage and host, when known. */
  likelyCause: string | null;
}

/** The persistent "runs are slow lately" notice for one run kind. */
export interface SlowKindNotice {
  id: string;
  phase: CheckRunPhase;
  remote: boolean;
  scope: string;
  /** Runs that were slow within the window. */
  slowCount: number;
  windowCount: number;
  /** Shared factor across the slow runs, when there is one. */
  commonFactor: string;
  medianMs: number | null;
}

export interface EvaluateSlownessInput {
  running: RunningRun[];
  /** Recent completed history — any order; filtered to passing runs internally. */
  history: CheckRunSample[];
  /** Threshold multiplier over the median. Default 1.5. */
  multiplier: number;
  /** How many recent passing runs make up the rolling median. Default 30. */
  window?: number;
  /** Minimum passing samples before any flag is raised. Default 5. */
  minSamples?: number;
}

export interface PersistentNoticeInput {
  history: CheckRunSample[];
  multiplier: number;
  /** Window of recent runs to judge. Default 10. */
  window?: number;
  /** How many slow runs in the window trip the notice. Default 3. */
  minSlow?: number;
  windowSize?: number;
}

/** Key that groups runs of the same kind: phase + remote/local + scope. */
export function runKindKey(r: Pick<CheckRunSample, "phase" | "remote" | "scope">): string {
  return `${r.phase}|${r.remote ? "remote" : "local"}|${r.scope}`;
}

/** Classic median; null for an empty list. Does not mutate the input. */
export function median(values: number[]): number | null {
  const nums = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (nums.length === 0) return null;
  const mid = Math.floor(nums.length / 2);
  return nums.length % 2 === 1 ? nums[mid] : (nums[mid - 1] + nums[mid]) / 2;
}

export interface RollingMedian {
  medianMs: number;
  sampleCount: number;
}

/**
 * Rolling median of the last `window` PASSING runs of `kind` with a finite
 * duration. Returns null when fewer than `minSamples` are available — the
 * acceptance bar for raising anything.
 */
export function rollingMedianForKind(
  history: CheckRunSample[],
  kind: string,
  opts: { window?: number; minSamples?: number } = {},
): RollingMedian | null {
  const window = opts.window ?? 30;
  const minSamples = opts.minSamples ?? 5;
  const durations = history
    .filter(
      (h) =>
        runKindKey(h) === kind &&
        h.outcome === "pass" &&
        typeof h.durationMs === "number" &&
        h.durationMs > 0,
    )
    .slice(0, window)
    .map((h) => h.durationMs as number);
  if (durations.length < minSamples) return null;
  const medianMs = median(durations);
  if (medianMs == null) return null;
  return { medianMs, sampleCount: durations.length };
}

function phaseLabel(phase: CheckRunPhase): string {
  switch (phase) {
    case "pre-review":
      return "handoff check";
    case "close-out":
      return "close-out check";
    case "release":
      return "release check";
    default:
      return "check";
  }
}

function kindLabel(r: Pick<RunningRun, "phase" | "remote" | "scope" | "machine">): string {
  const where = r.remote ? (r.machine ? ` on ${r.machine}` : " remote") : " locally";
  const scope = r.scope && r.scope !== "full" ? ` (${r.scope})` : "";
  return `${phaseLabel(r.phase)}${where}${scope}`;
}

function humanBytes(n: number): string {
  if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  if (n >= 1024) return `${Math.round(n / 1024)} KB`;
  return `${n} B`;
}

/**
 * Best-guess reason for a slow run, from the stage the run is in and whether it
 * is remote. `null` when nothing specific can be said (the item still shows
 * elapsed vs typical).
 */
export function likelyCauseFor(r: RunningRun): string | null {
  const stage = r.stage?.toLowerCase() ?? "";
  if (stage.includes("upload")) {
    const size = typeof r.uploadBytes === "number" ? ` (${humanBytes(r.uploadBytes)})` : "";
    const secs = typeof r.uploadSeconds === "number" ? ` in ${r.uploadSeconds}s` : "";
    return `bundle upload${size}${secs} — the ssh transfer, not the tests, is slow`;
  }
  if (stage.includes("install")) return "environment install is the slow phase";
  if (stage.includes("build")) return "the build is the slow phase";
  if (stage.includes("test")) return "the tests are the slow phase";
  if (stage.includes("queue") || stage.includes("lock")) {
    return "waiting for a free runner slot / host lock";
  }
  if (r.remote) return "remote runner load or a slow upload — check the host";
  return "local machine load, or the laptop went to sleep / is swapping";
}

/**
 * Flag every in-flight run whose elapsed time exceeds `multiplier ×` the
 * rolling median of its kind. One flag per run, so the caller can map them to
 * dedup-keyed attention items that clear as soon as the run disappears.
 */
export function evaluateSlowness(input: EvaluateSlownessInput): SlowRunFlag[] {
  const multiplier = input.multiplier > 0 ? input.multiplier : 1.5;
  const window = input.window ?? 30;
  const minSamples = input.minSamples ?? 5;
  const flags: SlowRunFlag[] = [];
  for (const r of input.running) {
    const kind = runKindKey(r);
    const stats = rollingMedianForKind(input.history, kind, { window, minSamples });
    if (!stats) continue;
    const ratio = r.elapsedMs / stats.medianMs;
    if (ratio <= multiplier) continue;
    flags.push({
      id: `slowRun:${r.id}`,
      runId: r.id,
      taskId: r.taskId,
      phase: r.phase,
      remote: r.remote,
      scope: r.scope,
      machine: r.machine,
      startedAt: r.startedAt,
      kindLabel: kindLabel(r),
      elapsedMs: r.elapsedMs,
      medianMs: stats.medianMs,
      ratio,
      sampleCount: stats.sampleCount,
      stage: r.stage ?? null,
      uploadBytes: r.uploadBytes ?? null,
      uploadSeconds: r.uploadSeconds ?? null,
      likelyCause: likelyCauseFor(r),
    });
  }
  return flags;
}

/**
 * One persistent notice per run kind when `minSlow` or more of the last
 * `window` completed runs of that kind were slow (> multiplier × their own
 * kind median). The common factor is named from what the slow rows share.
 */
export function persistentSlowNotices(input: PersistentNoticeInput): SlowKindNotice[] {
  const multiplier = input.multiplier > 0 ? input.multiplier : 1.5;
  const window = input.window ?? 10;
  const minSlow = input.minSlow ?? 3;
  const notices: SlowKindNotice[] = [];

  const kinds = new Set(input.history.map((h) => runKindKey(h)));
  for (const kind of kinds) {
    const recent = input.history.filter((h) => runKindKey(h) === kind).slice(0, window);
    // Baseline for this kind is the median of all its passing runs (a wider
    // window than the slice under judgement, so a short slow stretch is not
    // measured against itself).
    const baseline = rollingMedianForKind(input.history, kind, { window: 30, minSamples: 5 });
    if (!baseline) continue;
    const slow = recent.filter(
      (h) =>
        typeof h.durationMs === "number" && h.durationMs > multiplier * (baseline.medianMs ?? 0),
    );
    if (slow.length < minSlow) continue;
    notices.push({
      id: `slowKind:${kind}`,
      phase: recent[0].phase,
      remote: recent[0].remote,
      scope: recent[0].scope,
      slowCount: slow.length,
      windowCount: recent.length,
      commonFactor: commonFactorFor(slow, recent),
      medianMs: baseline.medianMs,
    });
  }
  return notices;
}

function commonFactorFor(slow: CheckRunSample[], recent: CheckRunSample[]): string {
  const allRemoteSameHost = slow.length > 0 && slow.every((s) => s.remote === slow[0].remote);
  if (slow.every((s) => s.outcome !== "pass")) {
    return "the slow runs include failures — fix the branch before blaming the runner";
  }
  if (allRemoteSameHost && slow[0].remote) {
    return "the same remote host recurs across the slow runs";
  }
  if (allRemoteSameHost && !slow[0].remote) {
    return "local runs on this machine are trending slow (load or swapping)";
  }
  const scope = slow[0].scope;
  if (slow.every((s) => s.scope === scope)) {
    return `the \`${scope}\` scope is consistently the slow one`;
  }
  return `${slow.length} of the last ${recent.length} runs were slow`;
}

// ---------------------------------------------------------------------------
// Sleep-aware elapsed time (#0678)
// ---------------------------------------------------------------------------

/**
 * Elapsed ms credited to an in-flight run, shrunk across laptop-sleep gaps.
 *
 * `lastAwakeMs` is the most recent watchdog/heartbeat tick the server observed
 * and `tickIntervalMs` its cadence: when the wall clock jumped far past the
 * last tick (the machine slept), credit only one tick's worth instead of the
 * whole suspend, mirroring `effectiveStalenessNow` (#0678). The result is
 * clamped to `[0, wallElapsed]` so a run that started mid-suspend can never
 * read as a negative or inflated duration.
 */
export function effectiveElapsedMs(
  startedAtMs: number,
  wallNowMs: number,
  lastAwakeMs: number,
  tickIntervalMs: number,
): number {
  const wallElapsed = Math.max(0, wallNowMs - startedAtMs);
  const gap = wallNowMs - lastAwakeMs;
  if (gap <= tickIntervalMs * 3) return wallElapsed;
  const awakeNow = lastAwakeMs + tickIntervalMs;
  const credited = Math.max(0, awakeNow - startedAtMs);
  return Math.min(wallElapsed, credited);
}
