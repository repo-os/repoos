/**
 * Browser-level regression for the compact activity indicators (#0798).
 *
 * The #0787 regression was invisible to class-name assertions: the component
 * applies `ai-motion-*` to the OUTER `.ai` wrapper while the stylesheet used
 * same-element selectors (`.ai-motion-reviewing.ai-orbit::after`) against the
 * INNER `.ai-mark`. Every state silently fell back to the coding motion.
 *
 * These tests mount the real component (so the real parent/child DOM is what
 * gets styled), inject the real `style.css`, and read the computed animation
 * name/duration from a real WebKit engine. A same-element selector bug fails
 * the assertion; a class-name-only test would pass. Skips cleanly when
 * Playwright/WebKit is not installed, exactly like the rendered-contrast gate.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import ActivityIndicator from "../src/components/ActivityIndicator.vue";
import {
  isPlaywrightUnavailable,
  launchWebkit,
  type SmokeBrowser,
  type SmokePage,
} from "../../commands/ui-harness.js";

let browser: SmokeBrowser | null = null;
let unavailable = false;
try {
  browser = await launchWebkit();
} catch (err) {
  if (isPlaywrightUnavailable((err as Error).message)) unavailable = true;
  else throw err;
}

const describeBrowser = browser ? describe : describe.skip;

afterAll(async () => {
  if (browser) await browser.close();
});

const rawCss = readFileSync(resolve(__dirname, "../src/style.css"), "utf8");
// Tailwind's bare `@import "tailwindcss";` is a build-time directive the test
// page cannot resolve; every rule exercised here lives outside it.
const pageCss = rawCss.replace(/@import\s+"tailwindcss";/, "");

const webFont = `'JetBrains Mono', ui-monospace, monospace`;

type Motion = "coding" | "reviewing" | "agent";

/** Renders the real component and returns its exact outer HTML. */
function renderHtml(style: string, motion: Motion): string {
  const pinia = createPinia();
  setActivePinia(pinia);
  const wrapper = mount(ActivityIndicator, {
    props: { animationStyle: style, activity: motion },
    global: { plugins: [pinia] },
  });
  const html = wrapper.element.outerHTML;
  wrapper.unmount();
  return html;
}

interface Anim {
  name: string;
  duration: string;
}

/** Reads the computed animation off a node (or one of its pseudo-elements). */
async function computedAnim(
  page: SmokePage,
  html: string,
  fontPx: number,
  selector: string,
  pseudo: string | null,
): Promise<Anim> {
  return page.evaluate(
    ({ html, fontPx, selector, pseudo, webFont }) => {
      document.body.innerHTML =
        `<div style="font-family:${webFont};font-size:${fontPx}px">${html}</div>`;
      const el = document.querySelector(selector);
      if (!el) return { name: `MISSING:${selector}`, duration: "" };
      const cs = pseudo ? getComputedStyle(el, pseudo) : getComputedStyle(el);
      return { name: cs.animationName, duration: cs.animationDuration };
    },
    { html, fontPx, selector, pseudo, webFont },
  );
}

interface Expectation {
  style: string;
  motion: Motion;
  selector: string;
  pseudo: string | null;
  name: string;
  duration: string;
}

// The primary animated node for each family/state. Element animations (e.g.
// the agent's breathing bracket) use a null pseudo and target the mark itself.
const EXPECTATIONS: Expectation[] = [
  // Orbital pixel: coding orbits, reviewing scans inside the ring, agent is a
  // slower orbit.
  { style: "orbital-pixel", motion: "coding", selector: ".ai-orbit", pseudo: "::after", name: "ai-orbital", duration: "1.6s" },
  { style: "orbital-pixel", motion: "reviewing", selector: ".ai-orbit", pseudo: "::after", name: "ai-scanorbit", duration: "2s" },
  { style: "orbital-pixel", motion: "agent", selector: ".ai-orbit", pseudo: "::after", name: "ai-orbital", duration: "2.6s" },
  // Cursor / scan / pulse.
  { style: "cursor-scan-pulse", motion: "coding", selector: ".ai-caret", pseudo: "::before", name: "ai-blink", duration: "1.1s" },
  { style: "cursor-scan-pulse", motion: "reviewing", selector: ".ai-caret", pseudo: "::before", name: "ai-scan", duration: "1.6s" },
  { style: "cursor-scan-pulse", motion: "agent", selector: ".ai-caret", pseudo: "::before", name: "ai-breathe", duration: "1.7s" },
  // Breathing brackets.
  { style: "breathing-brackets", motion: "coding", selector: ".ai-bracket", pseudo: "::before", name: "ai-leftbracket", duration: "1.5s" },
  { style: "breathing-brackets", motion: "coding", selector: ".ai-bracket", pseudo: "::after", name: "ai-rightbracket", duration: "1.5s" },
  { style: "breathing-brackets", motion: "reviewing", selector: ".ai-bracket", pseudo: "::before", name: "ai-fade", duration: "1.8s" },
  { style: "breathing-brackets", motion: "agent", selector: ".ai-bracket", pseudo: null, name: "ai-breathe", duration: "1.8s" },
  // Micro dot matrix.
  { style: "micro-dot-matrix", motion: "coding", selector: ".ai-matrix i", pseudo: null, name: "ai-fade", duration: "1.2s" },
  { style: "micro-dot-matrix", motion: "reviewing", selector: ".ai-matrix i", pseudo: null, name: "ai-twinkle", duration: "1.8s" },
  { style: "micro-dot-matrix", motion: "agent", selector: ".ai-matrix", pseudo: null, name: "ai-rotate", duration: "3.5s" },
  // Tiny signal bars.
  { style: "tiny-signal-bars", motion: "coding", selector: ".ai-bars i", pseudo: null, name: "ai-bars", duration: "1.2s" },
  { style: "tiny-signal-bars", motion: "reviewing", selector: ".ai-bars i", pseudo: null, name: "ai-scanbar", duration: "1.8s" },
  { style: "tiny-signal-bars", motion: "agent", selector: ".ai-bars i", pseudo: null, name: "ai-bars", duration: "2s" },
  // Spark / diamond.
  { style: "spark-diamond", motion: "coding", selector: ".ai-spark", pseudo: "::before", name: "ai-spark", duration: "2.2s" },
  { style: "spark-diamond", motion: "reviewing", selector: ".ai-spark", pseudo: "::before", name: "ai-inspect", duration: "2.4s" },
  { style: "spark-diamond", motion: "agent", selector: ".ai-spark", pseudo: "::before", name: "ai-spark", duration: "3s" },
];

const STYLE_SELECTORS: Record<string, { selector: string; pseudo: string | null }> = {
  "orbital-pixel": { selector: ".ai-orbit", pseudo: "::after" },
  "cursor-scan-pulse": { selector: ".ai-caret", pseudo: "::before" },
  "breathing-brackets": { selector: ".ai-bracket", pseudo: null },
  "micro-dot-matrix": { selector: ".ai-matrix", pseudo: null },
  "tiny-signal-bars": { selector: ".ai-bars", pseudo: null },
  "spark-diamond": { selector: ".ai-spark", pseudo: "::before" },
};

describeBrowser("ActivityIndicator motion is real in WebKit (#0798)", () => {
  it("has a usable browser when this suite runs", () => {
    expect(unavailable).toBe(false);
  });

  for (const exp of EXPECTATIONS) {
    it(`${exp.style} · ${exp.motion} → ${exp.name} ${exp.duration}`, async () => {
      const page = await browser!.newPage();
      try {
        await page.goto("about:blank", { waitUntil: "load", timeout: 10_000 });
        await page.evaluate(
          ({ css }) => {
            const s = document.createElement("style");
            s.textContent = css;
            document.head.appendChild(s);
          },
          { css: pageCss },
        );
        const html = renderHtml(exp.style, exp.motion);
        const anim = await computedAnim(page, html, 12, exp.selector, exp.pseudo);
        expect(anim.name).toBe(exp.name);
        expect(anim.duration).toBe(exp.duration);
      } finally {
        await page.close();
      }
    });
  }

  it("does not collapse reviewing/agent onto the coding motion", async () => {
    const page = await browser!.newPage();
    try {
      await page.goto("about:blank", { waitUntil: "load", timeout: 10_000 });
      await page.evaluate(
        ({ css }) => {
          const s = document.createElement("style");
          s.textContent = css;
          document.head.appendChild(s);
        },
        { css: pageCss },
      );
      const signature = (motion: Motion, style: string) =>
        page.evaluate(
          ({ html, webFont }) => {
            document.body.innerHTML =
              `<div style="font-family:${webFont};font-size:12px">${html}</div>`;
            const root = document.querySelector(".ai")!;
            // Every descendant + pseudo-element animation, as name@duration.
            return root
              .getAnimations({ subtree: true })
              .map(
                (a) =>
                  `${(a as unknown as { animationName: string }).animationName}@${a.effect?.getTiming().duration ?? ""}`,
              )
              .sort()
              .join("|");
          },
          { html: renderHtml(style, motion), webFont },
        );
      for (const style of Object.keys(STYLE_SELECTORS)) {
        const coding = await signature("coding", style);
        const reviewing = await signature("reviewing", style);
        const agent = await signature("agent", style);
        expect(reviewing, `${style} reviewing should differ from coding`).not.toBe(coding);
        expect(agent, `${style} agent should differ from coding`).not.toBe(coding);
        expect(coding, `${style} should animate something`).not.toBe("");
      }
    } finally {
      await page.close();
    }
  });

  it("keeps every compact mark within a 1–2ch allocation at card and preview sizes", async () => {
    const page = await browser!.newPage();
    try {
      await page.goto("about:blank", { waitUntil: "load", timeout: 10_000 });
      await page.evaluate(
        ({ css }) => {
          const s = document.createElement("style");
          s.textContent = css;
          document.head.appendChild(s);
        },
        { css: pageCss },
      );
      for (const fontPx of [9, 12]) {
        for (const style of Object.keys(STYLE_SELECTORS)) {
          const res = await page.evaluate(
            ({ html, fontPx, webFont }) => {
              document.body.innerHTML =
                `<div style="font-family:${webFont};font-size:${fontPx}px">` +
                `${html}<span id="ch-probe" style="display:inline-block;width:1ch"></span></div>`;
              const mark = document.querySelector(".ai-mark")!;
              const probe = document.querySelector("#ch-probe")!;
              const markRect = mark.getBoundingClientRect();
              return {
                markW: markRect.width,
                ch: probe.getBoundingClientRect().width,
              };
            },
            { html: renderHtml(style, "coding"), fontPx, webFont },
          );
          // A real 0.5px slack absorbs subpixel rounding.
          expect(res.ch, `${style} @${fontPx}px: ch resolved`).toBeGreaterThan(0);
          expect(res.markW, `${style} @${fontPx}px (${res.markW}px vs 2ch=${2 * res.ch}px)`).toBeLessThanOrEqual(
            2 * res.ch + 0.5,
          );
        }
      }
    } finally {
      await page.close();
    }
  });

  it("leaves no animation running for any family under prefers-reduced-motion", async () => {
    const page = await browser!.newPage();
    try {
      await page.goto("about:blank", { waitUntil: "load", timeout: 10_000 });
      await page.evaluate(
        ({ css }) => {
          const s = document.createElement("style");
          s.textContent = css;
          document.head.appendChild(s);
        },
        { css: pageCss },
      );
      await (
        page as unknown as {
          emulateMedia(options: { reducedMotion: "reduce" }): Promise<void>;
        }
      ).emulateMedia({ reducedMotion: "reduce" });
      for (const style of Object.keys(STYLE_SELECTORS)) {
        for (const motion of ["coding", "reviewing", "agent"] as Motion[]) {
          const running = await page.evaluate(
            ({ html, webFont }) => {
              document.body.innerHTML =
                `<div style="font-family:${webFont};font-size:12px">${html}</div>`;
              const root = document.querySelector(".ai")!;
              const mark = document.querySelector(".ai-mark")!;
              const anims = root.getAnimations({ subtree: true });
              return {
                count: anims.length,
                markW: mark.getBoundingClientRect().width,
                markH: mark.getBoundingClientRect().height,
              };
            },
            { html: renderHtml(style, motion), webFont },
          );
          expect(running.count, `${style} · ${motion} still animating`).toBe(0);
          // Every family keeps a visible static mark.
          expect(running.markW).toBeGreaterThan(0);
          expect(running.markH).toBeGreaterThan(0);
        }
      }
    } finally {
      await page.close();
    }
  });
});
