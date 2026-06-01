// Copies non-TS assets (the UI html) into dist after tsc runs.
import { mkdirSync, copyFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "src", "ui", "app.html");
const destDir = join(root, "dist", "ui");
const dest = join(destDir, "app.html");

if (!existsSync(src)) {
  console.error("copy-assets: src/ui/app.html not found");
  process.exit(1);
}
mkdirSync(destDir, { recursive: true });
copyFileSync(src, dest);

// favicon
const faviconSrc = join(root, "src", "ui", "favicon.svg");
if (existsSync(faviconSrc)) {
  copyFileSync(faviconSrc, join(destDir, "favicon.svg"));
}

// vendored Vue runtime (so the UI works fully offline)
const vSrc = join(root, "src", "ui", "vendor", "vue.global.prod.js");
if (existsSync(vSrc)) {
  mkdirSync(join(destDir, "vendor"), { recursive: true });
  copyFileSync(vSrc, join(destDir, "vendor", "vue.global.prod.js"));
  console.log("copy-assets: ui + vendored vue → dist/ui/");
} else {
  console.log("copy-assets: ui → dist/ui/app.html (no vendor vue found)");
}
