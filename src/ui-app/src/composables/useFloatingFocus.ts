import { onBeforeUnmount, type Ref } from "vue";

/**
 * Keep keyboard focus inside a body-teleported floating layer (#0638).
 *
 * While a modal dialog is open, radix-vue's FocusScope listens for `focusin`
 * and `focusout` on `document` (bubble phase) and refocuses the dialog the
 * moment focus lands outside it — which is exactly where a teleported
 * floating layer and its inputs live.
 *
 * Stopping `focusin` alone is not enough in a real browser: a pointer-driven
 * focus shift fires `focusout` on the *previously focused element* first,
 * which bubbles through the dialog's own DOM, and the trap refocuses the
 * dialog during that dispatch — the browser then cancels the pending
 * transfer, so the input never receives the caret no matter what the
 * teleported panel does to its own events. (jsdom hides this: its
 * programmatic `focus()` completes after the dispatch, so tests see focus
 * stick even when a real click would not.)
 *
 * Capture-phase listeners on `document` run before the trap's bubble
 * listeners for both events, so stopping the event there hides the whole
 * transition from the trap:
 *
 * - `focusin` whose target is inside the layer — focus entering the layer
 *   (by click, Tab, or a programmatic `.focus()`).
 * - `focusout` whose relatedTarget is inside the layer — focus moving into
 *   the layer. The event fires on wherever focus is leaving (typically the
 *   dialog itself) and bubbles through the dialog's own DOM, which is why it
 *   must be intercepted at `document` capture; nothing the teleported panel
 *   does to its own events can reach it.
 *
 * Transitions out of the layer are left alone: their destination is the
 * trap's own scope, which handles them correctly (and keeps its
 * last-focused-element tracking current), and the layer's own controls keep
 * receiving their blur events. Intra-layer moves (Tab between two controls of
 * the layer) are still hidden — the trap would yank on those too, so their
 * `focusout` is stopped, which suppresses blur handlers *inside* the layer
 * for that transition. No current layer control listens for `focusout`.
 * The layer root is usually under a `v-if`, so while the layer is closed the
 * ref is null and nothing stops.
 */
export function useFloatingFocus(layer: Ref<HTMLElement | null>): void {
  const inLayer = (node: EventTarget | null): boolean =>
    node instanceof Element && layer.value !== null && layer.value.contains(node);

  const onFocusIn = (event: FocusEvent): void => {
    if (inLayer(event.target)) event.stopPropagation();
  };

  const onFocusOut = (event: FocusEvent): void => {
    if (inLayer(event.relatedTarget)) event.stopPropagation();
  };

  document.addEventListener("focusin", onFocusIn, true);
  document.addEventListener("focusout", onFocusOut, true);
  onBeforeUnmount(() => {
    document.removeEventListener("focusin", onFocusIn, true);
    document.removeEventListener("focusout", onFocusOut, true);
  });
}
