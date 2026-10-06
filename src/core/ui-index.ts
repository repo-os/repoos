/**
 * Substitute the build hash into the Vite-built `index.html` at serve time.
 * The template uses `__REPOOS_BUILD_HASH__` in both the meta tag and the
 * inline script value; a naive replaceAll also hits the script's property
 * name (`window.__REPOOS_BUILD_HASH__`), producing invalid JS like
 * `window.7cbce21…` (numeric literal + identifier).
 */
export function injectBuildHashIntoUiIndex(html: string, hash: string): string {
  const h = hash.trim() || "unknown";
  let out = html.replace(
    /window\.__REPOOS_BUILD_HASH__\s*=\s*"__REPOOS_BUILD_HASH__"/,
    `window.__REPOOS_BUILD_HASH__ = "${h}"`,
  );
  out = out.replaceAll('content="__REPOOS_BUILD_HASH__"', `content="${h}"`);
  return out;
}
