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

/** Single-task-list keyboard navigation over the board (req 1–8 for #0290).
 *
 *  j / ArrowDown  — move highlight down one task
 *  k / ArrowUp    — move highlight up one task
 *  Shift+j/k      — move a page (chunk) at a time
 *  Enter          — open the highlighted task
 *  Esc            — clear the highlight
 *
 *  The highlight index is derived from the live DOM (.task-card rows), so it
 *  always stays within what is actually on screen — there is no virtualization
 *  gap to drift into (req 3). The highlighted row is scrolled into view when it
 *  would go off-screen (req 7).
 */
export function useBoardKeyboardNav({
  containerRef,
  tasks,
  open,
}: UseBoardKeyboardNavOptions): BoardKeyboardNav {
  const highlightId = ref<string | null>(null);

  function cardEls(): HTMLElement[] {
    const container = containerRef.value;
    if (!container) return [];
    // Exclude cards inside collapsed columns: the board hides those rows
    // (.board-col.collapsed .col-body { display:none }), and the highlight must
    // never land on (or be scrolled to) an invisible card (req 3).
    return Array.from(container.querySelectorAll<HTMLElement>(".task-card")).filter(
      (el) => !el.closest(".board-col.collapsed"),
    );
  }

  function currentIndex(): number {
    const els = cardEls();
    return els.findIndex((el) => el.dataset.taskId === highlightId.value);
  }

  function scrollToEl(el: HTMLElement): void {
    el.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }

  /** A "page" step: roughly how many cards fit in the visible container height,
   *  so Shift+j/k moves by a visible chunk rather than an arbitrary number. */
  function pageStep(): number {
    const container = containerRef.value;
    const els = cardEls();
    const anchor = els[currentIndex()] ?? els[0];
    if (!anchor) return 8;
    const cardH = anchor.getBoundingClientRect().height || 120;
    const viewH = (container && container.clientHeight) || (typeof window !== "undefined" ? window.innerHeight : 0);
    if (!viewH) return 8;
    return Math.max(1, Math.floor(viewH / cardH));
  }

  function clamp(i: number, len: number): number {
    if (i < 0) return 0;
    if (i >= len) return len - 1;
    return i;
  }

  function move(delta: number): void {
    const els = cardEls();
    if (els.length === 0) return;
    // No highlight yet: start from the first card when moving down; moving up
    // from nothing stays unhighlighted (nothing above to reach).
    if (highlightId.value === null) {
      if (delta > 0) {
        const first = els[0].dataset.taskId ?? null;
        highlightId.value = first;
        if (first) scrollToEl(els[0]);
      }
      return;
    }
    const next = clamp(currentIndex() + delta, els.length);
    const el = els[next];
    if (el?.dataset.taskId) {
      highlightId.value = el.dataset.taskId;
      scrollToEl(el);
    }
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

  function onKeydown(e: KeyboardEvent): void {
    // Never hijack keys when focus is on an editable field (req 6) or on an
    // interactive control that owns the key (a card action button, link, or
    // select): pressing Enter there must perform that control's native action,
    // not open a task.
    if (isEditableTarget(e.target) || isInteractiveTarget(e.target)) return;

    switch (e.key) {
      case "j":
      case "ArrowDown":
        e.preventDefault();
        move(e.shiftKey ? pageStep() : 1);
        break;
      case "k":
      case "ArrowUp":
        e.preventDefault();
        move(e.shiftKey ? -pageStep() : -1);
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
  });
  onBeforeUnmount(() => {
    window.removeEventListener("keydown", onKeydown);
    watcher?.();
  });

  return {
    highlightId,
    clear: () => (highlightId.value = null),
  };
}
