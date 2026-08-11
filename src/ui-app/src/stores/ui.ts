import { reactive, ref } from "vue";
import { defineStore } from "pinia";
import { api } from "../api";
import type { Task } from "../types";

export interface NewTaskForm {
  title: string;
  type: string;
  priority: string;
  area: string;
  assignedTo: string;
}

export const useUiStore = defineStore("ui", () => {
  /** Currently open drawer task, or null when closed. */
  const active = ref<Task | null>(null);
  /** True when the drawer shows the new-task form instead of a task. */
  const isNew = ref(false);
  const saving = ref(false);
  const drawerWidth = ref(680);
  /** Cloudflare setup drawer is independent of the task drawer. */
  const tunnelOpen = ref(false);
  /** Active drawer tab: task details, or the agent session view. */
  const activeTab = ref<"details" | "agent">("details");

  const nt = reactive<NewTaskForm>({
    title: "",
    type: "feature",
    priority: "p2",
    area: "web",
    assignedTo: "",
  });

  function openNewTask(): void {
    isNew.value = true;
    active.value = null;
    nt.title = "";
    nt.area = "web";
    nt.priority = "p2";
    nt.type = "feature";
    nt.assignedTo = "";
  }

  function open(t: Task): void {
    isNew.value = false;
    active.value = t;
    activeTab.value = "details";
  }

  /** Open a task drawer, refreshing the task from the API first (fallback to local). */
  async function openTask(t: Task): Promise<void> {
    try {
      open(await api<Task>(`/api/tasks/${t.id}`));
    } catch {
      open(t);
    }
  }

  function close(): void {
    active.value = null;
    isNew.value = false;
    activeTab.value = "details";
  }

  function openTunnel(): void {
    tunnelOpen.value = true;
  }

  function closeTunnel(): void {
    tunnelOpen.value = false;
  }

  function startResize(e: MouseEvent): void {
    const startX = e.clientX;
    const startW = drawerWidth.value;
    const onMove = (ev: MouseEvent): void => {
      drawerWidth.value = Math.max(
        360,
        Math.min(window.innerWidth - 40, startW + startX - ev.clientX),
      );
    };
    const onUp = (): void => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }

  return {
    active,
    isNew,
    saving,
    drawerWidth,
    tunnelOpen,
    activeTab,
    nt,
    openNewTask,
    open,
    openTask,
    close,
    openTunnel,
    closeTunnel,
    startResize,
  };
});
