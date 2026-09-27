import { buildSync } from "esbuild";
import type { Plugin } from "vite";
import { fileURLToPath } from "node:url";

const bootEntry = fileURLToPath(new URL("./src/theme-boot.ts", import.meta.url));
const MARKER = "<!-- repoos-theme-boot -->";

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

export function themeBootPlugin(): Plugin {
  return {
    name: "repoos-theme-boot",
    transformIndexHtml: {
      order: "pre",
      handler(html) {
        const code = bundleThemeBoot();
        const block = `${MARKER}\n    <script>${code}</script>`;
        return html.replace(
          new RegExp(`${MARKER}[\\s\\S]*?(?=\\n    <title>)`, "m"),
          `${block}\n    `,
        );
      },
    },
  };
}
