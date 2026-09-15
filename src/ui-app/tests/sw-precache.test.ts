/**
 * The service worker precaches only the app shell. Lazy chunks (route views,
 * Mermaid's diagram code) are cached on first use instead, so a UI build no
 * longer makes every browser re-download the whole ~4 MB bundle.
 */
import { describe, expect, it } from "vitest";
import { shellPrecache, type PrecacheBundleEntry } from "../src/lib/sw-precache";

function chunk(fileName: string, imports: string[] = [], isEntry = false): PrecacheBundleEntry {
  return { type: "chunk", fileName, imports, isEntry };
}
function asset(fileName: string): PrecacheBundleEntry {
  return { type: "asset", fileName };
}
function bundleOf(...items: PrecacheBundleEntry[]): Record<string, PrecacheBundleEntry> {
  return Object.fromEntries(items.map((i) => [i.fileName, i]));
}

describe("shellPrecache", () => {
  const bundle = bundleOf(
    chunk("assets/index.js", ["assets/vendor-vue.js", "assets/button.js"], true),
    chunk("assets/vendor-vue.js"),
    chunk("assets/button.js", ["assets/vendor-ui.js"]),
    chunk("assets/vendor-ui.js", ["assets/button.js"]), // import cycle
    chunk("assets/ContextView.js", ["assets/vendor-vue.js"]), // lazy route view
    chunk("assets/mermaid.core.js", ["assets/cytoscape.esm.js"]), // lazy diagram code
    chunk("assets/cytoscape.esm.js"),
    asset("index.html"),
    asset("assets/index.css"),
    asset("assets/katex.css"),
    asset("favicon.svg"),
    asset("assets/index.js.map"),
  );
  const list = shellPrecache(bundle);

  it("includes the entry and everything it statically imports, transitively", () => {
    for (const f of [
      "/assets/index.js",
      "/assets/vendor-vue.js",
      "/assets/button.js",
      "/assets/vendor-ui.js",
    ]) {
      expect(list).toContain(f);
    }
  });

  it("leaves lazily loaded chunks to be cached on first use", () => {
    for (const f of [
      "/assets/ContextView.js",
      "/assets/mermaid.core.js",
      "/assets/cytoscape.esm.js",
    ]) {
      expect(list).not.toContain(f);
    }
  });

  it("includes the navigation root and non-JS static files, but not source maps", () => {
    expect(list[0]).toBe("/");
    for (const f of ["/index.html", "/assets/index.css", "/assets/katex.css", "/favicon.svg"]) {
      expect(list).toContain(f);
    }
    expect(list).not.toContain("/assets/index.js.map");
  });

  it("lists each file once", () => {
    expect(new Set(list).size).toBe(list.length);
  });
});
