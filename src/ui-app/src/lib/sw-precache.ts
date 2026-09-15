/**
 * Which built files the service worker downloads up front.
 *
 * Only the app shell: the entry chunk and everything it imports statically
 * (what the first paint needs), plus the small non-JS files (HTML, CSS,
 * icons). Lazily loaded chunks, meaning route views and above all Mermaid's
 * diagram code (~2 MB of the build, loaded only when a diagram renders), are
 * left to the service worker's fetch handler, which caches each file the first
 * time it's used. Precaching everything made every browser download ~4 MB
 * again after each UI build, because the cache name changes with the file list.
 *
 * Takes the Vite/Rolldown output bundle; typed structurally so it can be unit
 * tested with a plain object.
 */
export interface PrecacheBundleEntry {
  type: "chunk" | "asset";
  fileName: string;
  isEntry?: boolean;
  imports?: readonly string[];
}

export function shellPrecache(bundle: Record<string, PrecacheBundleEntry>): string[] {
  const shell = new Set<string>();

  const visit = (fileName: string): void => {
    const item = bundle[fileName];
    if (!item || item.type !== "chunk" || shell.has(fileName)) return;
    shell.add(fileName);
    for (const dep of item.imports ?? []) visit(dep);
  };
  for (const item of Object.values(bundle)) {
    if (item.type === "chunk" && item.isEntry) visit(item.fileName);
  }

  for (const item of Object.values(bundle)) {
    if (item.type !== "asset" || item.fileName.endsWith(".map")) continue;
    if (/\.m?js$/.test(item.fileName)) continue;
    shell.add(item.fileName);
  }

  return ["/", ...[...shell].sort().map((f) => `/${f}`)];
}
