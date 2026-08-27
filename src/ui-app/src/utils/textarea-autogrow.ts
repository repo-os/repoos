/**
 * Grow a chat-compose `<textarea>` to fit its content, up to `maxPx`.
 *
 * Resets to `auto` first so the element can also *shrink* when text is
 * deleted (or cleared after send), then pins the height to `scrollHeight`
 * clamped at `maxPx`. The stylesheet keeps `min-height` and `overflow-y`,
 * so an empty field never collapses below one row and content past `maxPx`
 * scrolls instead of clipping.
 *
 * Call it from the field's `@input` handler and from a `watch` on the bound
 * value (the latter covers programmatic changes — post-send reset, a
 * restored draft — which do not emit an `input` event).
 */
export function autoGrowTextarea(el: HTMLTextAreaElement | null, maxPx = 120): void {
  if (!el) return;
  el.style.height = "auto";
  el.style.height = `${Math.min(el.scrollHeight, maxPx)}px`;
}
