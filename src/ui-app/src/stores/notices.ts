import { computed, ref } from "vue";
import { defineStore } from "pinia";
import { api } from "../api";
import type { CloseOutOutcome, CloseOutOutcomeEvent } from "../types";
import { useNotificationsStore } from "./notifications";

/**
 * Non-task notices (#0606): server events a human should know about but that
 * are not a task — release succeeded, release failed, release notes ready.
 *
 * Notices are DERIVED, not accumulated client-side: the only source today is
 * the server's in-memory release run state (`GET /api/release/run`), polled
 * by this store. Deriving from live state means a notice survives a page
 * reload exactly while the underlying event is still current — a server
 * restart wipes the run state, and the notice goes with it, which is the
 * honest reading of "the event is still current". Read/dismissed markers are
 * persisted so the bell badge and the dismiss action also survive the reload.
 *
 * Design so other kinds can be added: a notice's identity is
 * `<kind>:<eventKey>`, built once per source event. A later source (the
 * server-tracked release-notes run, task #0605) needs only an ingest fn that
 * feeds `ingest()` — everything downstream (dedupe, dismiss, badge, bell,
 * panel, popover) is kind-agnostic.
 */

/** The notice kinds the UI knows today. A string, extended per source. */
export type NoticeKind =
  | "releaseNotesReady"
  | "releaseSucceeded"
  | "releaseFailed"
  | "closeOutSucceeded"
  | "closeOutFailed"
  | "closeOutTimedOut"
  | "providerFailure"
  | "silentRun"
  | "spendThreshold"
  | "awaitingVisualCheck"
  | "remoteFallback"
  | "ctoAction";

export interface NoticeItem {
  /** Stable per event: `<kind>:<eventKey>`. Dedupe + dismissed/read keys. */
  id: string;
  kind: NoticeKind;
  /** One line, human — e.g. "Release v0.5.59 finished". */
  title: string;
  /** Supporting sentence or the failure headline; kept short. */
  detail: string;
  /** In-app route of the thing the notice points at, e.g. "/releases". */
  link: string;
  /** ISO time the event happened (the run's finish, not when we first saw it). */
  createdAt: string;
  read: boolean;
  dismissed: boolean;
}

/** Human-friendly labels for each kind, shared with the bell and panels. */
export const NOTICE_KIND_LABELS: Record<NoticeKind, string> = {
  releaseNotesReady: "Release notes ready",
  releaseSucceeded: "Release succeeded",
  releaseFailed: "Release failed",
  closeOutSucceeded: "Move to done landed",
  closeOutFailed: "Move to done failed",
  closeOutTimedOut: "Move to done timed out",
  providerFailure: "Provider error",
  silentRun: "Silent agent run",
  spendThreshold: "Spend alert",
  awaitingVisualCheck: "Awaiting visual check",
  remoteFallback: "Ran locally",
  ctoAction: "CTO safe action",
};

/** Dot / accent color per kind — CSS tokens only (hardcoded-colors guard). */
export const NOTICE_KIND_COLOR: Record<NoticeKind, string> = {
  releaseNotesReady: "var(--violet)",
  releaseSucceeded: "var(--green)",
  releaseFailed: "var(--red)",
  closeOutSucceeded: "var(--green)",
  closeOutFailed: "var(--red)",
  // Amber, not red: a timeout is retryable and its advice differs from a
  // real gate failure.
  closeOutTimedOut: "var(--amber)",
  providerFailure: "var(--red)",
  silentRun: "var(--amber)",
  spendThreshold: "var(--amber)",
  awaitingVisualCheck: "var(--violet)",
  remoteFallback: "var(--amber)",
  ctoAction: "var(--violet)",
};

/** Kinds surfaced as bell notices from `GET /api/attention` (#0687). */
const ATTENTION_NOTICE_KINDS = new Set<NoticeKind>([
  "releaseNotesReady",
  "releaseSucceeded",
  "releaseFailed",
  "closeOutSucceeded",
  "closeOutFailed",
  "closeOutTimedOut",
  "providerFailure",
  "silentRun",
  "spendThreshold",
  "awaitingVisualCheck",
  "remoteFallback",
  "ctoAction",
]);

export interface AttentionFeedItem {
  id: string;
  kind: string;
  message: string;
  detail: string;
  link: string | null;
  at: string;
}

/** Max live notices kept in the feed. Oldest are dropped by createdAt. */
const MAX_NOTICES = 20;
/** Top-bar popover lists this many (the panel shows the same, compact). */
export const NOTICE_FEED_LIMIT = 8;
/** Persisted markers are capped so quota failures can never be caused by us. */
const MAX_MARKERS = 100;

const MARKERS_KEY = "repoos.notices.markers";
const RELEASE_RUN_POLL_MS_IDLE = 15_000;
const RELEASE_RUN_POLL_MS_ACTIVE = 3_000;

/** `v0.5.59` from "v0.5.59 pushed. CI is now building the release…". */
function releaseTagFromMessage(message: string): string | null {
  const m = message.trim().match(/^(v?\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)\b/);
  return m ? m[1] : null;
}

/** First meaningful line of a message, capped for feed/push display. */
function firstLine(message: string, max = 160): string {
  const line = message
    .split("\n")
    .map((l) => l.trim())
    .find(Boolean);
  if (!line) return "";
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
}

/** Notice kind for a close-out outcome. */
const CLOSE_OUT_KIND: Record<CloseOutOutcome, NoticeKind> = {
  succeeded: "closeOutSucceeded",
  failed: "closeOutFailed",
  timedOut: "closeOutTimedOut",
};

/**
 * The budget from a timeout reason, e.g.
 * `close-out timed out after 6m — increase closeOut.timeoutMs …` → "6m".
 * `null` when the reason has no recognizable budget, so the title degrades to
 * plain "timed out" rather than showing a stray fragment.
 */
function budgetFromTimeoutReason(reason: string): string | null {
  const m = reason.match(/timed out after (\S+?)\s*[—–-]/);
  return m ? m[1] : null;
}

/** Title naming the task, e.g. "Move to done: #0633 landed". */
function closeOutTitle(o: CloseOutOutcomeEvent): string {
  const base = `Move to done: #${o.taskId}`;
  if (o.outcome === "succeeded") return `${base} landed`;
  if (o.outcome === "failed") return `${base} failed`;
  const budget = budgetFromTimeoutReason(o.reason);
  return budget ? `${base} timed out after ${budget}` : `${base} timed out`;
}

/** Short detail: the first reason line; success names where the work landed. */
function closeOutDetail(o: CloseOutOutcomeEvent): string {
  if (o.outcome === "succeeded") return "Merged and published to main.";
  return (
    firstLine(o.reason) ||
    (o.outcome === "timedOut"
      ? "Increase closeOut.timeoutMs or retry when the runner is less loaded."
      : "See the task for details.")
  );
}

/** Shape of the server's `GET /api/release/run` payload. */
export interface ReleaseRunState {
  state: "idle" | "running" | "succeeded" | "failed";
  phase: string | null;
  message: string;
  startedAt: string | null;
  updatedAt: string | null;
}

interface PersistedMarker {
  read?: boolean;
  dismissed?: boolean;
}

function readMarkers(): Record<string, PersistedMarker> {
  try {
    const raw = localStorage.getItem(MARKERS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, PersistedMarker>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function persistMarkers(markers: Record<string, PersistedMarker>): void {
  try {
    // FIFO prune — keys arrive in ingest order, insertion-order lost by JSON,
    // so keep the most recent MAX_MARKERS entries by id recency we track here.
    const list = Object.entries(markers);
    if (list.length > MAX_MARKERS) {
      for (const [id] of list.slice(0, list.length - MAX_MARKERS)) delete markers[id];
    }
    localStorage.setItem(MARKERS_KEY, JSON.stringify(markers));
  } catch {
    /* ignore quota / privacy-mode failures */
  }
}

export const useNoticesStore = defineStore("notices", () => {
  // Hydrate markers first so a regenerated notice picks up its persisted
  // read/dismissed state on the very first ingest after a reload.
  const markers = ref<Record<string, PersistedMarker>>(readMarkers());

  const notices = ref<NoticeItem[]>([]);

  const unreadNotices = computed(() => notices.value.filter((n) => !n.dismissed && !n.read));

  /** Non-dismissed notices, newest first — the feed the bell/panel render. */
  const activeNotices = computed(() =>
    notices.value
      .filter((n) => !n.dismissed)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, NOTICE_FEED_LIMIT),
  );

  const dismissedCount = computed(() => notices.value.filter((n) => n.dismissed).length);

  function saveMarkers(): void {
    persistMarkers({ ...markers.value });
  }

  /**
   * Absorb one source event. Deduped by id: the same finished run reported by
   * repeated polls (or produced again after a reload) surfaces exactly once.
   * Freshly created (not previously read) notices also drive the sound/push
   * channels, honouring the per-type and master toggles.
   */
  function ingestReleaseRun(run: ReleaseRunState | null): NoticeItem | null {
    if (!run || (run.state !== "succeeded" && run.state !== "failed")) return null;
    const kind: NoticeKind = run.state === "succeeded" ? "releaseSucceeded" : "releaseFailed";
    const eventKey = run.startedAt ?? run.updatedAt;
    if (!eventKey) return null;
    const id = `${kind}:${eventKey}`;

    const existing = notices.value.find((n) => n.id === id);
    if (existing) {
      // Same event again — refresh text (failures refine the log) but never
      // re-fire the channels or resurrect a dismissed notice.
      existing.detail = firstLine(run.message);
      return null;
    }
    const marker = markers.value[id] ?? {};
    if (marker.dismissed) return null; // still-current event the user dismissed

    const tag = releaseTagFromMessage(run.message);
    const title =
      run.state === "succeeded"
        ? `Release ${tag ?? ""} finished`.replace(/\s+/g, " ").trim()
        : "Release cut failed";
    const detail = firstLine(run.message) || (tag ? `Tag ${tag}` : "See the Releases page.");

    const notice: NoticeItem = {
      id,
      kind,
      title,
      detail,
      link: "/releases",
      createdAt: run.updatedAt ?? eventKey,
      read: !!marker.read,
      dismissed: false,
    };
    notices.value = [notice, ...notices.value].slice(0, MAX_NOTICES);
    // Only a genuinely fresh event rings/pushes — a notice re-created after
    // a page reload with its marker already `read` must stay silent.
    if (!notice.read) void fireChannels(kind, title, detail);
    return notice;
  }

  /**
   * Absorb one durable close-out outcome (#0640). Identity is
   * `<kind>:<taskId>:<finishedAt>` — the server's terminal finish time — so a
   * poll and an SSE delivery of the same run collapse to one notice, the same
   * run re-fetched after a reload stays dismissed/read, and a later retry with
   * a new finish time becomes its own notice.
   */
  function ingestCloseOutOutcome(outcome: CloseOutOutcomeEvent | null): NoticeItem | null {
    if (!outcome || !outcome.taskId || !outcome.finishedAt) return null;
    const kind = CLOSE_OUT_KIND[outcome.outcome];
    if (!kind) return null;
    const id = `${kind}:${outcome.taskId}:${outcome.finishedAt}`;

    const existing = notices.value.find((n) => n.id === id);
    if (existing) return null; // same finished run — already shown
    const marker = markers.value[id] ?? {};
    if (marker.dismissed) return null; // a still-listed event the user dismissed

    const notice: NoticeItem = {
      id,
      kind,
      title: closeOutTitle(outcome),
      detail: closeOutDetail(outcome),
      link: `/work?task=${outcome.taskId}`,
      createdAt: outcome.finishedAt,
      read: !!marker.read,
      dismissed: false,
    };
    notices.value = [notice, ...notices.value].slice(0, MAX_NOTICES);
    // Only a genuinely fresh event rings/pushes; a marker-read notice recreated
    // after a reload stays silent, exactly like release notices.
    if (!notice.read) void fireChannels(kind, notice.title, notice.detail);
    return notice;
  }

  /** Ring/push for a newly created notice, best-effort and never throws. */
  async function fireChannels(kind: NoticeKind, title: string, body: string): Promise<void> {
    try {
      const n = useNotificationsStore();
      await n.notify(kind, title, body);
    } catch {
      /* attention delivery must never break the ingest path */
    }
  }

  function dismiss(id: string): void {
    const notice = notices.value.find((n) => n.id === id);
    if (notice) notice.dismissed = true;
    markers.value[id] = { ...markers.value[id], dismissed: true };
    saveMarkers();
  }

  function dismissAll(): void {
    for (const n of notices.value) {
      n.dismissed = true;
      markers.value[n.id] = { ...markers.value[n.id], dismissed: true };
    }
    saveMarkers();
  }

  function markRead(id: string): void {
    const notice = notices.value.find((n) => n.id === id);
    if (notice) notice.read = true;
    markers.value[id] = { ...markers.value[id], read: true };
    saveMarkers();
  }

  function markAllRead(): void {
    for (const n of notices.value) {
      if (n.dismissed) continue;
      n.read = true;
      markers.value[n.id] = { ...markers.value[n.id], read: true };
    }
    saveMarkers();
  }

  // ── Release-run polling ────────────────────────────────────────────────
  let pollTimer: ReturnType<typeof setTimeout> | null = null;
  let polling = false;
  /** Last fetched run state so the poll delay can speed up while it runs. */
  let lastRunState: ReleaseRunState["state"] = "idle";

  async function pollReleaseRun(): Promise<void> {
    try {
      const run = await api<ReleaseRunState>("/api/release/run");
      lastRunState = run?.state ?? "idle";
      ingestReleaseRun(run);
    } catch {
      // Server restarting or unreachable: keep what we have and try later.
    }
  }

  /**
   * Recover close-out outcomes this tab may have missed while closed or
   * disconnected (#0640). The server's list is the durable source of truth,
   * newest first; ingest oldest-first so the newest lands at the feed head.
   */
  /**
   * Hydrate notice-shaped rows from the unified attention feed (#0687).
   * Task rows (`taskReview`, …) stay in the human-needs panel only.
   */
  function ingestAttentionItem(item: AttentionFeedItem): NoticeItem | null {
    if (!ATTENTION_NOTICE_KINDS.has(item.kind as NoticeKind)) return null;
    const kind = item.kind as NoticeKind;
    const id = item.id;
    const existing = notices.value.find((n) => n.id === id);
    if (existing) return null;
    const marker = markers.value[id] ?? {};
    if (marker.dismissed) return null;
    const notice: NoticeItem = {
      id,
      kind,
      title: item.message,
      detail: item.detail,
      link: item.link ?? "/",
      createdAt: item.at,
      read: !!marker.read,
      dismissed: false,
    };
    notices.value = [notice, ...notices.value].slice(0, MAX_NOTICES);
    if (!notice.read) void fireChannels(kind, notice.title, notice.detail);
    return notice;
  }

  async function pollAttention(): Promise<void> {
    try {
      const res = await api<{ items: AttentionFeedItem[] }>("/api/attention");
      for (const item of [...(res.items ?? [])].reverse()) ingestAttentionItem(item);
    } catch {
      /* server restarting */
    }
  }

  async function pollCloseOutOutcomes(): Promise<void> {
    try {
      const res = await api<{ outcomes: CloseOutOutcomeEvent[] }>("/api/close-out/outcomes");
      for (const outcome of [...(res.outcomes ?? [])].reverse()) ingestCloseOutOutcome(outcome);
    } catch {
      // Server restarting or unreachable: keep what we have and try later.
    }
  }

  function schedule(delay: number): void {
    pollTimer = setTimeout(() => void tick(), delay);
  }

  async function tick(): Promise<void> {
    pollTimer = null;
    if (document.visibilityState === "visible" || lastRunState === "running") {
      // A running release is exactly when the notice matters, so keep the
      // fast cadence even in a hidden tab (release work finishes unattended).
      await pollReleaseRun();
    }
    schedule(lastRunState === "running" ? RELEASE_RUN_POLL_MS_ACTIVE : RELEASE_RUN_POLL_MS_IDLE);
  }

  /**
   * Start the release-run poller once per page load. App.vue calls it after
   * the repo store's init; safe to call repeatedly.
   */
  function start(): void {
    if (polling) return;
    polling = true;
    void pollReleaseRun();
    void pollCloseOutOutcomes();
    void pollAttention();
    schedule(RELEASE_RUN_POLL_MS_IDLE);

    // A tab regaining focus tends to precede finished release/close-out work:
    // poll on focus/visibility so the badge is current without waiting a tick.
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
  }

  function onFocus(): void {
    void pollReleaseRun();
    void pollCloseOutOutcomes();
    void pollAttention();
  }

  function onVisibility(): void {
    if (document.visibilityState === "visible") {
      void pollReleaseRun();
      void pollCloseOutOutcomes();
      void pollAttention();
    }
  }

  function stop(): void {
    if (pollTimer) clearTimeout(pollTimer);
    pollTimer = null;
    polling = false;
    window.removeEventListener("focus", onFocus);
    document.removeEventListener("visibilitychange", onVisibility);
  }

  return {
    notices,
    markers,
    unreadNotices,
    activeNotices,
    dismissedCount,
    start,
    stop,
    pollReleaseRun,
    ingestReleaseRun,
    pollCloseOutOutcomes,
    ingestCloseOutOutcome,
    pollAttention,
    ingestAttentionItem,
    dismiss,
    dismissAll,
    markRead,
    markAllRead,
  };
});

/** Stable test id for the bell trigger (used by shots and tests). */
export const BELL_TRIGGER_TEST_ID = "notice-bell-trigger";
/** Stable test id of the teleported popover root. */
export const BELL_POPOVER_TEST_ID = "notice-bell-popover";
