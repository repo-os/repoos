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

export interface NewDocForm {
  path: string;
  content: string;
}

export interface NewSkillForm {
  name: string;
  description: string;
  content: string;
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
  /** Active drawer tab: task details, the agent session, agent review, or PM. */
  const activeTab = ref<"details" | "agent" | "review" | "pm" | "changes" | "tokens" | "debug">(
    "details",
  );
  /** True when showing the new-document panel instead of a task. */
  const isNewDoc = ref(false);
  /** True when showing the new-skill panel instead of a task. */
  const isNewSkill = ref(false);
  const isNewInput = ref(false);
  const inputText = ref("");

  const GLIDE_PERSIST_KEY = "repoos.board.glide";
  /** Off by default; when on, cards glide between columns on a status change
   *  (FLIP animation). A purely client-local UI preference, so toggling it
   *  takes effect immediately with no page reload. */
  const glideAnimations = ref<boolean>(
    (() => {
      try {
        return localStorage.getItem(GLIDE_PERSIST_KEY) === "1";
      } catch {
        return false;
      }
    })(),
  );

  function setGlideAnimations(value: boolean): void {
    glideAnimations.value = value;
    try {
      localStorage.setItem(GLIDE_PERSIST_KEY, value ? "1" : "0");
    } catch {
      /* ignore quota / privacy-mode failures */
    }
  }

  const KEYBOARD_NAV_PERSIST_KEY = "repoos.board.keyboardNav";
  /** Keyboard navigation over the board (j/k/h/l, arrows, Enter, Esc). Off by
   *  default — an opt-in power-user setting (see #0290). A purely client-local
   *  UI preference, so toggling it takes effect immediately. */
  const keyboardNavEnabled = ref<boolean>(
    (() => {
      try {
        return localStorage.getItem(KEYBOARD_NAV_PERSIST_KEY) === "1";
      } catch {
        return false;
      }
    })(),
  );

  function setKeyboardNavEnabled(value: boolean): void {
    keyboardNavEnabled.value = value;
    try {
      localStorage.setItem(KEYBOARD_NAV_PERSIST_KEY, value ? "1" : "0");
    } catch {
      /* ignore quota / privacy-mode failures */
    }
  }

  const INTEGRATION_BAR_PERSIST_KEY = "repoos.integrationBar.collapsed";
  /** True when the bottom integration bar is folded to a thin strip
   *  (persisted across reloads). Shared state — the task drawer expands it
   *  when a task moves to done, so both must read/write the same ref. */
  const integrationBarCollapsed = ref<boolean>(
    (() => {
      try {
        return localStorage.getItem(INTEGRATION_BAR_PERSIST_KEY) === "1";
      } catch {
        return false;
      }
    })(),
  );

  function setIntegrationBarCollapsed(value: boolean): void {
    integrationBarCollapsed.value = value;
    try {
      localStorage.setItem(INTEGRATION_BAR_PERSIST_KEY, value ? "1" : "0");
    } catch {
      /* ignore quota / privacy-mode failures */
    }
  }

  /** Move to done (or any other close-out kickoff): expand the integration
   *  bar to full size so its live pipeline progress is immediately visible. */
  function expandIntegrationBar(): void {
    setIntegrationBarCollapsed(false);
  }

  const nt = reactive<NewTaskForm>({
    title: "",
    type: "feature",
    priority: "p2",
    area: "web",
    assignedTo: "",
  });

  const nd = reactive<NewDocForm>({
    path: "",
    content: "",
  });

  const ns = reactive<NewSkillForm>({
    name: "",
    description: "",
    content: "",
  });

  const pendingScreenshots = reactive<PendingScreenshot[]>([]);

  /** Open the new-task drawer. `assignedTo` presets the assignee (e.g. "human"). */
  function openNewTask(assignedTo = ""): void {
    isNew.value = true;
    active.value = null;
    isNewDoc.value = false;
    isNewSkill.value = false;
    isNewInput.value = false;
    nt.title = "";
    nt.area = "web";
    nt.priority = "p2";
    nt.type = "feature";
    nt.assignedTo = assignedTo;
    clearScreenshots();
  }

  function openNewDoc(): void {
    isNewDoc.value = true;
    isNewSkill.value = false;
    active.value = null;
    isNew.value = false;
    isNewInput.value = false;
    nd.path = "";
    nd.content = "";
  }

  function openNewInput(): void {
    isNewInput.value = true; isNew.value = false; isNewDoc.value = false; isNewSkill.value = false; active.value = null; inputText.value = ""; clearScreenshots();
  }

  function openNewSkill(): void {
    isNewSkill.value = true;
    isNewDoc.value = false;
    active.value = null;
    isNew.value = false;
    ns.name = "";
    ns.description = "";
    ns.content = "";
  }

  /** Read each image file into memory as a data URL and queue it for the new task. */
  function addScreenshots(files: File[]): void {
    for (const file of files) {
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
  function defaultTabFor(t: Task): "details" | "agent" | "review" | "pm" {
    if (t.status === "review") return "review";
    return t.status === "active" ? "agent" : "details";
  }

  function open(t: Task): void {
    isNew.value = false;
    active.value = t;
    activeTab.value = defaultTabFor(t);
  }

  /**
   * Refresh the drawer's task copy in place (SSE task.updated / preview
   * events) WITHOUT re-deriving the active tab. Tab selection is a
   * user-driven decision made at open time; re-applying the status default
   * here bounced the user off the pm/dev/review tab whenever a background
   * update landed — e.g. the debounced agent+model override save (0312).
   */
  function syncActive(t: Task): void {
    if (!active.value || active.value.id !== t.id) return;
    active.value = t;
    isNew.value = false;
  }

  /**
   * Open a task drawer immediately with the already-loaded task (the board's
   * own list), then refresh from the API in the background — the drawer's
   * visibility must never wait on a network round trip, since a burst of
   * other requests in flight (e.g. every card's diff-stats fetch on a board
   * reload) can queue behind it.
   */
  async function openTask(t: Task): Promise<void> {
    open(t);
    try {
      const fresh = await api<Task>(`/api/tasks/${t.id}`);
      // The user may have closed the drawer or opened a different task while
      // this was in flight — only apply the refresh if it's still relevant.
      if (active.value?.id === t.id) active.value = fresh;
    } catch {
      /* keep the locally-known task — refresh is best-effort */
    }
  }

  function close(): void {
    active.value = null;
    isNew.value = false;
    isNewDoc.value = false;
    isNewSkill.value = false;
    isNewInput.value = false;
    activeTab.value = "details";
  }

  function openTunnel(): void {
    tunnelOpen.value = true;
  }

  function closeTunnel(): void {
    tunnelOpen.value = false;
  }

  /** Remote validation runner setup drawer — independent of every other drawer. */
  const remoteValidationOpen = ref(false);
  function openRemoteValidation(): void {
    remoteValidationOpen.value = true;
  }
  function closeRemoteValidation(): void {
    remoteValidationOpen.value = false;
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
    isNewDoc,
    isNewSkill,
    isNewInput,
    inputText,
    saving,
    drawerWidth,
    tunnelOpen,
    activeTab,
    nt,
    nd,
    ns,
    pendingScreenshots,
    addScreenshots,
    removeScreenshot,
    clearScreenshots,
    openNewTask,
    openNewDoc,
    openNewSkill,
    openNewInput,
    open,
    syncActive,
    openTask,
    close,
    openTunnel,
    closeTunnel,
    remoteValidationOpen,
    openRemoteValidation,
    closeRemoteValidation,
    startResize,
    integrationBarCollapsed,
    setIntegrationBarCollapsed,
    expandIntegrationBar,
    glideAnimations,
    setGlideAnimations,
    keyboardNavEnabled,
    setKeyboardNavEnabled,
  };
});
