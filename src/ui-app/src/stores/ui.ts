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

/** A screenshot picked in the New task panel, held in memory until the task exists. */
export interface PendingScreenshot {
  name: string;
  mime: string;
  /** base64 data URL of the image, used for the in-panel thumbnail. */
  dataUrl: string;
  size: number;
}

/** The panel only ever holds the latest N, so a huge drop can't pin memory. */
const MAX_PENDING_SCREENSHOTS = 12;

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

  const pendingScreenshots = reactive<PendingScreenshot[]>([]);

  function openNewTask(): void {
    isNew.value = true;
    active.value = null;
    nt.title = "";
    nt.area = "web";
    nt.priority = "p2";
    nt.type = "feature";
    nt.assignedTo = "";
    clearScreenshots();
  }

  /** Read each image file into memory as a data URL and queue it for the new task. */
  function addScreenshots(files: File[]): void {
    for (const file of files) {
      if (!/^image\/(png|jpe?g|gif|webp|avif|bmp)$/i.test(file.type)) continue;
      if (pendingScreenshots.length >= MAX_PENDING_SCREENSHOTS) break;
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result !== "string") return;
        pendingScreenshots.push({
          name: file.name,
          mime: file.type,
          dataUrl: reader.result,
          size: file.size,
        });
      };
      reader.readAsDataURL(file);
    }
  }

  function removeScreenshot(index: number): void {
    pendingScreenshots.splice(index, 1);
  }

  function clearScreenshots(): void {
    pendingScreenshots.splice(0);
  }

  /** Tasks the agent has already started on default straight to the live action. */
  function defaultTabFor(t: Task): "details" | "agent" {
    return t.status === "active" || t.status === "review" ? "agent" : "details";
  }

  function open(t: Task): void {
    isNew.value = false;
    active.value = t;
    activeTab.value = defaultTabFor(t);
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
    pendingScreenshots,
    addScreenshots,
    removeScreenshot,
    clearScreenshots,
    openNewTask,
    open,
    openTask,
    close,
    openTunnel,
    closeTunnel,
    startResize,
  };
});
