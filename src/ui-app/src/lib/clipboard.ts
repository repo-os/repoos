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

/** `document.execCommand("copy")` via a throwaway off-screen textarea. */
function legacyCopy(text: string): boolean {
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.top = "-9999px";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}
