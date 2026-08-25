import { computed, reactive, ref } from "vue";
import { defineStore } from "pinia";
import { api, JSON_OPTS } from "../api";
import { useUiStore, type PendingScreenshot } from "./ui";
import { useNotificationsStore, type NotificationType } from "./notifications";
import { describeCloseOutFailure } from "../lib/closeOutFailure";
import type {
  AgentOutputEntry,
  AgentSessionStats,
  AutoEngineeringState,
  BoardIndex,
  BoardUsageStats,
  Counts,
  CtoState,
  Health,
  IntegrationPipelineSnapshot,
  RepoEvent,
  RepoIndex,
  ReviewReport,
  ReviewState,
  ScreenshotMeta,
  Status,
  SystemStats,
  Task,
  TaskUsageStats,
} from "../types";

export interface FeedItem {
  key: number;
  msg: string;
  color: string;
  kind: string;
  time: string;
}

export interface ToastItem {
  id: number;
  message: string;
  type: "error" | "success" | "info";
}

/** Summary returned by the review→done close-out endpoint. */
export interface DoneResult {
  ok: boolean;
  merged: boolean;
  alreadyMerged?: boolean;
  conflicts: string[];
  ff: boolean;
  drifted?: boolean;
  check?: {
    ok: boolean;
    detail?: string;
    stage?: string;
    command?: string;
    exitCode?: number | null;
    output?: string;
  };
  error?: string;
  task?: Task;
}

/**
 * Marker rethrown by `completeTask` when the server reports dirty files on
 * `main` blocking the close-out (0204). The caller renders a confirmation
 * modal offering "Commit & continue" / "Cancel"; until the user chooses, the
 * task stays in review. Carries the dirty file list so the modal can show it.
 */
export class DirtyMainError extends Error {
  readonly taskId: string;
  readonly dirtyFiles: string[];
  constructor(taskId: string, dirtyFiles: string[]) {
    super(
      `main has ${dirtyFiles.length} uncommitted file${dirtyFiles.length === 1 ? "" : "s"} blocking close-out`,
    );
    this.name = "DirtyMainError";
    this.taskId = taskId;
    this.dirtyFiles = dirtyFiles;
  }
}

/**
 * A failed review→done close-out, kept scoped to the task that produced it so
 * both the board card and the task panel render the same inline error directly
 * below the button the user pressed — never under a different task.
 */
export interface DoneError {
  message: string;
  conflicts: string[];
  step: string;
  /** Per-failure guidance; replaces the default conflict hint when set. */
  hint?: string;
  /** Newline-preserving check/build output excerpt for the expanded panel. */
  detail?: string;
}

/**
 * Marker thrown by `completeTask` on failure. The caller renders the inline
 * error (already stored per task) instead of a global toast, so `onError` can
 * skip the toast for exactly this kind of failure and nothing else.
 */
export class MoveToDoneError extends Error {
  readonly taskId: string;
  constructor(taskId: string, message: string) {
    super(message);
    this.name = "MoveToDoneError";
    this.taskId = taskId;
  }
}

/** Pull the conflicting file names out of the server's close-out error. */
export { extractConflicts } from "../lib/closeOutFailure";

/** Cap on retained transcript lines per task in the client. */
const OUTPUT_MAX_LINES = 2000;

/**
 * Prefix on the SSE id used to stream a task's reviewer conversation. The
 * engineer session streams under the plain task id; reviewer output streams
 * under `review:<taskId>` so the two conversations never mix (0110).
 */
const REVIEW_SESSION_PREFIX = "review:";

/**
 * SSE id of the CTO board-monitor conversation (0174). Its `agent.output`
 * events stream under this id so they never mix with task transcripts; the
 * panel renders them from the store's `cto.lines` buffer.
 */
const CTO_SESSION_ID = "cto:board";

export const STATUS_COLORS: Record<string, string> = {
  draft: "#3a4055",
  inbox: "#566081",
  ready: "#39e0ff",
  active: "#9d7bff",
  review: "#ffb454",
  done: "#4ef0a8",
};

export const statusColor = (s: string): string => STATUS_COLORS[s] ?? "#566081";

/**
 * The human-action reasons a task earns on the "Needs your attention" panel,
 * in display order. Empty when the task needs nothing from a human. Reasons
 * dedupe upstream: a task is listed once even when it matches several.
 */
export function humanNeedsReasons(
  t: Pick<Task, "assignee" | "status" | "needsInput" | "needsMerge">,
): string[] {
  const reasons: string[] = [];
  if (t.assignee === "human" && t.status !== "done") reasons.push("assigned to you");
  if (t.needsInput) reasons.push("needs input");
  if (t.needsMerge) reasons.push("merge needed");
  if (t.status === "review") reasons.push("awaiting sign-off");
  return reasons;
}

/** One row of the "Needs your attention" panel: the task plus its reasons. */
export interface HumanNeedsItem {
  task: Task;
  reasons: string[];
}

export interface Column {
  id: "draft" | "inbox" | "ready" | "active" | "review" | "done";
  label: string;
  color: string;
}

export const COLUMNS: Column[] = [
  { id: "inbox", label: "Inbox", color: "#566081" },
  { id: "ready", label: "Ready", color: "#39e0ff" },
  { id: "active", label: "Active", color: "#9d7bff" },
  { id: "review", label: "Review", color: "#ffb454" },
  { id: "done", label: "Done", color: "#4ef0a8" },
];

/** "recent" sorts by updated_at desc; "current" is the backend's status/priority/id order. */
export type SortOrder = "recent" | "current";

export const SORT_ORDER_OPTIONS: { value: SortOrder; label: string }[] = [
  { value: "recent", label: "Most recently updated" },
  { value: "current", label: "Priority level" },
];

const SORT_ORDER_KEY = "repoos.board.sortOrder";
const NEW_VERSION_KEY = "repoos.newVersion";

/**
 * Done-task acknowledgement (0278). A task that just landed in `done` keeps a
 * persistent highlight + "Acknowledge" button until the human clicks it. The
 * acked ids are persisted so a reload doesn't re-flag tasks already
 * acknowledged.
 *
 * The window bounds which already-done tasks flag on a fresh load: only ones
 * whose done-transition happened recently, so archive/history done cards never
 * permanently highlight. Slide in through `updated_at`, which the server writes
 * on every transition (and is the done time for a task that was finished while
 * the tab was closed).
 */
const DONE_ACKED_KEY = "repoos.done.acked";
const DONE_ACK_WINDOW_MS = 24 * 60 * 60 * 1000;

function readDoneAcked(): Set<string> {
  try {
    const raw = localStorage.getItem(DONE_ACKED_KEY);
    if (raw === null) return new Set();
    const v = JSON.parse(raw);
    return new Set(Array.isArray(v) ? v.filter((x) => typeof x === "string") : []);
  } catch {
    return new Set();
  }
}

function writeDoneAcked(ids: Set<string>): void {
  try {
    localStorage.setItem(DONE_ACKED_KEY, JSON.stringify([...ids]));
  } catch {
    /* ignore quota / privacy-mode failures */
  }
}

function readSortOrder(): SortOrder {
  try {
    const raw = localStorage.getItem(SORT_ORDER_KEY);
    if (raw === null) return "recent";
    const v = JSON.parse(raw);
    return v === "recent" || v === "current" ? v : "recent";
  } catch {
    return "recent";
  }
}

/** The persisted "new version available" notice, or null. */
function readNewVersion(): { hash: string; buildAt: string | null } | null {
  try {
    const raw = localStorage.getItem(NEW_VERSION_KEY);
    if (raw === null) return null;
    const v = JSON.parse(raw);
    if (v && typeof v.hash === "string") {
      return { hash: v.hash, buildAt: typeof v.buildAt === "string" ? v.buildAt : null };
    }
  } catch {
    /* ignore corrupt/private-mode storage */
  }
  return null;
}

export const useRepoStore = defineStore("repo", () => {
  const origin = window.location.origin;
  const loading = ref(true);
  const connected = ref(false);
  const health = ref<Health | null>(null);
  const tasks = ref<Task[]>([]);
  const counts = reactive<Counts>({ draft: 0, inbox: 0, ready: 0, active: 0, review: 0, done: 0 });
  const feed = reactive<FeedItem[]>([]);
  const eventCount = ref(0);
  const flashId = ref<string | null>(null);
  interface TransitionState {
    id: string;
    from: string;
    to: string;
  }
  const transitionState = ref<TransitionState | null>(null);
  const runningIds = ref<string[]>([]);
  /** Ids waiting for a free maxConcurrentAgents slot — will spawn automatically. */
  const queuedIds = ref<string[]>([]);
  /** Server-authoritative start time for a live agent turn, keyed by task id. */
  const runningSince = ref<Record<string, string>>({});
  /** Most recent streamed agent output, keyed by task id (a useful "really active" cue). */
  const agentActivityAt = ref<Record<string, string>>({});
  /** When each task's agent last exited (ms timestamp), for the "paused" grace period. */
  const agentExitedAt = ref<Record<string, number>>({});
  /**
   * Debounce timers for paused notifications (0100). When an agent exits on an
   * active task we wait briefly before firing "paused" — if a new turn starts
   * (agent.running) or the task status changes (e.g. handoff to review), the
   * timer is cancelled. This prevents false "paused" notifications on every
   * normal turn boundary and on the server-side race where agent.exited is
   * emitted before the handoff's task.updated.
   */
  const pendingPauseTimers = ref<Record<string, ReturnType<typeof setTimeout>>>({});
  const PAUSE_DEBOUNCE_MS = 3000;
  const outputs = ref<Record<string, AgentOutputEntry[]>>({});
  /** Live run telemetry per task (time/tokens/cost/stalled), keyed by task id. */
  const agentStats = ref<Record<string, AgentSessionStats>>({});
  /** Live step of the review→done close-out, keyed by task id. */
  const doneSteps = ref<Record<string, string>>({});
  /** Last failed review→done close-out per task id (inline error card). */
  const doneErrors = ref<Record<string, DoneError>>({});
  /** Dirty files on `main` blocking a move-to-done per task id (0204). Empty
   * when no confirmation is pending. The modal reads this and the caller
   * clears it via `clearDirtyMain` on Cancel (or it is overwritten by the
   * next run). */
  const dirtyMain = ref<Record<string, string[]>>({});
  /** The review agent's report per task, hydrated on demand + via SSE. */
  const reviews = ref<Record<string, ReviewState>>({});
  /** The CTO board monitor (0174): live state hydrated from `/api/cto` + SSE. */
  const cto = ref<CtoState>({ running: false, enabled: false, report: null, lines: [] });
  /** Diff statistics per task: files changed, additions, deletions. */
  const diffStats = ref<Record<string, { filesChanged: number; additions: number; deletions: number }>>({});
  /** Full patch diffs per task. */
  const diffs = ref<Record<string, { patch: string; truncated: boolean } | null>>({});
  /** Historical usage totals for a task (incl. role breakdown), keyed by id. */
  const taskUsage = ref<Record<string, TaskUsageStats | null>>({});
  /** Board-level usage totals (overall + per-role + per-day, 0230). */
  const boardUsage = ref<BoardUsageStats | null>(null);
  /** Board usage is fetched separately from the board payload. Keep its state
   * explicit so a failed optional request is not mistaken for invisible UI. */
  const boardUsageLoading = ref(false);
  const boardUsageError = ref<string | null>(null);
  /** Live system resource stats from the SSE stream. */
  const systemStats = ref<SystemStats | null>(null);
  /** Live integration-pipeline snapshot for the pinned status bar (0207). */
  const integration = ref<IntegrationPipelineSnapshot | null>(null);
  /** Live auto-engineering mode state (0124), fed by SSE + hydrated via API. */
  const autoEng = ref<AutoEngineeringState | null>(null);
  const sortOrder = ref<SortOrder>(readSortOrder());
  /** Done-task ids the human has acknowledged (0278). Persisted; a task whose
   *  id is here stays un-highlighted across reloads. */
  const doneAcked = ref<Set<string>>(readDoneAcked());
  /** Dismissible toasts stacked at the top-right. */
  const toasts = ref<ToastItem[]>([]);
  /**
   * A newer build parked on disk by a close-out (0143). Persisted so a page
   * reload does not drop the notice; cleared when the running server actually
   * serves that build.
   */
  const newVersion = ref<{ hash: string; buildAt: string | null } | null>(readNewVersion());
  /** True from clicking the notice until the reload swap reconnects. */
  const restarting = ref(false);

  let feedKey = 0;
  let toastId = 0;
  let es: EventSource | null = null;
  /**
   * When init()'s own index fetch completed, or 0 once consumed. Lets the FIRST
   * SSE open skip its refresh: init() fetched the index moments earlier and the
   * payload is ~1 MB at 200 tasks, so refetching it doubled the largest transfer
   * of a page load for data that could not have changed.
   *
   * Time-bounded rather than a plain flag, because the skip is only sound while
   * the two are genuinely adjacent. If the connection took a while to open,
   * events emitted in that window were never delivered and never replayed, so
   * the refresh has to happen. Reconnects always refresh — the stamp is cleared
   * after the first open.
   */
  let initRefreshAt = 0;
  /** Longest gap between init()'s fetch and the first SSE open that can be treated as "nothing happened". */
  const INIT_REFRESH_REUSE_MS = 2000;
  let flashTimer: ReturnType<typeof setTimeout> | null = null;
  let transitionTimer: ReturnType<typeof setTimeout> | null = null;

  const repoName = computed(() => (health.value ? health.value.root.split("/").pop() ?? "" : ""));
  const workDir = computed(() => (health.value ? health.value.workDir : "work"));
  const total = computed(() => tasks.value.length);
  const backlogCount = computed(() => tasks.value.filter((t) => t.status !== "draft").length);
  const aiTasks = computed(() => tasks.value.filter((t) => t.assignee === "ai" && t.status !== "done"));

  /** Priority rank for the needs-you sort: p0 first, then p1/p2/p3. */
  const PRIORITY_RANK: Record<string, number> = { p0: 0, p1: 1, p2: 2, p3: 3 };
  /** Tasks a human must act on (0125), deduped, priority-first then newest. */
  const humanNeeds = computed<HumanNeedsItem[]>(() => {
    const items: HumanNeedsItem[] = [];
    const seen = new Set<string>();
    for (const t of tasks.value) {
      const reasons = humanNeedsReasons(t);
      if (!reasons.length || seen.has(t.id)) continue;
      seen.add(t.id);
      items.push({ task: t, reasons });
    }
    return items.sort((a, b) => {
      const pa = PRIORITY_RANK[a.task.priority] ?? 99;
      const pb = PRIORITY_RANK[b.task.priority] ?? 99;
      if (pa !== pb) return pa - pb;
      const ua = a.task.updated_at ?? a.task.created_at ?? "";
      const ub = b.task.updated_at ?? b.task.created_at ?? "";
      return ub.localeCompare(ua);
    });
  });

  const fmtDate = (s: string | null): string => (s ? new Date(s).toLocaleString() : "—");

  const byStatus = (s: string): Task[] => {
    const filtered = tasks.value.filter((t) => t.status === s);
    if (sortOrder.value !== "recent") return filtered;
    return [...filtered].sort((a, b) => {
      if (!a.updated_at) return b.updated_at ? 1 : 0;
      if (!b.updated_at) return -1;
      return b.updated_at.localeCompare(a.updated_at);
    });
  };

  function setSortOrder(order: SortOrder): void {
    sortOrder.value = order;
    try {
      localStorage.setItem(SORT_ORDER_KEY, JSON.stringify(order));
    } catch {
      /* ignore quota / privacy-mode failures */
    }
  }

  /**
   * True when a `done` task's highlight should still show: it became done
   * recently enough to be "fresh" AND the human hasn't acknowledged it.
   * Only ever true for `done` status.
   */
  function doneRecently(t: Pick<Task, "status" | "updated_at">): boolean {
    if (t.status !== "done") return false;
    const at = t.updated_at;
    if (!at || Number.isNaN(Date.parse(at))) return false;
    return Date.now() - Date.parse(at) < DONE_ACK_WINDOW_MS;
  }

  /** True when the task card should render the persistent "just done" highlight. */
  function needsAck(t: Pick<Task, "id" | "status" | "updated_at">): boolean {
    return doneRecently(t) && !doneAcked.value.has(t.id);
  }

  /** The number of unacked fresh-done tasks, for the Done column cap badge. */
  const doneAckCount = computed(() => {
    let n = 0;
    for (const t of tasks.value) if (needsAck(t)) n++;
    return n;
  });

  /** Clear the persistent highlight for a done task (human clicked Acknowledge). */
  function acknowledge(id: string): void {
    if (doneAcked.value.has(id)) return;
    const next = new Set(doneAcked.value);
    next.add(id);
    doneAcked.value = next;
    writeDoneAcked(next);
  }

  // Keep the in-memory ack set in sync across tabs (0278): another tab
  // acknowledging a done task must clear its highlight here too.
  if (typeof window !== "undefined") {
    window.addEventListener("storage", (ev) => {
      if (ev.key !== DONE_ACKED_KEY) return;
      doneAcked.value = readDoneAcked();
    });
  }

  function recount(): void {
    const c: Counts = { draft: 0, inbox: 0, ready: 0, active: 0, review: 0, done: 0 };
    for (const t of tasks.value) c[t.status] = (c[t.status] ?? 0) + 1;
    Object.assign(counts, c);
  }

  function pushFeed(msg: string, color: string, kind: string): void {
    feed.unshift({ key: feedKey++, msg, color, kind, time: new Date().toTimeString().slice(0, 8) });
    if (feed.length > 30) feed.pop();
  }

  const TOAST_TIMEOUT = 6000;
  /** Recent toast messages with timestamps, used to suppress duplicates. */
  const recentToasts = new Map<string, number>();
  const DEDUP_WINDOW_MS = 100;

  function pushToast(message: string, type: ToastItem["type"] = "error"): ToastItem | null {
    const key = `${type}:${message}`;
    const now = Date.now();
    const last = recentToasts.get(key);
    if (last && now - last < DEDUP_WINDOW_MS) return null;
    recentToasts.set(key, now);
    const id = ++toastId;
    const toast = { id, message, type };
    toasts.value.unshift(toast);
    if (toasts.value.length > 5) toasts.value.pop();
    setTimeout(() => removeToast(id), TOAST_TIMEOUT);
    return toast;
  }

  function removeToast(id: number): void {
    toasts.value = toasts.value.filter((t) => t.id !== id);
  }

  function flash(id: string): void {
    flashId.value = id;
    if (flashTimer) clearTimeout(flashTimer);
    flashTimer = setTimeout(() => {
      if (flashId.value === id) flashId.value = null;
    }, 1200);
  }

  function startTransition(id: string, from: string, to: string): void {
    transitionState.value = { id, from, to };
    if (transitionTimer) clearTimeout(transitionTimer);
    transitionTimer = setTimeout(() => {
      transitionState.value = null;
    }, 800);
  }

  /** Store or clear the inline move-to-done error for a task. */
  function setDoneError(id: string, err: DoneError | null): void {
    const next = { ...doneErrors.value };
    if (err === null) delete next[id];
    else next[id] = err;
    doneErrors.value = next;
  }

  /** The inline move-to-done error for a task, or null when none is pending. */
  const doneErrorFor = (id: string): DoneError | null => doneErrors.value[id] ?? null;

  /** Dirty files on `main` pending a move-to-done decision (0204), or [] when the modal is not needed. */
  const dirtyMainFor = (id: string): string[] => dirtyMain.value[id] ?? [];

  /** Clear the pending dirty-main confirmation for a task (user chose Cancel). */
  function clearDirtyMain(id: string): void {
    const next = { ...dirtyMain.value };
    delete next[id];
    dirtyMain.value = next;
  }

  /**
   * Fire an attention notification for a monitored state transition (0100):
   * review-ready, paused, stuck, or needs-attention. Only the user's enabled
   * channels (bell sound / push) run, gated per event type. Best-effort —
   * never throws into the SSE pipeline.
   */
  function notifyAttention(type: NotificationType, t: Task): void {
    const notifications = useNotificationsStore();
    if (!notifications.types[type]) return;
    const label = `#${t.id} · ${t.title}`;
    if (type === "review") {
      void notifications.notify(type, "Task ready for review", label);
    } else if (type === "paused") {
      void notifications.notify(type, "Task paused", label);
    } else if (type === "stuck") {
      void notifications.notify(type, "Task looks stuck", label);
    } else {
      void notifications.notify(type, "Task needs attention", label);
    }
  }

  function applyEvent(e: RepoEvent): void {
    eventCount.value++;
    if (e.type === "hello") {
      // Every SSE (re)connect announces a server. If this server already runs
      // the build the notice points at, a reload landed (or the server was
      // restarted into it) — clear the notice. Otherwise it persists. A
      // replacement server also loses old SSE `agent.exited` events, so
      // reconcile the authoritative running set here to avoid phantom
      // “coding…” indicators after a reload.
      void reconcileVersion();
      void fetchRunning();
      void fetchQueued();
      return;
    }
    if (e.type === "build.available") {
      // A close-out parked a newer build on disk (0143). The server keeps
      // serving the current build until the user clicks the notice.
      setNewVersion(e.hash, e.buildAt);
      pushFeed(`<b>new build</b> available — restart to apply`, "#39e0ff", "build.available");
      return;
    }
    if (e.type === "reload.failed") {
      // The reload swap failed and the old server kept serving (no outage).
      // Release the "Restarting…" state so the notice stays actionable.
      restarting.value = false;
      pushToast("Restart failed — the server kept running the current build", "error");
      return;
    }
    if (e.type === "task.created") {
      if (!tasks.value.find((t) => t.id === e.task.id)) tasks.value.push(e.task);
      recount();
      pushFeed(`<b>created</b> #${e.task.id} ${e.task.title}`, "#4ef0a8", "task.created");
      flash(e.task.id);
    } else if (e.type === "task.updated") {
      const i = tasks.value.findIndex((t) => t.id === e.task.id);
      const before = i >= 0 ? tasks.value[i] : null;
      const prevStatus = e.prev?.status;
      const statusChanged =
        prevStatus !== undefined && prevStatus !== e.task.status && before !== null;
      // The server's index has no preview state, so carry the drawer's live
      // preview across updates (it only changes via `preview` events).
      // checkRetryCount lives in `extra` on the full Task the SSE payload
      // carries (unlike the board fetch, which has it as a first-class
      // field) — derive it the same way toBoardTask() does server-side.
      const checkRetryCount =
        typeof e.task.extra?.check_retry_count === "number"
          ? e.task.extra.check_retry_count
          : (before?.checkRetryCount ?? 0);
      const merged = { ...e.task, preview: e.task.preview ?? before?.preview ?? null, checkRetryCount };
      if (i >= 0) tasks.value[i] = merged;
      else tasks.value.push(merged);
      const ui = useUiStore();
      if (ui.active && ui.active.id === e.task.id) ui.open(merged);
      recount();
      // A close-out error only makes sense while the task is still in review;
      // once it leaves review (done, moved back, etc.) the stale card would
      // mislead, so drop it.
      if (e.task.status !== "review") setDoneError(e.task.id, null);
      const changed = Object.keys(e.prev ?? {});
      const statusBit =
        e.prev && e.prev.status !== undefined
          ? ` → <span style="color:${statusColor(e.task.status)}">${e.task.status}</span>`
          : "";
      pushFeed(
        `<b>updated</b> #${e.task.id}${statusBit} <span style="color:var(--txt-faint)">(${changed.join(", ")})</span>`,
        statusColor(e.task.status),
        "task.updated",
      );
      flash(e.task.id);
      if (statusChanged) {
        startTransition(e.task.id, prevStatus!, e.task.status);
      }
      // Attention notifications (0100): only on a genuine transition, never on
      // page load for a task that already sits in a monitored state.
      //
      // A "stuck" transition is detected from the watchdog's own activity
      // marker rather than a status pair. The watchdog surfaces a stuck task
      // into `review` whenever its worktree holds reviewable work (the common
      // case) or into `ready` when it has none, and escalates a stuck task to
      // `needsInput` when auto-transition is off — so no single status change
      // uniquely identifies "stuck". Its marker, written into the task body on
      // every surface/escalation, is the authoritative signal. Keying off it
      // also means a manual `active`->`review` handoff (or an `active`->`ready`
      // rollback) is never misreported as stuck.
      const prevNeedsInput = e.prev?.needsInput;
      const watchdogStuck =
        before &&
        /watchdog: auto-surfaced stuck task|watchdog: escalated to needs_input/i.test(
          e.task.body ?? "",
        );
      if (watchdogStuck) {
        notifyAttention("stuck", e.task);
      } else if (before && statusChanged && prevStatus === "active" && e.task.status === "review") {
        notifyAttention("review", e.task);
      } else if (before && prevNeedsInput === false && e.task.needsInput === true) {
        // A user-set needs-attention flag (the `needsInput` marker is what the
        // watchdog escalation does NOT carry).
        notifyAttention("needsInput", e.task);
      }
    } else if (e.type === "task.deleted") {
      tasks.value = tasks.value.filter((t) => t.id !== e.id);
      const ui = useUiStore();
      if (ui.active && ui.active.id === e.id) ui.close();
      setDoneError(e.id, null);
      recount();
      pushFeed(`<b>deleted</b> #${e.id}`, "#ff6b7d", "task.deleted");
    } else if (e.type === "agent.running") {
      if (!runningIds.value.includes(e.id)) {
        runningIds.value = [...runningIds.value, e.id];
      }
      // Cancel any pending "paused" debounce — a new turn is starting.
      if (pendingPauseTimers.value[e.id]) {
        clearTimeout(pendingPauseTimers.value[e.id]);
        const next = { ...pendingPauseTimers.value };
        delete next[e.id];
        pendingPauseTimers.value = next;
      }
      runningSince.value = { ...runningSince.value, [e.id]: e.at };
      agentActivityAt.value = { ...agentActivityAt.value, [e.id]: e.at };
      pushFeed(`<b>agent coding</b> on #${e.id}`, "#9d7bff", "agent.running");
    } else if (e.type === "agent.queued") {
      if (!queuedIds.value.includes(e.id)) {
        queuedIds.value = [...queuedIds.value, e.id];
      }
    } else if (e.type === "agent.dequeued") {
      queuedIds.value = queuedIds.value.filter((x) => x !== e.id);
    } else if (e.type === "agent.output") {
      if (e.id === CTO_SESSION_ID) {
        // CTO board-monitor conversation output — routed to the CTO panel's
        // lines buffer, never into a task transcript.
        cto.value = {
          ...cto.value,
          lines: [...cto.value.lines, e.entry].slice(-OUTPUT_MAX_LINES),
        };
        return;
      }
      if (e.id.startsWith(REVIEW_SESSION_PREFIX)) {
        // Reviewer conversation output — routed to the review lines buffer,
        // never into the engineer transcript.
        const tid = e.id.slice(REVIEW_SESSION_PREFIX.length);
        const state = reviews.value[tid];
        if (!state) return;
        reviews.value = {
          ...reviews.value,
          [tid]: {
            ...state,
            lines: [...(state.lines ?? []), e.entry].slice(-OUTPUT_MAX_LINES),
          },
        };
        return;
      }
      const prev = outputs.value[e.id] ?? [];
      outputs.value = {
        ...outputs.value,
        [e.id]: [...prev, e.entry].slice(-OUTPUT_MAX_LINES),
      };
      agentActivityAt.value = { ...agentActivityAt.value, [e.id]: new Date().toISOString() };
    } else if (e.type === "agent.stats") {
      agentStats.value = { ...agentStats.value, [e.id]: e.stats };
    } else if (e.type === "agent.exited") {
      const wasRunning = runningIds.value.includes(e.id);
      runningIds.value = runningIds.value.filter((x) => x !== e.id);
      runningSince.value = Object.fromEntries(Object.entries(runningSince.value).filter(([id]) => id !== e.id));
      agentActivityAt.value = { ...agentActivityAt.value, [e.id]: e.at };
      agentExitedAt.value = { ...agentExitedAt.value, [e.id]: Date.now() };
      // A deliberate pause (0100): a running agent stops on a task that stays
      // `active` (and neither needs input nor handed off to review).  Instead
      // of firing immediately we debounce — a new turn (agent.running) or a
      // status change (task.updated for the handoff) will cancel the timer.
      // This avoids two races:
      //  1. Every normal turn boundary emits agent.exited while the task
      //     remains active; the next agent.running cancels the pending timer.
      //  2. On a handoff the server emits agent.exited *before* the
      //     handoff's task.updated (active→review); the timer fires after
      //     3 s and sees the task is no longer active, so no false "paused".
      if (wasRunning) {
        const timer = setTimeout(() => {
          const next = { ...pendingPauseTimers.value };
          delete next[e.id];
          pendingPauseTimers.value = next;
          const exited = tasks.value.find((t) => t.id === e.id);
          if (exited && exited.status === "active" && !exited.needsInput) {
            notifyAttention("paused", exited);
          }
        }, PAUSE_DEBOUNCE_MS);
        const prev = pendingPauseTimers.value[e.id];
        if (prev) clearTimeout(prev);
        pendingPauseTimers.value = { ...pendingPauseTimers.value, [e.id]: timer };
      }
      pushFeed(`<b>agent stopped</b> on #${e.id}`, "#ffb454", "agent.exited");
      if (outputs.value[e.id]) {
        outputs.value = {
          ...outputs.value,
          [e.id]: [...outputs.value[e.id], { s: "sys", d: "— agent stopped —" }],
        };
      }
    } else if (e.type === "task.progress") {
      doneSteps.value = { ...doneSteps.value, [e.id]: e.step };
      // Background close-out failure (0199): the /done POST only enqueues the
      // job, so a later failure arrives here as an SSE event. Surface it as the
      // inline done error the card/drawer already render.
      if (e.step === "failed" && e.detail) {
        // Background close-out failure (0199, 0215): the /done POST only
        // enqueues the job, so a later failure arrives here as an SSE event.
        // The job's failing `phase` (when known) and its `reason` drive the
        // message, so a `check failed` reason never reads like a conflict.
        //
        // A failure for a task that is already `done` is moot (#0289): the
        // task finished through an earlier close-out and this is a duplicate
        // or stale job. Surfacing it would leave a permanent, misleading
        // error badge on an already-finished task, so skip it.
        if (tasks.value.find((t) => t.id === e.id)?.status !== "done") {
          setDoneError(e.id, describeCloseOutFailure(e.phase, e.detail));
        }
      }
    } else if (e.type === "task.corrected") {
      // The server patched the main copy to match the worktree's committed
      // state because the agent's fail-safe checklist silently failed — worth
      // surfacing, not papering over.
      pushFeed(`<b>board self-healed</b> #${e.id} — ${e.note}`, "#ffb454", "task.corrected");
    } else if (e.type === "preview") {
      // A preview started or stopped for a task: reflect it on the stored task
      // and, when the drawer is open on that task, on the drawer's copy.
      const i = tasks.value.findIndex((t) => t.id === e.id);
      if (i >= 0) {
        const updated = { ...tasks.value[i], preview: e.preview };
        tasks.value[i] = updated;
        const ui = useUiStore();
        if (ui.active && ui.active.id === e.id) ui.open(updated);
      }
      pushFeed(
        e.preview
          ? `<b>preview</b> #${e.id} at <span class="mono">${e.preview.url}</span>`
          : `<b>preview stopped</b> for #${e.id}`,
        e.preview ? "#39e0ff" : "#ffb454",
        "preview",
      );
    } else if (e.type === "review") {
      // The review agent started or finished on a task in review. Mark it live
      // immediately, then pull the finished report from the server.
      const prev = reviews.value[e.id];
      reviews.value = {
        ...reviews.value,
        [e.id]: {
          running: e.state === "running",
          enabled: true,
          report: prev?.report ?? null,
          lines: prev?.lines ?? [],
        },
      };
      if (e.state === "running") {
        pushFeed(`<b>agent review</b> started on #${e.id}`, "#ffb454", "review");
      } else if (e.state !== "cancelled") {
        void loadReview(e.id);
        pushFeed(
          e.state === "ready"
            ? `<b>agent review</b> ready for #${e.id}`
            : `<b>agent review failed</b> on #${e.id}${e.error ? ` — ${e.error}` : ""}`,
          e.state === "ready" ? "#39e0ff" : "#ff6b7d",
          "review",
        );
      }
    } else if (e.type === "cto") {
      // The CTO monitor started or finished a pass. Track it live; when a run
      // ends (ready/failed/cancelled) pull the authoritative report, which is
      // written only once the run completes.
      cto.value = { ...cto.value, running: e.state === "running" };
      if (e.state !== "running") {
        void loadCTO();
      }
    } else if (e.type === "index.rebuilt") {
      void refresh();
    } else if (e.type === "system.stats") {
      systemStats.value = e.stats;
    } else if (e.type === "auto-engineering.state") {
      autoEng.value = e.state;
    } else if (e.type === "integration") {
      integration.value = e.pipeline;
    }
  }

  /** Hydrate auto-engineering state after a refresh/SSE gap (0124). */
  async function refreshAutoEng(): Promise<void> {
    try {
      autoEng.value = await api<AutoEngineeringState>("/api/auto-engineering/state");
    } catch {
      /* non-fatal — the panel falls back to its empty state */
    }
  }

  /** Hydrate the integration-pipeline snapshot after a refresh/SSE gap (0207). */
  async function refreshIntegration(): Promise<void> {
    try {
      const r = await api<{ ok: boolean; pipeline: IntegrationPipelineSnapshot }>("/api/integration/pipeline");
      if (r.pipeline) integration.value = r.pipeline;
    } catch {
      /* non-fatal — the bar falls back to its idle state */
    }
  }

  /**
   * Retry a failed integration job (0207). Reuses the server's existing retry
   * path (re-enqueue as a fresh queued job). Best-effort: non-fatal errors are
   * surfaced as a toast for the caller to catch.
   */
  async function retryIntegration(taskId: string): Promise<void> {
    await api<{ ok: boolean }>(`/api/integration/pipeline/retry/${taskId}`, { method: "POST" });
  }

  function connectSSE(): void {
    if (es) es.close();
    es = new EventSource(origin + "/api/events");
    es.onopen = () => {
      connected.value = true;
      // Events emitted while EventSource reconnects are not replayed. Refresh
      // the server-authoritative index on every open so a reviewer that
      // started, finished, or failed during that gap cannot leave a stale card
      // or disabled/enabled done action behind.
      //
      // The one exception is the very first open of a page load, when init()
      // fetched the index moments earlier and no gap existed to miss events in.
      // Refetching there doubled the largest payload the app transfers. If
      // init()'s refresh failed, or the connection was slow enough that events
      // could have been missed, the stamp does not qualify and this still runs.
      const reusable = initRefreshAt > 0 && Date.now() - initRefreshAt < INIT_REFRESH_REUSE_MS;
      initRefreshAt = 0;
      if (reusable) {
        /* init() just fetched it and no gap existed to miss events in */
      } else {
        void refresh().catch(() => {
          /* connection state already reflects the successful SSE open */
        });
      }
      void refreshAutoEng().catch(() => {
        /* non-fatal hydration */
      });
      void loadCTO().catch(() => {
        /* non-fatal hydration */
      });
      void refreshIntegration().catch(() => {
        /* non-fatal hydration */
      });
      // The running map is independent from task status. Reconcile it on every
      // connection so a missed `agent.running` frame can never leave a review
      // card saying "waiting for human" while its engineer is still working.
      void fetchRunning();
      void fetchQueued();
    };
    es.onerror = () => {
      connected.value = false;
    };
    for (const t of ["hello", "index.rebuilt", "task.created", "task.updated", "task.deleted", "task.progress", "task.corrected", "preview", "review", "cto", "agent.running", "agent.exited", "agent.output", "agent.stats", "system.stats", "build.available", "reload.failed", "integration"]) {
      es.addEventListener(t, (ev: MessageEvent) => {
        connected.value = true;
        try {
          applyEvent(JSON.parse(ev.data) as RepoEvent);
        } catch {
          /* ignore malformed frames */
        }
      });
    }
  }

  async function refresh(): Promise<void> {
    const idx = await api<BoardIndex>("/api/board");
    // /api/board has no preview state; keep any live previews across rebuilds.
    const previews = new Map(tasks.value.map((t) => [t.id, t.preview] as const));
    // Preserve full bodies already in the store (from SSE task.updated events).
    // Only fall back to bodyPreview for tasks we haven't seen before.
    const existingBodies = new Map(tasks.value.map((t) => [t.id, t.body] as const));
    tasks.value = idx.tasks.map((t) => ({
      ...t,
      preview: t.preview ?? previews.get(t.id) ?? null,
      // Use existing full body if we have it; otherwise use the preview from the board response.
      body: existingBodies.has(t.id) ? (existingBodies.get(t.id) ?? "") : (t.bodyPreview ?? ""),
      extra: {},
      agentOverride: null,
      cliOverride: null,
      modelOverride: null,
      pmAgentOverride: null,
      pmCliOverride: null,
      pmModelOverride: null,
      reviewAgentOverride: null,
      reviewCliOverride: null,
      reviewModelOverride: null,
      releasedAt: t.releasedAt ?? null,
    })) as unknown as Task[];
    // Index hydration is the recovery path after reconnecting while a review
    // was running. Cards get their live activity state immediately; reports
    // would otherwise lazy-load from the drawer on open (0291).
    const hydratedReviews: Record<string, ReviewState> = {};
    for (const task of idx.tasks) {
      if (task.status !== "review") continue;
      if (!task.automaticReview) continue;
      hydratedReviews[task.id] = {
        running: task.automaticReview.running,
        enabled: task.automaticReview.enabled,
        report: reviews.value[task.id]?.report ?? null,
        lines: reviews.value[task.id]?.lines ?? [],
      };
    }
    reviews.value = { ...reviews.value, ...hydratedReviews };
    // 0291: a completed review's SSE event can be lost when the server reloads
    // in the middle of it. Events are not replayed across an EventSource
    // reconnect, so the board card's verdict badge would show the previous
    // round's verdict indefinitely. Recovery: for every task still in `review`
    // and NOT currently being reviewed after a reconnect, pull the
    // authoritative report again (bounded — only completed reviews, never the
    // whole history, and never while a review is live). Fire-and-forget so
    // hydration isn't blocked; the verdict badge updates when the fetch lands.
    for (const task of idx.tasks) {
      if (task.status === "review" && task.automaticReview?.enabled && !task.automaticReview.running) {
        void loadReview(task.id);
      }
    }
    Object.assign(counts, idx.counts);
  }

  async function fetchTask(id: string): Promise<Task> {
    return api<Task>(`/api/tasks/${id}`);
  }

  async function patchTask(id: string, fields: Record<string, unknown>): Promise<Task> {
    return api<Task>(`/api/tasks/${id}`, JSON_OPTS("PATCH", fields));
  }

  /**
   * Ask the running server whether a newer build is parked and whether it
   * already serves it. On SSE `hello` (every connect/reconnect) and page load
   * this is the reliable path to discover a parked build the one-shot
   * `build.available` event may have arrived while we were disconnected:
   *
   * - When health reports a parked build NEWER than the running one, SET the
   *   notice (the "new version available" banner) — the tab missed the event.
   * - When the running build already serves the parked build, or is at least
   *   as new as it, CLEAR the notice (a reload landed, or the server restarted
   *   into it). A normal dev build can auto-reload the server into something
   *   newer than the parked one (0143 parks only close-out builds); timestamps
   *   tell: once the running build is at least as new as the parked one, the
   *   notice has no value left.
   */
  async function reconcileVersion(): Promise<void> {
    try {
      const h = await api<Health>("/api/health");
      health.value = h;
      const v = newVersion.value;
      // Normalize against servers/tests that predate these fields.
      const parkedHash =
        typeof h.buildAvailableHash === "string" && h.buildAvailableHash !== ""
          ? h.buildAvailableHash
          : null;
      const parkedAt = parkedHash === null ? null : h.buildAvailableAt ?? null;

      if (parkedHash !== null) {
        const runningServesParked = h.buildHash !== null && h.buildHash === parkedHash;
        const runningAtLeastAsNew =
          h.buildAt !== null &&
          parkedAt !== null &&
          new Date(h.buildAt).getTime() >= new Date(parkedAt).getTime();
        if (runningServesParked || runningAtLeastAsNew) {
          clearNewVersion();
          return;
        }
        // The parked build is newer than the running one — surface the notice,
        // or keep it when it already points at this build.
        if (!v || v.hash !== parkedHash) setNewVersion(parkedHash, parkedAt);
        return;
      }

      // No parked build reported: reconcile any persisted notice against the
      // running build so a reload that already landed clears it.
      if (!v) return;
      const sameHash = h.buildHash !== null && h.buildHash === v.hash;
      const atLeastAsNew =
        h.buildAt !== null &&
        v.buildAt !== null &&
        new Date(h.buildAt).getTime() >= new Date(v.buildAt).getTime();
      if (sameHash || atLeastAsNew) clearNewVersion();
    } catch {
      /* server unreachable — keep the notice and the restarting state */
    }
  }

  /** Persist the "new version available" notice (survives a page reload). */
  function setNewVersion(hash: string, buildAt: string | null): void {
    const v = { hash, buildAt };
    newVersion.value = v;
    try {
      localStorage.setItem(NEW_VERSION_KEY, JSON.stringify(v));
    } catch {
      /* ignore quota / privacy-mode failures */
    }
  }

  function clearNewVersion(): void {
    newVersion.value = null;
    restarting.value = false;
    try {
      localStorage.removeItem(NEW_VERSION_KEY);
    } catch {
      /* ignore quota / privacy-mode failures */
    }
  }

  /**
   * Trigger a server reload into the parked build (0143). The reload swap drops
   * SSE; the reconnect's hello handler reconciles and clears the notice once
   * the server reports the new build. When the server already runs the current
   * build (a reload landed while the tab was open elsewhere), clear directly.
   */
  async function restartServer(): Promise<void> {
    try {
      const r = await api<{ state: string; reason?: string }>("/api/server/restart", {
        method: "POST",
      });
      if (r.state === "not-stale") {
        clearNewVersion();
        pushToast("Server already runs the current build", "info");
      } else if (r.state === "reloading") {
        restarting.value = true;
        pushToast("Reloading server into the new build…", "info");
      } else {
        // Deferred: an agent turn or the close-out pipeline itself is still
        // running. The reload will apply once the server is idle.
        pushToast("Reload deferred — the server is busy right now", "info");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      pushToast(message, "error");
    }
  }

  async function setStatus(t: Task, status: string): Promise<void> {
    if (t.status === status) return;
    try {
      await patchTask(t.id, { status });
      // Moving a review task anywhere (other than through the done workflow)
      // invalidates any close-out error shown on its card.
      if (status !== "review") setDoneError(t.id, null);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      pushToast(message, "error");
      throw err;
    }
  }

  const isRunning = (id: string): boolean => runningIds.value.includes(id);
  const isQueued = (id: string): boolean => queuedIds.value.includes(id);

  /** Start an agent turn; `clean` discards the dirty worktree and restarts fresh. */
  async function startWork(
    t: Task,
    mode: "resume" | "clean" = "resume",
    instruction?: string,
  ): Promise<void> {
    const r = await api<{ ok: boolean; reason?: string }>(
      `/api/tasks/${t.id}/start`,
      JSON_OPTS("POST", { mode, instruction }),
    );
    if (!r.ok) {
      const message = r.reason ?? "could not start work";
      pushToast(message, "error");
      throw new Error(message);
    }
  }

  async function pauseWork(t: Task): Promise<void> {
    const r = await api<{ ok: boolean; reason?: string }>(`/api/tasks/${t.id}/pause`, {
      method: "POST",
    });
    if (!r.ok) {
      const message = r.reason ?? "could not pause work";
      pushToast(message, "error");
      throw new Error(message);
    }
  }

  async function activateHotfix(
    t: Task,
    hotfixTarget: "branch" | "main" = "branch",
  ): Promise<void> {
    const r = await api<{ ok: boolean; reason?: string }>(
      `/api/tasks/${t.id}/hotfix`,
      JSON_OPTS("POST", { hotfixTarget }),
    );
    if (!r.ok) {
      const message = r.reason ?? "could not activate hotfix";
      pushToast(message, "error");
      throw new Error(message);
    }
  }

  /**
   * Review→done close-out. On failure the error is kept on the task (the
   * caller renders it inline below the button) and no global toast is shown;
   * on success any previous inline error is cleared.
   *
   * Dirty-main guard (0204): when the server reports uncommitted files on
   * `main` blocking the merge (and the caller has not opted in via
   * `commitDirty`), the dirty file list is stored per task and a
   * `DirtyMainError` is thrown so the caller can show the confirmation modal.
   */
  async function completeTask(
    t: Task,
    opts: { commitDirty?: boolean } = {},
  ): Promise<DoneResult> {
    const raw = await fetch(`/api/tasks/${t.id}/done`, {
      method: "POST",
      ...(opts.commitDirty
        ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify({ commitDirty: true }) }
        : {}),
    });
    let body: Partial<DoneResult> & { needsCommit?: boolean; dirtyFiles?: string[]; dirtyCheckFailed?: boolean } = {};
    try {
      body = (await raw.json()) as Partial<DoneResult> & { needsCommit?: boolean; dirtyFiles?: string[]; dirtyCheckFailed?: boolean };
    } catch {
      body = {};
    }
    // Dirty-main guard (0204): the server returns 409 + needsCommit when main
    // has uncommitted files and the user has not opted in via commitDirty.
    if (raw.status === 409 && body.needsCommit && Array.isArray(body.dirtyFiles)) {
      // #0211: when the dirty check itself failed (error/timeout) the file list
      // is unknown, so "Commit & continue" would be guessing. Surface the plain
      // actionable error instead of the commit modal.
      if (body.dirtyCheckFailed) {
        const message = body.error ?? "could not verify main is clean before close-out";
        const mapped = describeCloseOutFailure(undefined, message);
        setDoneError(t.id, {
          ...mapped,
          step: doneSteps.value[t.id] ?? mapped.step,
        });
        throw new MoveToDoneError(t.id, message);
      }
      dirtyMain.value = { ...dirtyMain.value, [t.id]: body.dirtyFiles };
      throw new DirtyMainError(t.id, body.dirtyFiles);
    }
    const r = body as DoneResult;
    if (!raw.ok || !r.ok) {
      const message = r.error ?? raw.statusText ?? "could not complete task";
      const mapped = describeCloseOutFailure(undefined, message);
      setDoneError(t.id, {
        ...mapped,
        step: doneSteps.value[t.id] ?? mapped.step,
      });
      throw new MoveToDoneError(t.id, message);
    }
    setDoneError(t.id, null);
    dirtyMain.value = { ...dirtyMain.value, [t.id]: [] };
    return r;
  }

  /**
   * Replace the client's transcript for a task from the server buffer, and
   * hydrate its live stats — the server is the source of truth for elapsed
   * time / stall state, so (re)opening the Agent tab always reflects the
   * CURRENT state even if the tab missed every SSE event while it was closed.
   */
  async function loadOutput(id: string): Promise<void> {
    try {
      const r = await api<{ ok: boolean; lines: AgentOutputEntry[]; stats?: AgentSessionStats }>(
        `/api/tasks/${id}/output`,
      );
      if (r.ok) outputs.value = { ...outputs.value, [id]: r.lines };
      if (r.stats) agentStats.value = { ...agentStats.value, [id]: r.stats };
    } catch {
      /* endpoint unavailable — transcript is best-effort */
    }
  }

  /**
   * Fetch the agent's review of a task. Best-effort: a task with no review
   * (agent disabled, never reviewed) simply has no report to show.
   */
  async function loadReview(id: string): Promise<void> {
    try {
      const r = await api<{
        ok: boolean;
        running: boolean;
        enabled: boolean;
        review: ReviewReport | null;
        lines?: AgentOutputEntry[];
      }>(`/api/tasks/${id}/review`);
      if (!r.ok) return;
      reviews.value = {
        ...reviews.value,
        [id]: {
          running: r.running,
          enabled: r.enabled,
          report: r.review,
          lines: r.lines ?? [],
        },
      };
    } catch {
      /* endpoint unavailable — the review is advisory, never blocking */
    }
  }

  /** The review state for a task, or null when it has not been fetched. */
  const reviewFor = (id: string): ReviewState | null => reviews.value[id] ?? null;

  /**
   * Fetch the CTO board monitor's state (0174): enabled/running flags, the
   * latest report, and the persisted conversation. Best-effort — a disabled or
   * never-run CTO simply yields its empty state.
   */
  async function loadCTO(): Promise<void> {
    try {
      const r = await api<{
        ok: boolean;
        enabled: boolean;
        running: boolean;
        report: { markdown: string; at: string } | null;
        lines?: AgentOutputEntry[];
      }>("/api/cto");
      if (!r.ok) return;
      cto.value = {
        running: r.running,
        enabled: r.enabled,
        report: r.report,
        lines: r.lines ?? [],
      };
    } catch {
      /* endpoint unavailable — the panel falls back to its empty state */
    }
  }

  /** Load diff statistics for a task. Best-effort. */
  async function loadDiffStats(id: string): Promise<void> {
    try {
      const r = await api<{
        ok: boolean;
        stats: { filesChanged: number; additions: number; deletions: number };
        noBranch?: boolean;
        noWorktree?: boolean;
      }>(`/api/tasks/${id}/diff-stats`);
      if (r.ok) {
        diffStats.value = {
          ...diffStats.value,
          [id]: r.stats,
        };
      }
    } catch {
      /* endpoint unavailable — diff stats are nice-to-have */
    }
  }

  /** Get diff stats for a task, or undefined if not yet fetched. */
  const diffStatsFor = (id: string) => diffStats.value[id] ?? undefined;

  /**
   * Load a task's durable usage totals (time/tokens/cost + role breakdown,
   * 0230). Best-effort — a task with no recorded sessions just yields no data.
   */
  async function loadTaskUsage(id: string): Promise<void> {
    try {
      const r = await api<{ ok: boolean; stats: TaskUsageStats | null }>(`/api/tasks/${id}/stats`);
      if (r.ok) taskUsage.value = { ...taskUsage.value, [id]: r.stats ?? null };
    } catch {
      /* endpoint unavailable — usage is nice-to-have */
    }
  }

  /** Usage totals for a task, or null when none have been fetched/recorded. */
  const taskUsageFor = (id: string) => taskUsage.value[id];

  /**
   * Load board-level usage totals (overall + per-role + per-day, 0230).
   * Best-effort — surfaces empty when telemetry is unavailable.
   */
  async function loadBoardUsage(): Promise<void> {
    boardUsageLoading.value = true;
    boardUsageError.value = null;
    try {
      const r = await api<{ ok: boolean; stats: BoardUsageStats }>("/api/stats/board");
      if (r.ok && r.stats) boardUsage.value = r.stats;
      else boardUsageError.value = "The server did not return usage data.";
    } catch (err) {
      boardUsageError.value = err instanceof Error ? err.message : "Unable to load usage data.";
    } finally {
      boardUsageLoading.value = false;
    }
  }

  /** Load the full patch diff for a task. Best-effort. */
  async function loadDiff(id: string): Promise<void> {
    try {
      const r = await api<{
        ok: boolean;
        diff: { patch: string; truncated: boolean };
        noBranch?: boolean;
        noWorktree?: boolean;
      }>(`/api/tasks/${id}/diff`);
      if (r.ok) {
        diffs.value = {
          ...diffs.value,
          [id]: r.diff,
        };
      }
    } catch {
      /* endpoint unavailable — diff is nice-to-have */
    }
  }

  /** Get the full diff for a task, or undefined if not yet fetched. */
  const diffFor = (id: string) => diffs.value[id] ?? undefined;

  /**
   * Merge main into a review-status task's branch (the "rebase onto main"
   * action). Reuses the same sync path the server already runs automatically
   * on entry into review — this just lets the user trigger it again once the
   * branch has drifted further. Refreshes diff stats/patch on success so the
   * Changes tab reflects the merged state.
   */
  async function syncTaskBranch(id: string): Promise<void> {
    const r = await api<{ ok: boolean; conflicts?: string[]; error?: string }>(
      `/api/tasks/${id}/sync`,
      { method: "POST" },
    );
    if (!r.ok) {
      const message = r.conflicts?.length
        ? `Rebase hit conflicts in: ${r.conflicts.join(", ")}`
        : r.error ?? "could not sync with main";
      pushToast(message, "error");
      throw new Error(message);
    }
    pushToast("Synced with main", "success");
    await Promise.all([loadDiffStats(id), loadDiff(id)]);
  }

  /** Drop a retained transcript buffer (e.g. a finished freeform run). */
  function clearOutput(id: string): void {
    if (!outputs.value[id]) return;
    const next = { ...outputs.value };
    delete next[id];
    outputs.value = next;
  }

  async function sendMessage(id: string, text: string): Promise<void> {
    const r = await api<{ ok: boolean; reason?: string }>(
      `/api/tasks/${id}/message`,
      JSON_OPTS("POST", { text }),
    );
    if (!r.ok) {
      const message = r.reason ?? "could not send message";
      pushToast(message, "error");
      throw new Error(message);
    }
  }

  /** Start a fresh review run against the task's current worktree state. */
  async function reviewAgain(id: string): Promise<void> {
    const r = await api<{ ok: boolean; reason?: string }>(`/api/tasks/${id}/review/again`, {
      method: "POST",
    });
    if (!r.ok) {
      const message = r.reason ?? "could not start a fresh review";
      pushToast(message, "error");
      throw new Error(message);
    }
  }

  /**
   * Send a follow-up to the reviewer. Routed to the reviewer's own session,
   * never to the engineer session.
   */
  async function sendReviewMessage(id: string, text: string): Promise<void> {
    const r = await api<{ ok: boolean; reason?: string }>(
      `/api/tasks/${id}/review/message`,
      JSON_OPTS("POST", { text }),
    );
    if (!r.ok) {
      const message = r.reason ?? "could not send message to the reviewer";
      pushToast(message, "error");
      throw new Error(message);
    }
  }

  /** Hydrate the running marker on reload so a running agent is never phantom. */
  async function fetchRunning(): Promise<void> {
    try {
      const r = await api<{ tasks: { id: string; startedAt: string }[] }>("/api/agents/running");
      runningIds.value = r.tasks.map((t) => t.id);
      runningSince.value = Object.fromEntries(r.tasks.map((t) => [t.id, t.startedAt]));
      agentActivityAt.value = {
        ...agentActivityAt.value,
        ...Object.fromEntries(r.tasks.map((t) => [t.id, t.startedAt])),
      };
    } catch {
      /* endpoint unavailable — running state is best-effort */
    }
  }

  /** Hydrate the queued marker on reload — mirrors fetchRunning() above. */
  async function fetchQueued(): Promise<void> {
    try {
      const r = await api<{ tasks: { id: string; queuedAt: string }[] }>("/api/agents/queued");
      queuedIds.value = r.tasks.map((t) => t.id);
    } catch {
      /* endpoint unavailable — queued state is best-effort */
    }
  }

  /** Start a read-only preview of the task's worktree on its own port. */
  async function startPreview(t: Task): Promise<{ port: number; url: string }> {
    return api<{ port: number; url: string }>(`/api/tasks/${t.id}/preview`, {
      method: "POST",
    });
  }

  /** Stop the task's preview. Idempotent — safe to call when none is running. */
  async function stopPreview(t: Task): Promise<void> {
    await api(`/api/tasks/${t.id}/preview/stop`, { method: "POST" });
  }

  async function createTask(form: {
    title: string;
    type: string;
    priority: string;
    area: string;
    assignedTo: string;
    status?: Status;
    body?: string;
  }): Promise<Task> {
    return api<Task>("/api/tasks", JSON_OPTS("POST", form));
  }

  /** Persist one pending screenshot on an existing task (0123). */
  async function uploadScreenshot(
    taskId: string,
    s: PendingScreenshot,
  ): Promise<{ ok: true; attachment: ScreenshotMeta }> {
    const data = s.dataUrl.split(",")[1] ?? "";
    return api<{ ok: true; attachment: ScreenshotMeta }>(
      `/api/tasks/${taskId}/attachments`,
      JSON_OPTS("POST", { name: s.name, mime: s.mime, data }),
    );
  }

  /**
   * Freeform create: routes the explanation through the PM agent server-side.
   * `runId` (optional) tags the streamed `agent.output` events the server
   * emits for this run, so the caller can show the PM agent's output live.
   */
  async function createFreeformTask(
    explanation: string,
    runId?: string,
    overrides?: { agent?: string; cli?: string; model?: string },
  ): Promise<{
    ok: boolean;
    fallback?: boolean;
    fallbackReason?: "no-pm-agent" | "agent-failed";
    reason?: string;
    task: Task;
  }> {
    const body: Record<string, unknown> = { explanation };
    if (runId) body.runId = runId;
    if (overrides?.agent) body.agentOverride = overrides.agent;
    if (overrides?.cli) body.cliOverride = overrides.cli;
    if (overrides?.model) body.modelOverride = overrides.model;
    const r = await api<{
      ok: boolean;
      fallback?: boolean;
      fallbackReason?: "no-pm-agent" | "agent-failed";
      reason?: string;
      task: Task;
    }>("/api/tasks/freeform", JSON_OPTS("POST", body));
    if (!r.ok) {
      const message = r.reason ?? "could not create task";
      pushToast(message, "error");
      throw new Error(message);
    }
    return r;
  }

  async function deleteTask(id: string): Promise<void> {
    await api(`/api/tasks/${id}`, { method: "DELETE" });
  }

  /** Create a document manually with the provided path and content. */
  async function createDocument(form: {
    path: string;
    content: string;
  }): Promise<{ ok: true }> {
    return api<{ ok: true }>("/api/docs/create", JSON_OPTS("POST", form));
  }

  /** Create a document via the PM agent from a freeform description. */
  async function createFreeformDocument(
    description: string,
    runId?: string,
    overrides?: { agent?: string; cli?: string; model?: string },
  ): Promise<{
    ok: boolean;
    fallback?: boolean;
    fallbackReason?: "no-pm-agent" | "agent-failed";
    reason?: string;
    path?: string;
  }> {
    const body: Record<string, unknown> = { description };
    if (runId) body.runId = runId;
    if (overrides?.agent) body.agentOverride = overrides.agent;
    if (overrides?.cli) body.cliOverride = overrides.cli;
    if (overrides?.model) body.modelOverride = overrides.model;
    const r = await api<{
      ok: boolean;
      fallback?: boolean;
      fallbackReason?: "no-pm-agent" | "agent-failed";
      reason?: string;
      path?: string;
    }>("/api/docs/freeform", JSON_OPTS("POST", body));
    if (!r.ok) {
      const message = r.reason ?? "could not create document";
      pushToast(message, "error");
      throw new Error(message);
    }
    return r;
  }

  function onError(err: unknown): void {
    const message = err instanceof Error ? err.message : String(err);
    pushFeed(`<span style="color:var(--red)">error: ${message}</span>`, "#ff6b7d", "error");
    // A failed move-to-done is surfaced inline on the task; a toast for it
    // would duplicate the visible error and detach it from the action. A
    // dirty-main guard (0204) is surfaced by the confirmation modal instead.
    if (err instanceof MoveToDoneError || err instanceof DirtyMainError) return;
    pushToast(message, "error");
  }

  async function init(): Promise<void> {
    try {
      health.value = await api<Health>("/api/health");
      await refresh();
      initRefreshAt = Date.now();
      await fetchRunning();
      await fetchQueued();
      // A persisted notice from before this page load: reconcile it against
      // the running server so a reload that already landed clears it.
      void reconcileVersion();
    } catch {
      /* server not reachable — UI still renders */
    } finally {
      loading.value = false;
    }
    connectSSE();
  }

  return {
    origin,
    loading,
    connected,
    health,
    tasks,
    counts,
    feed,
    eventCount,
    flashId,
    transitionState,
    runningIds,
    queuedIds,
    runningSince,
    agentActivityAt,
    agentExitedAt,
    outputs,
    agentStats,
    doneSteps,
    doneErrors,
    doneErrorFor,
    dirtyMain,
    dirtyMainFor,
    clearDirtyMain,
    reviews,
    sortOrder,
    doneAcked,
    doneAckCount,
    needsAck,
    acknowledge,
    toasts,
    systemStats,
    autoEng,
    refreshAutoEng,
    integration,
    refreshIntegration,
    retryIntegration,
    newVersion,
    restarting,
    pushToast,
    removeToast,
    setSortOrder,
    restartServer,
    clearNewVersion,
    repoName,
    workDir,
    total,
    backlogCount,
    aiTasks,
    humanNeeds,
    fmtDate,
    byStatus,
    statusColor,
    connectSSE,
    refresh,
    fetchTask,
    setStatus,
    patchTask,
    createTask,
    uploadScreenshot,
    createFreeformTask,
    deleteTask,
    createDocument,
    createFreeformDocument,
    isRunning,
    isQueued,
    startWork,
    pauseWork,
    activateHotfix,
    completeTask,
    loadOutput,
    clearOutput,
    loadReview,
    reviewFor,
    cto,
    loadCTO,
    loadDiffStats,
    diffStatsFor,
    taskUsage,
    loadTaskUsage,
    taskUsageFor,
    boardUsage,
    boardUsageLoading,
    boardUsageError,
    loadBoardUsage,
    loadDiff,
    diffFor,
    syncTaskBranch,
    sendMessage,
    reviewAgain,
    sendReviewMessage,
    fetchRunning,
    fetchQueued,
    startPreview,
    stopPreview,
    onError,
    init,
  };
});
