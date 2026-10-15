import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";

const require = createRequire(import.meta.url);
const { webkit } = require("@playwright/test");

const css = readFileSync(resolve("src/ui-app/src/style.css"), "utf8").replace(
  /@import\s+"tailwindcss";/,
  "",
);

const STYLES = [
  "orbital-pixel",
  "cursor-scan-pulse",
  "breathing-brackets",
  "micro-dot-matrix",
  "tiny-signal-bars",
  "spark-diamond",
];

function mark(style, motion) {
  const map = {
    "orbital-pixel": '<span class="ai-mark ai-orbit"></span>',
    "cursor-scan-pulse": '<span class="ai-mark ai-caret"></span>',
    "breathing-brackets": '<span class="ai-mark ai-bracket"></span>',
    "micro-dot-matrix":
      '<span class="ai-mark ai-matrix">' +
      [
        [15, 0, 0],
        [65, 0, 0.12],
        [15, 34, 0.24],
        [65, 34, 0.36],
        [15, 68, 0.48],
        [65, 68, 0.6],
      ]
        .map(([x, y, d]) => `<i style="--x:${x}%;--y:${y}%;--d:${d}s"></i>`)
        .join("") +
      "</span>",
    "tiny-signal-bars":
      '<span class="ai-mark ai-bars">' +
      [0, 0.18, 0.36].map((d) => `<i style="--d:${d}s"></i>`).join("") +
      "</span>",
    "spark-diamond": '<span class="ai-mark ai-spark"></span>',
  };
  return `<span class="ai ai-sm ai-working ai-compact ai-style-${style} ai-motion-${motion}">${map[style]}</span>`;
}

function hint(style, motion, label, cls = "") {
  return `<div class="mock-hint ${cls}">${mark(style, motion)}<span>${label}</span></div>`;
}

const rows = STYLES.map(
  (s) => `
  <div class="styleblock">
    <div class="stylename">${s}</div>
    <div class="pair">
      <div class="col"><div class="colhead">12px</div>
        ${hint(s, "coding", "coding…")}
        ${hint(s, "reviewing", "reviewing…", "rev")}
        ${hint(s, "agent", "agent…", "ag")}
      </div>
      <div class="col"><div class="colhead">9px (task card)</div>
        ${hint(s, "coding", "coding…")}
        ${hint(s, "reviewing", "reviewing…", "rev")}
        ${hint(s, "agent", "agent…", "ag")}
      </div>
    </div>
  </div>`,
).join("");

const html = `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style>
<style>
  body{margin:0;background:#070a12;color:#e7ecf7;font-family:system-ui,sans-serif}
  .pane{padding:16px}
  .styleblock{margin-bottom:14px;padding:10px 12px;border:1px solid rgba(120,140,200,.14);border-radius:10px;background:#0e1426}
  .stylename{font:600 12px/1.4 monospace;color:#8a96b4;margin-bottom:6px}
  .pair{display:flex;gap:40px}
  .col{display:flex;flex-direction:column;gap:9px}
  .colhead{font:600 10px/1 monospace;color:#5c6b8a;text-transform:uppercase;letter-spacing:.1em}
  .mock-hint{display:inline-flex;align-items:center;gap:5px;font-size:9px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;font-family:"JetBrains Mono",monospace;color:var(--violet)}
  .mock-hint.rev{color:var(--amber)}
  .mock-hint.ag{color:var(--cyan)}
  .col:first-child .mock-hint{font-size:12px}
</style></head><body><div class="pane">${rows}</div></body></html>`;

const browser = await webkit.launch({ headless: true });
const page = await browser.newPage({
  viewport: { width: 700, height: 1200 },
  deviceScaleFactor: 3,
});
await page.setContent(html, { waitUntil: "load" });
await page.waitForTimeout(500);
const path = resolve(
  "/private/var/folders/0r/4_d4rftj7t57174mrzqkhhsw0000gn/T/opencode/ai-all.png",
);
await page.screenshot({ path, fullPage: true });
console.log(path);
await browser.close();
