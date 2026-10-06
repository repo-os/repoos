/**
 * Substitute the build hash into the Vite-built `index.html` at serve time.
 * Only `__REPOOS_BUILD_HASH_VALUE__` is replaced — never the window property
 * name `__REPOOS_BUILD_HASH__`, or a hash starting with a digit becomes invalid
 * JS (`window.0678…`).
 */
export function injectBuildHashIntoUiIndex(html: string, hash: string): string {
  const h = hash.trim() || "unknown";
  return html.replaceAll("__REPOOS_BUILD_HASH_VALUE__", h);
}
