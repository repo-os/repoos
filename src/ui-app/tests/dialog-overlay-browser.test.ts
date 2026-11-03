// @vitest-environment node
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { webkit, type Browser } from "@playwright/test";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const css = readFileSync(resolve(__dirname, "../src/style.css"), "utf8").replace(
  '@import "tailwindcss";',
  "",
);
const scheduleStyles = readFileSync(
  resolve(__dirname, "../src/components/ScheduledTasksPanel.vue"),
  "utf8",
)
  .split("<style scoped>")[1]!
  .split("</style>")[0]!;

declare global {
  interface Window {
    dialogActions: { cancel: number; confirm: number; underlay: number };
  }
}

describe.skipIf(!existsSync(webkit.executablePath()))(
  "dialog overlay pointer events (WebKit)",
  () => {
    let browser: Browser | undefined;
    let launchError: string | null = null;

    beforeAll(async () => {
      try {
        browser = await webkit.launch();
      } catch (err) {
        // Installed-but-unlaunchable (missing host deps, sandbox, …): skip the
        // browser evidence instead of failing the whole suite. The CSS/computed
        // assertions still run in jsdom tests, and a missing binary is already
        // handled by the describe skipIf above.
        launchError = err instanceof Error ? err.message : String(err);
      }
    });

    afterAll(async () => {
      await browser?.close();
    });

    it("hit-tests both confirmation actions above a pointer-disabled drawer", async (ctx) => {
      if (!browser) return ctx.skip(`WebKit could not launch: ${launchError ?? "unknown error"}`);
      const page = await browser.newPage({ viewport: { width: 900, height: 600 } });
      try {
        await page.setContent(
          `<style>
          ${css}
          html, body { width: 100%; height: 100%; margin: 0; }
          body { pointer-events: none; }
          .underlay {
            position: fixed; inset: 0; z-index: 80; pointer-events: none;
          }
          .test-confirm {
            position: fixed; z-index: 200; inset: 0;
            display: grid; place-items: center;
            background: rgb(0 0 0 / 40%);
          }
          .test-confirm-card {
            width: 420px; padding: 24px; background: var(--panel-solid);
          }
          .delete-confirm-actions button {
            padding: 10px 14px; color: var(--txt); background: var(--panel-solid);
            border: 1px solid var(--border); cursor: pointer;
          }
          #focus-start { position: fixed; left: -100px; }
        </style>
        <div class="underlay" data-overlay-layer="lower" style="pointer-events:none">
          <div id="underlay-action">Underlying drawer action</div>
        </div>
        <div class="test-confirm" data-overlay-layer="upper">
          <section class="test-confirm-card" data-overlay-layer="upper" role="dialog">
            <button id="focus-start" tabindex="0">Focus start</button>
            <div class="delete-confirm-actions cc-modal-actions">
              <button id="cancel">Cancel</button>
              <button id="confirm">Delete schedule</button>
            </div>
          </section>
        </div>
        <script>
          window.dialogActions = { cancel: 0, confirm: 0, underlay: 0 };
          document.querySelector("#cancel").addEventListener("click", () => {
            window.dialogActions.cancel++;
            document.querySelector(".test-confirm").remove();
          });
          document.querySelector("#confirm").addEventListener("click", () => window.dialogActions.confirm++);
          document.querySelector("#underlay-action").addEventListener("click", () => window.dialogActions.underlay++);
        </script>`,
        );

        const cancel = page.locator("#cancel");
        const confirm = page.locator("#confirm");
        await page.keyboard.press("Tab");
        await page.locator("#focus-start").focus();
        await page.keyboard.press("Tab");
        await cancel.focus();
        expect(await cancel.evaluate((el) => el.matches(":focus-visible"))).toBe(true);
        expect(await cancel.evaluate((el) => getComputedStyle(el).outlineWidth)).toBe("2px");
        await page.keyboard.press("Tab");
        await confirm.focus();
        expect(await confirm.evaluate((el) => el.matches(":focus-visible"))).toBe(true);
        expect(await confirm.evaluate((el) => getComputedStyle(el).outlineWidth)).toBe("2px");

        for (const [locator, action] of [
          [confirm, "confirm"],
          [cancel, "cancel"],
        ] as const) {
          const before = await locator.evaluate((el) => {
            const style = getComputedStyle(el);
            return { bg: style.backgroundColor, border: style.borderColor };
          });
          await locator.hover();
          expect(await locator.evaluate((el) => getComputedStyle(el).filter)).toBe(
            "brightness(1.12)",
          );
          // #1005 round 4: brightness alone was ~5/255 — the hover must move
          // the background and border to a visibly distinct state (22% wash
          // + currentColor border, not a faint border-bright tint).
          const after = await locator.evaluate((el) => {
            const style = getComputedStyle(el);
            return { bg: style.backgroundColor, border: style.borderColor };
          });
          expect(after.bg, `${action} hover background shifts`).not.toBe(before.bg);
          expect(after.border, `${action} hover border shifts`).not.toBe(before.border);
          // Magnitude guard: a token swap (e.g. transparent -> tint) can pass
          // a not-equal check while remaining invisible. Require a mean
          // per-channel shift of at least 8/255 so the hover reads on screen.
          const shift = await locator.evaluate(
            (el, pair: { b: { bg: string }; a: { bg: string } }) => {
              const parse = (s: string): [number, number, number] => {
                const m = s.match(/[\d.]+/g)?.map(Number) ?? [0, 0, 0];
                return [m[0] ?? 0, m[1] ?? 0, m[2] ?? 0];
              };
              const [br, bg2, bb] = parse(pair.b.bg);
              const [ar, ag, ab] = parse(pair.a.bg);
              return (Math.abs(br - ar) + Math.abs(bg2 - ag) + Math.abs(bb - ab)) / 3;
            },
            { b: before, a: after },
          );
          expect(shift, `${action} hover shift is visible (>=8/255 mean)`).toBeGreaterThanOrEqual(
            8,
          );
          const box = await locator.boundingBox();
          expect(box).toBeTruthy();
          await page.mouse.click(box!.x + 8, box!.y + 8);
          expect(await page.evaluate((name) => window.dialogActions[name], action)).toBe(1);
        }

        expect(await page.locator(".test-confirm").count()).toBe(0);
        await page.mouse.click(10, 10);
        expect(await page.evaluate(() => window.dialogActions.underlay)).toBe(0);
      } finally {
        await page.close();
      }
    });

    it("stacks schedule details and keeps actions usable through the mid-width range", async (ctx) => {
      if (!browser) return ctx.skip(`WebKit could not launch: ${launchError ?? "unknown error"}`);
      const page = await browser.newPage({ viewport: { width: 901, height: 600 } });
      try {
        await page.setContent(
          `<style>${scheduleStyles}</style>
          <article class="schedule-card">
            <div class="schedule-card-details">
              <dl class="kv-rows schedule-kv">
                <dt>Cadence</dt><dd>Weekly Monday 09:00 (Asia/Singapore)</dd>
              </dl>
              <div class="schedule-actions">
                <button>Run now</button><button>Edit</button><button>Delete</button>
              </div>
            </div>
          </article>`,
        );
        const directionAt901 = await page
          .locator(".schedule-card-details")
          .evaluate((el) => getComputedStyle(el).flexDirection);
        expect(directionAt901).toBe("row");

        await page.setViewportSize({ width: 900, height: 600 });
        const layoutAt900 = await page.locator(".schedule-card-details").evaluate((el) => ({
          detailsDirection: getComputedStyle(el).flexDirection,
          actionsDirection: getComputedStyle(el.querySelector(".schedule-actions")!).flexDirection,
          actionsWrap: getComputedStyle(el.querySelector(".schedule-actions")!).flexWrap,
        }));
        expect(layoutAt900).toEqual({
          detailsDirection: "column",
          actionsDirection: "row",
          actionsWrap: "wrap",
        });
      } finally {
        await page.close();
      }
    });
  },
);
