import { buildSync } from "esbuild";
import type { Plugin } from "vite";
import { fileURLToPath } from "node:url";

const bootEntry = fileURLToPath(new URL("./theme/theme-boot.ts", import.meta.url));
const MARKER = 'id="repoos-theme-boot"';

function bundleThemeBoot(): string {
  const result = buildSync({
    entryPoints: [bootEntry],
    bundle: true,
    write: false,
    format: "iife",
    platform: "browser",
    target: "es2020",
    minify: true,
  });
  return result.outputFiles[0]!.text;
}

let cachedBoot: string | undefined;

/** Inline IIFE for config `head` — VitePress SSG does not run transformIndexHtml on output pages. */
export function themeBootScriptContent(): string {
  cachedBoot ??= bundleThemeBoot();
  return cachedBoot;
}

export function themeBootPlugin(): Plugin {
  return {
    name: "repoos-docs-theme-boot",
    transformIndexHtml: {
      order: "pre",
      handler(html) {
        const code = themeBootScriptContent();
        const scriptTag = `<script ${MARKER}>${code}</script>`;
        if (html.includes(MARKER)) {
          return html.replace(new RegExp(`<script ${MARKER}>[\\s\\S]*?</script>`, "m"), scriptTag);
        }
        return html.replace("<head>", `<head>\n    ${scriptTag}`);
      },
    },
  };
}
