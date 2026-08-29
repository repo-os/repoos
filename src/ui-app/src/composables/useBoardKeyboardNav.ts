import { onBeforeUnmount, onMounted, ref, watch, type Ref } from "vue";
import type { Task } from "../types";

export interface BoardKeyboardNav {
  highlightId: Ref<string | null>;
  clear: () => void;
}

interface UseBoardKeyboardNavOptions {
  /** Element that contains all the board `.task-card` rows (the board). */
  containerRef: Ref<HTMLElement | null>;
  /** The flat, DOM-ordered list of tasks currently rendered on the board. */
  tasks: Ref<Task[]>;
  /** Opens a task — the same behavior as clicking its card. */
  open: (t: Task) => void;
  /** Opt-in toggle from Settings; when false no keys are handled (req 9). */
  enabled: Ref<boolean>;
  /** True while a task panel/drawer is open — governs the two-stage Esc. */
  panelOpen: Ref<boolean>;
  /** Closes the open task panel, leaving the card highlighted. */
  closePanel: () => void;
}

const EDITABLE_SELECTOR = "input, textarea, [contenteditable]";

/** Interactive controls whose native Enter/Space activation we must not steal:
 *  typing in fields is guarded separately; here we keep a focused button / link
 *  / select working normally rather than hijacking Enter to open the task. */
const INTERACTIVE_SELECTOR =
  "button, a[href], select, [role='button'], [role='link'], [role='menuitem'], [role='option'], summary, input, textarea, [contenteditable]";

/** True when the event target is inside an editable field — typing there must
 *  never drive list navigation (req 6). */
function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return !!target.closest(EDITABLE_SELECTOR);
}

/** True when the event target sits on an interactive control that owns the key
 *  (e.g. a card's action button, a link, a focused select). Returns false for
 *  plain document/body/card focus so j/k/Enter still navigate the list. */
function isInteractiveTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return !!target.closest(INTERACTIVE_SELECTOR);
}

/**
 * Keyboard navigation over the board (#0290), opt-in via Settings (req 9):
 *
 *  j / Down  — move highlight down one task
 *  k / Up    — move highlight up one task
 *  h / Left  — move to the first card of the previous column
 *  l / Right — move to the first card of the next column
 *  Shift+j/k — move a page (chunk) at a time
 *  Enter     — open the highlighted task
 *  Esc       — two-stage: a task panel is open → close it and keep the card
 *              highlighted; otherwise clear the highlight
 *
 *  The reachable rows come from the live DOM (.task-card / .board-col), so the
 *  highlight always stays within what is actually on screen — no virtualization
 *  gap (req 3), and collapsed columns are excluded. The highlighted row is
 *  scrolled into view when it would go off-screen (req 7).
 */
export function useBoardKeyboardNav({
  containerRef,
  tasks,
  open,
  enabled,
  panelOpen,
  closePanel,
}: UseBoardKeyboardNavOptions): BoardKeyboardNav {
  const highlightId = ref<string | null>(null);

  /** Cards reachable by the keyboard: excludes rows hidden by a collapsed
   *  column (`.board-col.collapsed .col-body { display:none }`). */
  function cardEls(): HTMLElement[] {
    const container = containerRef.value;
    if (!container) return [];
    return Array.from(container.querySelectorAll<HTMLElement>(".task-card")).filter(
      (el) => !el.closest(".board-col.collapsed"),
    );
  }

  /** Columns (`.board-col`), in DOM/left-to-right order, excluding collapsed
   *  ones — the horizontal axis for h/l and Left/Right. */
  function columnEls(): HTMLElement[] {
    const container = containerRef.value;
    if (!container) return [];
    return Array.from(container.querySelectorAll<HTMLElement>(".board-col")).filter(
      (el) => !el.classList.contains("collapsed"),
    );
  }

  function currentIndex(): number {
    const els = cardEls();
    return els.findIndex((el) => el.dataset.taskId === highlightId.value);
  }

  function scrollToEl(el: HTMLElement): void {
    el.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }

  function setHighlight(el: HTMLElement | undefined): void {
    if (!el?.dataset.taskId) return;
    highlightId.value = el.dataset.taskId;
    scrollToEl(el);
  }

  /** A "page" step: roughly how many cards fit in the visible container height,
   *  so Shift+j/k moves by a visible chunk rather than an arbitrary number. */
  function pageStep(): number {
    const container = containerRef.value;
    const els = cardEls();
    const anchor = els[currentIndex()] ?? els[0];
    if (!anchor) return 8;
    const cardH = anchor.getBoundingClientRect().height || 120;
    const viewH =
      (container && container.clientHeight) ||
      (typeof window !== "undefined" ? window.innerHeight : 0);
    if (!viewH) return 8;
    return Math.max(1, Math.floor(viewH / cardH));
  }

  function clamp(i: number, len: number): number {
    if (i < 0) return 0;
    if (i >= len) return len - 1;
    return i;
  }

  function moveVertical(delta: number): void {
    const els = cardEls();
    if (els.length === 0) return;
    // No highlight yet: start from the first card when moving down; moving up
    // from nothing stays unhighlighted (nothing above to reach).
    if (highlightId.value === null) {
      if (delta > 0) setHighlight(els[0]);
      return;
    }
    setHighlight(els[clamp(currentIndex() + delta, els.length)]);
  }

  function moveHorizontal(dir: 1 | -1): void {
    const cols = columnEls();
    if (cols.length === 0) return;
    if (highlightId.value === null) {
      // Nothing highlighted: reaching right lands on the first column's first
      // card; reaching left stays out (nothing to the left to show).
      if (dir === 1 && cardEls().length) setHighlight(cardEls()[0]);
      return;
    }
    const cur = cardEls()[currentIndex()];
    if (!cur) return;
    const curCol = cur.closest<HTMLElement>(".board-col");
    const start = curCol ? cols.indexOf(curCol) : -1;
    // Walk to the next/previous non-collapsed column that actually has cards.
    for (let i = start + dir; i >= 0 && i < cols.length; i += dir) {
      const first = cols[i].querySelector<HTMLElement>(".task-card");
      if (first) {
        setHighlight(first);
        return;
      }
    }
    // No reachable column in that direction — stay where we are.
  }

  /** Reconcile the highlight if the highlighted task leaves the list (e.g. a
   *  status change re-renders the board): land on the first remaining card
   *  rather than strand the id on a row that no longer exists. Data-driven so
   *  it is independent of DOM render timing. */
  function reconcile(): void {
    const id = highlightId.value;
    if (id === null) return;
    if (tasks.value.some((task) => task.id === id)) return;
    highlightId.value = tasks.value[0]?.id ?? null;
  }

  let watcher: (() => void) | undefined;
  let enabledWatcher: (() => void) | undefined;

  function onKeydown(e: KeyboardEvent): void {
    if (!enabled.value) return;
    // Never hijack keys when focus is in an editable field (req 6).
    if (isEditableTarget(e.target)) return;
    // Keep interactive controls' native activation (Enter/Space) intact, but
    // still allow Escape so the two-stage panel-close/clear still works.
    if (e.key !== "Escape" && isInteractiveTarget(e.target)) return;

    // A task panel is open: only Esc is meaningful here — it closes the panel
    // and keeps the card highlighted (two-stage, req 5 / review round 2).
    if (panelOpen.value) {
      if (e.key === "Escape") {
        e.preventDefault();
        closePanel();
      }
      return;
    }

    switch (e.key) {
      case "j":
      case "ArrowDown":
        e.preventDefault();
        moveVertical(e.shiftKey ? pageStep() : 1);
        break;
      case "k":
      case "ArrowUp":
        e.preventDefault();
        moveVertical(e.shiftKey ? -pageStep() : -1);
        break;
      case "h":
      case "ArrowLeft":
        e.preventDefault();
        moveHorizontal(-1);
        break;
      case "l":
      case "ArrowRight":
        e.preventDefault();
        moveHorizontal(1);
        break;
      case "Enter": {
        const id = highlightId.value;
        if (!id) break;
        e.preventDefault();
        const t = tasks.value.find((task) => task.id === id);
        if (t) open(t);
        break;
      }
      case "Escape":
        if (highlightId.value !== null) {
          e.preventDefault();
          highlightId.value = null;
        }
        break;
    }
  }

  onMounted(() => {
    window.addEventListener("keydown", onKeydown);
    // Reconcile when the rendered list changes (a status move re-renders the
    // board): never strand the highlight on a row that no longer exists.
    watcher = watch(
      () => tasks.value.map((t) => t.id).join(","),
      () => reconcile(),
    );
    // Turning the feature off clears any leftover highlight.
    enabledWatcher = watch(enabled, (on) => {
      if (!on) highlightId.value = null;
    });
  });
  onBeforeUnmount(() => {
    window.removeEventListener("keydown", onKeydown);
    watcher?.();
    enabledWatcher?.();
  });

  return {
    highlightId,
    clear: () => (highlightId.value = null),
  };
}
