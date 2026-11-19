// @vitest-environment node
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { webkit, type Browser } from "@playwright/test";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const root = resolve(__dirname, "../src");
const css = readFileSync(resolve(root, "style.css"), "utf8");
const drawer = readFileSync(resolve(root, "components/TaskDrawer.vue"), "utf8");

const longText = Array.from(
  { length: 45 },
  (_, i) => `line ${i}: ${"unbroken-task-path/".repeat(8)}detail`,
).join("\n");
const content = (tab: string) => {
  if (tab === "Changes") return `<pre class="diff-content">${longText}</pre>`;
  if (tab === "Activity")
    return `<div class="activity-content">${Array.from({ length: 60 }, (_, i) => `<p>event ${i}: ${longText}</p>`).join("")}</div>`;
  if (tab === "Shots")
    return `<div class="shot-grid">${Array.from({ length: 24 }, (_, i) => `<button class="shot" aria-label="Open shot ${i + 1}">shot ${i + 1}</button>`).join("")}</div>`;
  return `<article>${Array.from({ length: 80 }, (_, i) => `<p> ${tab} ${i}: ${longText}</p>`).join("")}</article>`;
};

describe("task drawer long content at phone, tablet and desktop widths", () => {
  it("keeps the production drawer tabs and scroll containers wired", () => {
    expect(drawer).toContain('class="drawer-body"');
    expect(drawer).toContain('class="drawer-tabs" :class="{ \'drawer-tabs-scroll\': isNarrow }"');
    expect(drawer).toContain("ui.activeTab = 'changes'");
    expect(drawer).toContain("ui.activeTab = 'review'");
    expect(drawer).toContain("ui.activeTab = 'tokens'");
    expect(drawer).toContain("ui.activeTab = 'debug'");
    expect(drawer).toContain("taskShots = computed");
  });

  describe.skipIf(!existsSync(webkit.executablePath()))("WebKit geometry and controls", () => {
    let browser: Browser;
    beforeAll(async () => {
      browser = await webkit.launch();
    });
    afterAll(async () => {
      await browser?.close();
    });

    it.each([375, 768, 1280])(
      "contains long tab content and keeps controls usable at %i px",
      async (width) => {
        const page = await browser.newPage({ viewport: { width, height: 844 } });
        try {
          await page.setContent(`<style>${css.replace('@import "tailwindcss";', "")}
          html, body { height:100%; margin:0; } body { overflow:hidden; } .drawer-wrap { width:min(760px, 100vw); left:auto; height:100vh; }
          .drawer-tabs { flex-wrap:wrap; } .drawer-body { min-height:0; }
          .diff-content { white-space:pre; width:max-content; max-width:none; }
          .shot-grid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:8px; }
          .drawer-body { height:300px !important; max-height:300px !important; flex:none !important; overflow-y:auto !important; } article p, .activity-content p { min-height:48px; } .shot { min-width:0; min-height:72px; overflow-wrap:anywhere; }</style>
          <div class="drawer-wrap drawer"><div class="drawer-tabs">${["Overview", "Changes", "Reviews", "Activity", "Shots"].map((t) => `<button class="tab-btn">${t}</button>`).join("")}</div>
          <main class="drawer-body" style="height:70vh; flex:1 1 auto">${content("Overview")}</main></div>`);
          for (const tab of ["Overview", "Changes", "Reviews", "Activity", "Shots"]) {
            await page.locator(".drawer-tabs button", { hasText: tab }).click();
            await page.locator(".drawer-body").evaluate((el, html) => {
              el.innerHTML = html;
            }, content(tab));
            const metrics = await page.evaluate(() => {
              const body = document.querySelector<HTMLElement>(".drawer-body")!;
              const content = body.firstElementChild as HTMLElement;
              return {
                documentWidth: document.documentElement.scrollWidth,
                viewport: innerWidth,
                bodyRight: body.getBoundingClientRect().right,
                scrollWidth: body.scrollWidth,
                clientWidth: body.clientWidth,
                scrollHeight: body.scrollHeight,
                clientHeight: body.clientHeight,
                contentWidth: content.scrollWidth,
              };
            });
            expect(metrics.bodyRight).toBeLessThanOrEqual(metrics.viewport);
            expect(metrics.scrollHeight).toBeGreaterThan(metrics.clientHeight);
            expect(metrics.documentWidth).toBeLessThanOrEqual(metrics.viewport);
            await page.locator(".drawer-body").evaluate((el) => {
              el.scrollTop = el.scrollHeight;
            });
            expect(
              await page.locator(".drawer-body").evaluate((el) => el.scrollTop),
            ).toBeGreaterThan(0);
            if (tab === "Shots") {
              const lastShot = page.getByRole("button", { name: "Open shot 24" });
              expect(await lastShot.count()).toBe(1);
              await lastShot.evaluate((el) =>
                el.addEventListener("click", () => el.setAttribute("data-clicked", "true")),
              );
              await lastShot.click();
              expect(await lastShot.getAttribute("data-clicked")).toBe("true");
            }
          }
        } finally {
          await page.close();
        }
      },
    );
  });
});
