import { computed, reactive, ref } from "vue";
import { defineStore } from "pinia";
import { api, JSON_OPTS } from "../api";
import { useUiStore } from "./ui";
import type {
  AgentOutputEntry,
  AgentSessionStats,
  Counts,
  Health,
  RepoEvent,
  RepoIndex,
  ReviewReport,
  ReviewState,
  Status,
  SystemStats,
  Task,
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

/** Cap on retained transcript lines per task in the client. */
const OUTPUT_MAX_LINES = 2000;

/**
 * Prefix on the SSE id used to stream a task's reviewer conversation. The
 * engineer session streams under the plain task id; reviewer output streams
 * under `review:<taskId>` so the two conversations never mix (0110).
 */
const REVIEW_SESSION_PREFIX = "review:";

export const STATUS_COLORS: Record<string, string> = {
  draft: "#3a4055",
  inbox: "#566081",
  ready: "#39e0ff",
  active: "#9d7bff",
  review: "#ffb454",
  done: "#4ef0a8",
};

export const statusColor = (s: string): string => STATUS_COLORS[s] ?? "#566081";

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
  { value: "current", label: "Current order" },
];

const SORT_ORDER_KEY = "repoos.board.sortOrder";

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
  /** When each task's agent last exited (ms timestamp), for the "paused" grace period. */
  const agentExitedAt = ref<Record<string, number>>({});
  const outputs = ref<Record<string, AgentOutputEntry[]>>({});
  /** Live run telemetry per task (time/tokens/cost/stalled), keyed by task id. */
  const agentStats = ref<Record<string, AgentSessionStats>>({});
  /** Live step of the review→done close-out, keyed by task id. */
  const doneSteps = ref<Record<string, string>>({});
  /** The review agent's report per task, hydrated on demand + via SSE. */
  const reviews = ref<Record<string, ReviewState>>({});
  /** Live system resource stats from the SSE stream. */
  const systemStats = ref<SystemStats | null>(null);
  const sortOrder = ref<SortOrder>(readSortOrder());
  /** Dismissible toasts stacked at the top-right. */
  const toasts = ref<ToastItem[]>([]);

  let feedKey = 0;
  let toastId = 0;
  let es: EventSource | null = null;
  let flashTimer: ReturnType<typeof setTimeout> | null = null;
  let transitionTimer: ReturnType<typeof setTimeout> | null = null;

  const repoName = computed(() => (health.value ? health.value.root.split("/").pop() ?? "" : ""));
  const workDir = computed(() => (health.value ? health.value.workDir : "work"));
  const total = computed(() => tasks.value.length);
  const backlogCount = computed(() => tasks.value.filter((t) => t.status !== "draft").length);
  const aiTasks = computed(() => tasks.value.filter((t) => t.assignee === "ai" && t.status !== "done"));

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

  function applyEvent(e: RepoEvent): void {
    eventCount.value++;
    if (e.type === "hello") return;
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
      const merged = { ...e.task, preview: e.task.preview ?? before?.preview ?? null };
      if (i >= 0) tasks.value[i] = merged;
      else tasks.value.push(merged);
      const ui = useUiStore();
      if (ui.active && ui.active.id === e.task.id) ui.open(merged);
      recount();
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
    } else if (e.type === "task.deleted") {
      tasks.value = tasks.value.filter((t) => t.id !== e.id);
      const ui = useUiStore();
      if (ui.active && ui.active.id === e.id) ui.close();
      recount();
      pushFeed(`<b>deleted</b> #${e.id}`, "#ff6b7d", "task.deleted");
    } else if (e.type === "agent.running") {
      if (!runningIds.value.includes(e.id)) {
        runningIds.value = [...runningIds.value, e.id];
      }
      pushFeed(`<b>agent running</b> on #${e.id}`, "#9d7bff", "agent.running");
    } else if (e.type === "agent.output") {
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
    } else if (e.type === "agent.stats") {
      agentStats.value = { ...agentStats.value, [e.id]: e.stats };
    } else if (e.type === "agent.exited") {
      runningIds.value = runningIds.value.filter((x) => x !== e.id);
      agentExitedAt.value = { ...agentExitedAt.value, [e.id]: Date.now() };
      pushFeed(`<b>agent stopped</b> on #${e.id}`, "#ffb454", "agent.exited");
      if (outputs.value[e.id]) {
        outputs.value = {
          ...outputs.value,
          [e.id]: [...outputs.value[e.id], { s: "sys", d: "— agent stopped —" }],
        };
      }
    } else if (e.type === "task.progress") {
      doneSteps.value = { ...doneSteps.value, [e.id]: e.step };
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
    } else if (e.type === "index.rebuilt") {
      void refresh();
    } else if (e.type === "system.stats") {
      systemStats.value = e.stats;
    }
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
      void refresh().catch(() => {
        /* connection state already reflects the successful SSE open */
      });
    };
    es.onerror = () => {
      connected.value = false;
    };
    for (const t of ["hello", "index.rebuilt", "task.created", "task.updated", "task.deleted", "task.progress", "task.corrected", "preview", "review", "agent.running", "agent.exited", "agent.output", "agent.stats", "system.stats"]) {
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
    const idx = await api<RepoIndex>("/api/index");
    // /api/index has no preview state; keep any live previews across rebuilds.
    const previews = new Map(tasks.value.map((t) => [t.id, t.preview] as const));
    tasks.value = idx.tasks.map((t) => ({
      ...t,
      preview: t.preview ?? previews.get(t.id) ?? null,
    }));
    // Index hydration is the recovery path after reconnecting while a review
    // was running. Reports remain lazy-loaded by the drawer, but cards get
    // their live activity state immediately.
    const hydratedReviews: Record<string, ReviewState> = {};
    for (const task of idx.tasks) {
      if (!task.automaticReview) continue;
      hydratedReviews[task.id] = {
        running: task.automaticReview.running,
        enabled: task.automaticReview.enabled,
        report: reviews.value[task.id]?.report ?? null,
        lines: reviews.value[task.id]?.lines ?? [],
      };
    }
    reviews.value = { ...reviews.value, ...hydratedReviews };
    Object.assign(counts, idx.counts);
  }

  async function fetchTask(id: string): Promise<Task> {
    return api<Task>(`/api/tasks/${id}`);
  }

  async function patchTask(id: string, fields: Record<string, unknown>): Promise<Task> {
    return api<Task>(`/api/tasks/${id}`, JSON_OPTS("PATCH", fields));
  }

  async function setStatus(t: Task, status: string): Promise<void> {
    if (t.status === status) return;
    try {
      await patchTask(t.id, { status });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      pushToast(message, "error");
      throw err;
    }
  }

  const isRunning = (id: string): boolean => runningIds.value.includes(id);

  /** Start an agent turn; `clean` discards the dirty worktree and restarts fresh. */
  async function startWork(t: Task, mode: "resume" | "clean" = "resume"): Promise<void> {
    const r = await api<{ ok: boolean; reason?: string }>(
      `/api/tasks/${t.id}/start`,
      JSON_OPTS("POST", { mode }),
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

  /** Summary returned by the review→done close-out. */
  async function completeTask(t: Task): Promise<DoneResult> {
    const r = await api<DoneResult>(`/api/tasks/${t.id}/done`, {
      method: "POST",
    });
    if (!r.ok) {
      const message = r.error ?? "could not complete task";
      pushToast(message, "error");
      throw new Error(message);
    }
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
      const r = await api<{ tasks: { id: string }[] }>("/api/agents/running");
      runningIds.value = r.tasks.map((t) => t.id);
    } catch {
      /* endpoint unavailable — running state is best-effort */
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

  function onError(err: unknown): void {
    const message = err instanceof Error ? err.message : String(err);
    pushFeed(`<span style="color:var(--red)">error: ${message}</span>`, "#ff6b7d", "error");
    pushToast(message, "error");
  }

  async function init(): Promise<void> {
    try {
      health.value = await api<Health>("/api/health");
      await refresh();
      await fetchRunning();
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
    agentExitedAt,
    outputs,
    agentStats,
    doneSteps,
    reviews,
    sortOrder,
    toasts,
    systemStats,
    pushToast,
    removeToast,
    setSortOrder,
    repoName,
    workDir,
    total,
    backlogCount,
    aiTasks,
    fmtDate,
    byStatus,
    statusColor,
    connectSSE,
    refresh,
    fetchTask,
    setStatus,
    patchTask,
    createTask,
    createFreeformTask,
    deleteTask,
    isRunning,
    startWork,
    pauseWork,
    completeTask,
    loadOutput,
    clearOutput,
    loadReview,
    reviewFor,
    sendMessage,
    reviewAgain,
    sendReviewMessage,
    fetchRunning,
    startPreview,
    stopPreview,
    onError,
    init,
  };
});
