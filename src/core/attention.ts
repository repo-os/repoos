/**
 * Unified attention feed (#0687): stable ids, severity, task id, kind, message
 * and timestamps for the notification bell and `GET /api/attention`.
 */
import type { RepoOSConfig, Task } from "./types.js";
import type { SlowKindNotice, SlowRunFlag } from "./check-slowness.js";

export interface CloseOutOutcomeFeedEvent {
  taskId: string;
  outcome: "succeeded" | "failed" | "timedOut";
  finishedAt: string;
  reason: string;
}
import { parseTaskAreas } from "./areas.js";

export type AttentionSeverity = "info" | "warning" | "error";

/** Every attention kind the bell and API expose. */
export type AttentionKind =
  | "releaseNotesReady"
  | "releaseSucceeded"
  | "releaseFailed"
  | "closeOutSucceeded"
  | "closeOutFailed"
  | "closeOutTimedOut"
  | "taskReview"
  | "taskNeedsInput"
  | "taskNeedsMerge"
  | "taskAssigned"
  | "providerFailure"
  | "silentRun"
  | "slowRun"
  | "slowRunsRecently"
  | "spendThreshold"
  | "awaitingVisualCheck"
  | "remoteFallback"
  | "ctoAction";

export interface AttentionItem {
  /** Stable per event — dedupe key for clients and dismiss markers. */
  id: string;
  kind: AttentionKind;
  severity: AttentionSeverity;
  taskId: string | null;
  message: string;
  detail: string;
  /** In-app route when the item is actionable. */
  link: string | null;
  /** ISO-8601 UTC when the underlying event happened. */
  at: string;
}

export interface AttentionFeed {
  generatedAt: string;
  items: AttentionItem[];
}

/** Durable attention events recorded on the server (provider failures, remote fallback). */
export interface RecordedAttentionEvent {
  id: string;
  kind: "providerFailure" | "remoteFallback" | "ctoAction";
  taskId: string | null;
  message: string;
  detail: string;
  at: string;
}

export interface ReleaseRunAttentionSource {
  state: "idle" | "running" | "succeeded" | "failed";
  message: string;
  startedAt: string | null;
  updatedAt: string | null;
}

export interface ReleaseNotesRunAttentionSource {
  state: "idle" | "running" | "succeeded" | "failed";
  startedAt: string | null;
  updatedAt: string | null;
  /** When true, a terminal run describes an older draft context. */
  stale?: boolean;
}

export interface AttentionFeedInput {
  config: RepoOSConfig;
  tasks: Task[];
  closeOutOutcomes: CloseOutOutcomeFeedEvent[];
  releaseRun: ReleaseRunAttentionSource | null;
  releaseNotesRun: ReleaseNotesRunAttentionSource | null;
  recordedEvents: RecordedAttentionEvent[];
  totalSpendUsd: number | null;
  recentProviderFailures: Array<{
    sessionId: string;
    taskId: string | null;
    errorReason: string | null;
    startedAt: string;
  }>;
  /** Running engineer/task agents whose output has gone quiet. */
  silentRuns: Array<{ taskId: string; lastOutputAt: string | null; detail: string }>;
  /** In-flight check/close-out/upload runs that exceed their kind median (#0720). */
  slowRuns?: SlowRunFlag[];
  /** Run kinds trending slow over their recent window (#0720). */
  slowRunNotices?: SlowKindNotice[];
  previewTargetAreas: string[];
}

const CLOSE_OUT_KIND: Record<
  CloseOutOutcomeFeedEvent["outcome"],
  "closeOutSucceeded" | "closeOutFailed" | "closeOutTimedOut"
> = {
  succeeded: "closeOutSucceeded",
  failed: "closeOutFailed",
  timedOut: "closeOutTimedOut",
};

const SEVERITY: Record<AttentionKind, AttentionSeverity> = {
  releaseNotesReady: "info",
  releaseSucceeded: "info",
  closeOutSucceeded: "info",
  taskReview: "info",
  taskAssigned: "info",
  awaitingVisualCheck: "info",
  releaseFailed: "error",
  closeOutFailed: "error",
  closeOutTimedOut: "warning",
  taskNeedsInput: "warning",
  taskNeedsMerge: "warning",
  providerFailure: "error",
  silentRun: "warning",
  slowRun: "warning",
  slowRunsRecently: "warning",
  spendThreshold: "warning",
  remoteFallback: "warning",
  ctoAction: "info",
};

/** Provider/credit/auth failures that should surface in the bell (#0687, #0678). */
export function isProviderFailureReason(reason: string | null | undefined): boolean {
  if (!reason) return false;
  const r = reason.toLowerCase();
  return (
    // A bare "402" matches line numbers ("402:  ..."), hashes and timestamps, so
    // require an HTTP-ish context around it (#0709).
    /\b(?:http|status|status code|code|error)[\s:=]*402\b/.test(r) ||
    /\b402\s+payment required\b/.test(r) ||
    r.includes("insufficient credit") ||
    r.includes("payment required") ||
    r.includes("rate limit") ||
    r.includes("model unavailable") ||
    r.includes("out of credit") ||
    r.includes("quota exceeded") ||
    r.includes("billing")
  );
}

function firstLine(message: string, max = 160): string {
  const line = message
    .split("\n")
    .map((l) => l.trim())
    .find(Boolean);
  if (!line) return "";
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
}

function budgetFromTimeoutReason(reason: string): string | null {
  const m = reason.match(/timed out after (\S+?)\s*[—–-]/);
  return m ? m[1] : null;
}

function closeOutTitle(o: CloseOutOutcomeFeedEvent): string {
  const base = `Move to done: #${o.taskId}`;
  if (o.outcome === "succeeded") return `${base} landed`;
  if (o.outcome === "failed") return `${base} failed`;
  const budget = budgetFromTimeoutReason(o.reason);
  return budget ? `${base} timed out after ${budget}` : `${base} timed out`;
}

function closeOutDetail(o: CloseOutOutcomeFeedEvent): string {
  if (o.outcome === "succeeded") return "Merged and published to main.";
  return (
    firstLine(o.reason) ||
    (o.outcome === "timedOut"
      ? "Increase closeOut.timeoutMs or retry when the runner is less loaded."
      : "See the task for details.")
  );
}

function releaseTagFromMessage(message: string): string | null {
  const m = message.trim().match(/^(v?\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)\b/);
  return m ? m[1] : null;
}

/** mm:ss (or h:mm:ss) for an elapsed ms value. */
function formatDuration(ms: number): string {
  const totalSecs = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(totalSecs / 3600);
  const m = Math.floor((totalSecs % 3600) / 60);
  const s = totalSecs % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function slowRunTitle(flag: SlowRunFlag): string {
  const who = flag.taskId ? `#${flag.taskId} · ` : "";
  return `${who}${flag.kindLabel} is slow (${formatDuration(flag.elapsedMs)})`;
}

function slowRunDetail(flag: SlowRunFlag): string {
  const typical = formatDuration(flag.medianMs);
  const times = flag.ratio >= 10 ? Math.round(flag.ratio) : flag.ratio.toFixed(1);
  const parts = [`${times}x its typical ${typical} over the last ${flag.sampleCount} runs`];
  if (flag.stage) parts.push(`phase: ${flag.stage}`);
  if (flag.likelyCause) parts.push(flag.likelyCause);
  return parts.join(" — ");
}

function slowNoticeDetail(notice: SlowKindNotice): string {
  const median = notice.medianMs != null ? ` (typical ${formatDuration(notice.medianMs)})` : "";
  return `${notice.commonFactor}${median}.`;
}

/** True when a task in review likely needs a human browser check (#0687). */
export function taskAwaitingVisualCheck(
  task: Pick<Task, "status" | "isArchived" | "area" | "areas">,
  previewTargetAreas: string[],
): boolean {
  if (task.isArchived || task.status !== "review") return false;
  const areas = (task.areas?.length ? task.areas : parseTaskAreas(task.area)).map((a) =>
    a.toLowerCase(),
  );
  if (!areas.length) return false;
  const uiHints = new Set(["ui", "web", "ui-app", "frontend"]);
  if (areas.some((a) => uiHints.has(a))) return true;
  const targets = new Set(previewTargetAreas.map((a) => a.toLowerCase()));
  return areas.some((a) => targets.has(a));
}

function humanNeedsReasons(
  t: Pick<Task, "assignee" | "status" | "needsInput" | "needsMerge">,
): Array<"taskAssigned" | "taskNeedsInput" | "taskNeedsMerge" | "taskReview"> {
  const out: Array<"taskAssigned" | "taskNeedsInput" | "taskNeedsMerge" | "taskReview"> = [];
  if (t.assignee === "human" && t.status !== "done") out.push("taskAssigned");
  if (t.needsInput && t.status !== "done") out.push("taskNeedsInput");
  if (t.needsMerge && t.status !== "done") out.push("taskNeedsMerge");
  if (t.status === "review") out.push("taskReview");
  return out;
}

function pushItem(items: AttentionItem[], item: AttentionItem): void {
  if (items.some((x) => x.id === item.id)) return;
  items.push(item);
}

/**
 * Build the full attention feed from live server state. Pure — safe to unit test.
 */
export function buildAttentionFeed(input: AttentionFeedInput): AttentionFeed {
  const items: AttentionItem[] = [];
  const generatedAt = new Date().toISOString();

  for (const o of input.closeOutOutcomes) {
    const kind = CLOSE_OUT_KIND[o.outcome];
    if (!kind) continue;
    pushItem(items, {
      id: `${kind}:${o.taskId}:${o.finishedAt}`,
      kind,
      severity: SEVERITY[kind],
      taskId: o.taskId,
      message: closeOutTitle(o),
      detail: closeOutDetail(o),
      link: `/work?task=${o.taskId}`,
      at: o.finishedAt,
    });
  }

  const notesRun = input.releaseNotesRun;
  if (
    notesRun &&
    notesRun.state === "succeeded" &&
    !notesRun.stale &&
    (notesRun.startedAt || notesRun.updatedAt)
  ) {
    const eventKey = notesRun.startedAt ?? notesRun.updatedAt!;
    pushItem(items, {
      id: `releaseNotesReady:${eventKey}`,
      kind: "releaseNotesReady",
      severity: SEVERITY.releaseNotesReady,
      taskId: null,
      message: "Release notes ready",
      detail: "AI draft finished — review it on the Releases page.",
      link: "/releases",
      at: notesRun.updatedAt ?? eventKey,
    });
  }

  const run = input.releaseRun;
  if (run && (run.state === "succeeded" || run.state === "failed")) {
    const kind = run.state === "succeeded" ? "releaseSucceeded" : "releaseFailed";
    const eventKey = run.startedAt ?? run.updatedAt;
    if (eventKey) {
      const tag = releaseTagFromMessage(run.message);
      const message =
        run.state === "succeeded"
          ? `Release ${tag ?? ""} finished`.replace(/\s+/g, " ").trim()
          : "Release cut failed";
      pushItem(items, {
        id: `${kind}:${eventKey}`,
        kind,
        severity: SEVERITY[kind],
        taskId: null,
        message,
        detail: firstLine(run.message) || (tag ? `Tag ${tag}` : "See the Releases page."),
        link: "/releases",
        at: run.updatedAt ?? eventKey,
      });
    }
  }

  for (const t of input.tasks) {
    if (t.isArchived) continue;
    for (const kind of humanNeedsReasons(t)) {
      const reasons: string[] = [];
      if (kind === "taskAssigned") reasons.push("assigned to you");
      if (kind === "taskNeedsInput") reasons.push("needs input");
      if (kind === "taskNeedsMerge") reasons.push("merge needed");
      if (kind === "taskReview") reasons.push("awaiting sign-off");
      pushItem(items, {
        id: `${kind}:${t.id}`,
        kind,
        severity: SEVERITY[kind],
        taskId: t.id,
        message: `#${t.id} · ${t.title}`,
        detail: reasons.join(", "),
        link: `/work?task=${t.id}`,
        at: t.updated_at ?? t.created_at ?? generatedAt,
      });
    }
    if (taskAwaitingVisualCheck(t, input.previewTargetAreas)) {
      pushItem(items, {
        id: `awaitingVisualCheck:${t.id}`,
        kind: "awaitingVisualCheck",
        severity: SEVERITY.awaitingVisualCheck,
        taskId: t.id,
        message: `#${t.id} · open the preview`,
        detail: "UI task in review — verify it in a browser before Move to done.",
        link: `/work?task=${t.id}`,
        at: t.updated_at ?? t.created_at ?? generatedAt,
      });
    }
  }

  for (const ev of input.recordedEvents) {
    pushItem(items, {
      id: ev.id,
      kind: ev.kind,
      severity: SEVERITY[ev.kind],
      taskId: ev.taskId,
      message: ev.message,
      detail: ev.detail,
      link: ev.taskId ? `/work?task=${ev.taskId}` : null,
      at: ev.at,
    });
  }

  const durableProviderIds = new Set(
    input.recordedEvents.filter((e) => e.kind === "providerFailure").map((e) => e.id),
  );
  for (const f of input.recentProviderFailures) {
    if (!isProviderFailureReason(f.errorReason)) continue;
    const id = `providerFailure:${f.sessionId}`;
    if (durableProviderIds.has(id)) continue;
    const at = f.startedAt;
    pushItem(items, {
      id,
      kind: "providerFailure",
      severity: SEVERITY.providerFailure,
      taskId: f.taskId,
      message: f.taskId ? `Provider error on #${f.taskId}` : "Provider error",
      detail: firstLine(f.errorReason ?? "") || "Model or credit failure — check your provider.",
      link: f.taskId ? `/work?task=${f.taskId}` : "/agents?tab=tokens",
      at,
    });
  }

  for (const s of input.silentRuns) {
    pushItem(items, {
      id: `silentRun:${s.taskId}:${s.lastOutputAt ?? "none"}`,
      kind: "silentRun",
      severity: SEVERITY.silentRun,
      taskId: s.taskId,
      message: `#${s.taskId} · agent output went quiet`,
      detail: s.detail,
      link: `/work?task=${s.taskId}`,
      at: s.lastOutputAt ?? generatedAt,
    });
  }

  for (const flag of input.slowRuns ?? []) {
    pushItem(items, {
      id: flag.id,
      kind: "slowRun",
      severity: SEVERITY.slowRun,
      taskId: flag.taskId,
      message: slowRunTitle(flag),
      detail: slowRunDetail(flag),
      link: flag.taskId ? `/work?task=${flag.taskId}` : "/checks",
      at: generatedAt,
    });
  }

  for (const notice of input.slowRunNotices ?? []) {
    pushItem(items, {
      id: notice.id,
      kind: "slowRunsRecently",
      severity: SEVERITY.slowRunsRecently,
      taskId: null,
      message: `Checks are slow lately: ${notice.slowCount} of the last ${notice.windowCount}`,
      detail: slowNoticeDetail(notice),
      link: notice.remote ? "/checks?tab=remote" : "/checks",
      at: generatedAt,
    });
  }

  const threshold = input.config.attention?.spendAlertUsd ?? 0;
  if (threshold > 0 && input.totalSpendUsd != null && input.totalSpendUsd >= threshold) {
    pushItem(items, {
      id: `spendThreshold:${threshold}`,
      kind: "spendThreshold",
      severity: SEVERITY.spendThreshold,
      taskId: null,
      message: `Spend reached $${input.totalSpendUsd.toFixed(2)}`,
      detail: `Provider-reported total is at or above your $${threshold.toFixed(2)} alert in Settings.`,
      link: "/agents?tab=tokens",
      at: generatedAt,
    });
  }

  items.sort((a, b) => b.at.localeCompare(a.at));
  return { generatedAt, items };
}
