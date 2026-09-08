/**
 * Copy text to the clipboard, with a fallback for insecure origins.
 *
 * `navigator.clipboard` is only defined on secure contexts — HTTPS, or
 * `http://localhost`. RepoOS is very often reached over a plain-HTTP LAN or
 * Tailscale address (e.g. `http://100.115.161.63:7281`), where
 * `navigator.clipboard` is `undefined` and the async call throws. Without a
 * fallback the copy buttons silently do nothing.
 *
 * Returns whether the copy succeeded so callers can surface a failure instead
 * of pretending it worked.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Secure-context API present but refused (permissions, focus) — fall back.
  }
  return legacyCopy(text);
}

/**
 * `document.execCommand("copy")` via a throwaway textarea.
 *
 * Subtleties that make or break this on plain-HTTP origins (where it's the only
 * option): the element must be genuinely selectable — `opacity: 0` and
 * `display: none` both make Chrome quietly no-op the copy while `execCommand`
 * still returns `true` — so it's placed off-screen at full opacity instead. We
 * also `focus()` before selecting (required on mobile Safari), pin
 * `setSelectionRange` across the whole value, and restore both the caret focus
 * and any range the user had selected so the copy is invisible to them.
 */
function legacyCopy(text: string): boolean {
  try {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const priorRange =
      (document.getSelection()?.rangeCount ?? 0) > 0
        ? document.getSelection()!.getRangeAt(0)
        : null;

    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.top = "0";
    ta.style.left = "0";
    ta.style.width = "1px";
    ta.style.height = "1px";
    ta.style.padding = "0";
    ta.style.border = "0";
    ta.style.outline = "0";
    ta.style.boxShadow = "none";
    ta.style.background = "transparent";
    document.body.appendChild(ta);

    ta.focus({ preventScroll: true });
    ta.select();
    ta.setSelectionRange(0, text.length);

    let ok = false;
    try {
      ok = document.execCommand("copy");
    } finally {
      document.body.removeChild(ta);
      const sel = document.getSelection();
      if (priorRange && sel) {
        sel.removeAllRanges();
        sel.addRange(priorRange);
      }
      previouslyFocused?.focus?.({ preventScroll: true });
    }
    return ok;
  } catch {
    return false;
  }
}
