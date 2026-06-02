// Copies non-TS assets (the UI html) into dist after tsc runs,
// and writes dist/.build-info.json with a hash of src/ for staleness detection.
import { mkdirSync, copyFileSync, existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

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

// ---- build marker for staleness detection ----
const srcDir = join(root, "src");
const buildInfo = { hash: "", generatedAt: new Date().toISOString() };

if (existsSync(srcDir)) {
  const hash = createHash("sha256");
  const files = [];
  function walk(dir) {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.isFile()) files.push(full);
    }
  }
  walk(srcDir);
  files.sort();
  for (const f of files) {
    hash.update(f.slice(root.length + 1)); // relative path
    hash.update(readFileSync(f));
  }
  buildInfo.hash = hash.digest("hex");
}

const infoPath = join(root, "dist", ".build-info.json");
writeFileSync(infoPath, JSON.stringify(buildInfo, null, 2) + "\n");
console.log("copy-assets: dist/.build-info.json → " + buildInfo.hash.slice(0, 12) + "…");
