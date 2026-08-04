import { computed, reactive, ref } from "vue";
import { defineStore } from "pinia";
import { api, JSON_OPTS } from "../api";
import { useUiStore } from "./ui";
import type { Counts, Health, RepoEvent, RepoIndex, Task } from "../types";

export interface FeedItem {
  key: number;
  msg: string;
  color: string;
  kind: string;
  time: string;
}

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
  id: "inbox" | "ready" | "active" | "review" | "done";
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

  let feedKey = 0;
  let es: EventSource | null = null;
  let flashTimer: ReturnType<typeof setTimeout> | null = null;

  const repoName = computed(() => (health.value ? health.value.root.split("/").pop() ?? "" : ""));
  const workDir = computed(() => (health.value ? health.value.workDir : "work"));
  const total = computed(() => tasks.value.length);
  const backlogCount = computed(() => tasks.value.filter((t) => t.status !== "draft").length);
  const aiTasks = computed(() => tasks.value.filter((t) => t.assignee === "ai" && t.status !== "done"));

  const fmtDate = (s: string | null): string => (s ? new Date(s).toLocaleString() : "—");

  const byStatus = (s: string): Task[] => tasks.value.filter((t) => t.status === s);

  function recount(): void {
    const c: Counts = { draft: 0, inbox: 0, ready: 0, active: 0, review: 0, done: 0 };
    for (const t of tasks.value) c[t.status] = (c[t.status] ?? 0) + 1;
    Object.assign(counts, c);
  }

  function pushFeed(msg: string, color: string, kind: string): void {
    feed.unshift({ key: feedKey++, msg, color, kind, time: new Date().toTimeString().slice(0, 8) });
    if (feed.length > 30) feed.pop();
  }

  function flash(id: string): void {
    flashId.value = id;
    if (flashTimer) clearTimeout(flashTimer);
    flashTimer = setTimeout(() => {
      if (flashId.value === id) flashId.value = null;
    }, 1200);
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
      if (i >= 0) tasks.value[i] = e.task;
      else tasks.value.push(e.task);
      const ui = useUiStore();
      if (ui.active && ui.active.id === e.task.id) ui.open(e.task);
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
    } else if (e.type === "task.deleted") {
      tasks.value = tasks.value.filter((t) => t.id !== e.id);
      const ui = useUiStore();
      if (ui.active && ui.active.id === e.id) ui.close();
      recount();
      pushFeed(`<b>deleted</b> #${e.id}`, "#ff6b7d", "task.deleted");
    } else if (e.type === "index.rebuilt") {
      void refresh();
    }
  }

  function connectSSE(): void {
    if (es) es.close();
    es = new EventSource(origin + "/api/events");
    es.onopen = () => {
      connected.value = true;
    };
    es.onerror = () => {
      connected.value = false;
    };
    for (const t of ["hello", "index.rebuilt", "task.created", "task.updated", "task.deleted"]) {
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
    tasks.value = idx.tasks;
    Object.assign(counts, idx.counts);
  }

  async function fetchTask(id: string): Promise<Task> {
    return api<Task>(`/api/tasks/${id}`);
  }

  async function setStatus(t: Task, status: string): Promise<void> {
    if (t.status === status) return;
    await api(`/api/tasks/${t.id}`, JSON_OPTS("PATCH", { status }));
  }

  async function createTask(form: {
    title: string;
    type: string;
    priority: string;
    area: string;
    assignedTo: string;
  }): Promise<Task> {
    return api<Task>("/api/tasks", JSON_OPTS("POST", form));
  }

  function onError(err: unknown): void {
    const message = err instanceof Error ? err.message : String(err);
    pushFeed(`<span style="color:var(--red)">error: ${message}</span>`, "#ff6b7d", "error");
  }

  async function init(): Promise<void> {
    try {
      health.value = await api<Health>("/api/health");
      await refresh();
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
    createTask,
    onError,
    init,
  };
});
