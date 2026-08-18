// Writes two markers into dist/:
//   .build-info.json  — { hash, version }. Deterministic: identical source
//     produces byte-identical content, so a rebuild never dirties the tree.
//     This is the file staleness detection and reload compare against.
//   .build-stamp.json — { generatedAt }. Changes on every build by design, so
//     it is gitignored. Only "how old is this build" readers consult it.
// The web UI is no longer copied verbatim — it is built by Vite into dist/ui/
// via `bun run build:ui` (see src/ui-app/vite.config.ts).
import { chmodSync, existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const srcDir = join(root, "src");
const buildInfo = {
  hash: "",
  version: "",
};

// Record the package version so the served UI can display it. Best-effort.
try {
  buildInfo.version = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version ?? "";
} catch {
  /* keep version empty when package.json is unreadable */
}

if (existsSync(srcDir)) {
  const hash = createHash("sha256");
  const files = [];
  function walk(dir) {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name === "node_modules") continue;
        walk(full);
      } else if (e.isFile()) {
        files.push(full);
      }
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

// The build timestamp lives in its own gitignored file. Keeping it out of
// .build-info.json is what makes that marker deterministic — with the
// timestamp inlined, every single build dirtied the tree and conflicted on
// every merge, which is what forced the dist/ auto-resolve and the
// dirty-main guard.
const stampPath = join(root, "dist", ".build-stamp.json");
writeFileSync(stampPath, JSON.stringify({ generatedAt: new Date().toISOString() }, null, 2) + "\n");
console.log("copy-assets: dist/.build-info.json → " + buildInfo.hash.slice(0, 12) + "…");

// The CLI entrypoint needs execute permission after every build (tsc emits
// non-executable files, and git does not reliably preserve the mode bit).
const cliEntry = join(root, "dist", "cli", "index.js");
if (existsSync(cliEntry)) chmodSync(cliEntry, 0o755);
