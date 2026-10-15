import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";

const require = createRequire(import.meta.url);
const { webkit } = require("@playwright/test");
const css = readFileSync(resolve("src/ui-app/src/style.css"), "utf8").replace(
  /@import\s+"tailwindcss";/,
  "",
);

function mark(style, motion) {
  const map = {
    "orbital-pixel": '<span class="ai-mark ai-orbit"></span>',
    "breathing-brackets": '<span class="ai-mark ai-bracket"></span>',
    "spark-diamond": '<span class="ai-mark ai-spark"></span>',
  };
  return `<span class="ai ai-sm ai-working ai-compact ai-style-${style} ai-motion-${motion}">${map[style]}</span>`;
}

const html = `<!doctype html><html><head><style>${css}</style>
<style>body{background:#0e1426;color:#9d7bff;margin:0;padding:10px;font-family:'JetBrains Mono',monospace}
.row{display:flex;align-items:center;gap:8px;font-size:48px;font-weight:600;letter-spacing:.08em}
.row.rev{color:#ffb454}.row.ag{color:#39e0ff}
.g{font-size:14px;color:#8a96b4}</style></head><body>
<div class="g">48px coding / reviewing / agent</div>
<div class="row">${mark("breathing-brackets", "coding")}<span>CODING</span></div>
<div class="row rev">${mark("breathing-brackets", "reviewing")}<span>REVIEWING</span></div>
<div class="row ag">${mark("breathing-brackets", "agent")}<span>AGENT</span></div>
<div class="g" style="margin-top:14px">spark</div>
<div class="row">${mark("spark-diamond", "coding")}<span>CODING</span></div>
<div class="row rev">${mark("spark-diamond", "reviewing")}<span>REVIEWING</span></div>
</body></html>`;

const browser = await webkit.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 700, height: 500 }, deviceScaleFactor: 2 });
await page.setContent(html, { waitUntil: "load" });
await page.waitForTimeout(300);
await page.screenshot({
  path: "/private/var/folders/0r/4_d4rftj7t57174mrzqkhhsw0000gn/T/opencode/zoom.png",
  clip: { x: 0, y: 0, width: 420, height: 360 },
});
await browser.close();
