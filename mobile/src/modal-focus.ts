import { nextTick, onBeforeUnmount, watch, type Ref } from "vue";

/** Controls a Tab press can land on inside a modal panel. */
export const FOCUSABLE = [
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[href]",
  '[tabindex]:not([tabindex="-1"])',
  '[contenteditable="true"]',
].join(", ");

/**
 * Keyboard behaviour for a modal dialog (QA #1271).
 *
 * While `active()` is true, focus moves into `panel` and Tab cycles inside it,
 * so the scrim behind it is never reached. Escape calls `onEscape`. When the
 * dialog deactivates or unmounts, focus returns to the control that had it.
 * The caller renders the markup and wires `onKeydown` to the element that
 * contains the panel, so key events from inside it reach the handler.
 */
export function useModalFocus(opts: {
  active: () => boolean;
  panel: Ref<HTMLElement | null>;
  onEscape: () => void;
}) {
  let returnFocusTo: HTMLElement | null = null;

  function leave() {
    returnFocusTo?.focus();
    returnFocusTo = null;
  }

  watch(
    opts.active,
    async (on) => {
      if (on) {
        returnFocusTo =
          document.activeElement instanceof HTMLElement ? document.activeElement : null;
        await nextTick();
        opts.panel.value?.focus();
      } else {
        leave();
      }
    },
    { immediate: true },
  );

  onBeforeUnmount(() => {
    if (opts.active()) leave();
  });

  function onKeydown(ev: KeyboardEvent) {
    if (ev.key === "Escape") {
      ev.preventDefault();
      opts.onEscape();
      return;
    }
    if (ev.key !== "Tab" || !opts.panel.value) return;
    // Tab cycles inside the panel only; the scrim is not part of the tab order.
    const items = Array.from(opts.panel.value.querySelectorAll<HTMLElement>(FOCUSABLE));
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    if (!first || !last) {
      ev.preventDefault();
      return;
    }
    if (ev.shiftKey && (active === first || active === opts.panel.value)) {
      ev.preventDefault();
      last.focus();
    } else if (!ev.shiftKey && active === last) {
      ev.preventDefault();
      first.focus();
    }
  }

  return { onKeydown };
}
