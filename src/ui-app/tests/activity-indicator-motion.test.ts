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
  ACTIVITY_ANIMATION_SIZES,
  ACTIVITY_ANIMATION_SIZE_MAX_PX,
  DEFAULT_ACTIVITY_ANIMATION_SIZE,
} from "../../core/activity-animation.js";
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
function renderHtml(style: string, motion: Motion, size?: string): string {
  const pinia = createPinia();
  setActivePinia(pinia);
  const wrapper = mount(ActivityIndicator, {
    props: {
      animationStyle: style,
      activity: motion,
      ...(size ? { animationSize: size } : {}),
    },
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
      document.body.innerHTML = `<div style="font-family:${webFont};font-size:${fontPx}px">${html}</div>`;
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
  {
    style: "orbital-pixel",
    motion: "coding",
    selector: ".ai-orbit",
    pseudo: "::after",
    name: "ai-orbital",
    duration: "1.6s",
  },
  {
    style: "orbital-pixel",
    motion: "reviewing",
    selector: ".ai-orbit",
    pseudo: "::after",
    name: "ai-scanorbit",
    duration: "2s",
  },
  {
    style: "orbital-pixel",
    motion: "agent",
    selector: ".ai-orbit",
    pseudo: "::after",
    name: "ai-orbital",
    duration: "2.6s",
  },
  // Cursor / scan / pulse.
  {
    style: "cursor-scan-pulse",
    motion: "coding",
    selector: ".ai-caret",
    pseudo: "::before",
    name: "ai-blink",
    duration: "1.1s",
  },
  {
    style: "cursor-scan-pulse",
    motion: "reviewing",
    selector: ".ai-caret",
    pseudo: "::before",
    name: "ai-scan",
    duration: "1.6s",
  },
  {
    style: "cursor-scan-pulse",
    motion: "agent",
    selector: ".ai-caret",
    pseudo: "::before",
    name: "ai-breathe",
    duration: "1.7s",
  },
  // Breathing brackets.
  {
    style: "breathing-brackets",
    motion: "coding",
    selector: ".ai-bracket",
    pseudo: "::before",
    name: "ai-leftbracket",
    duration: "1.5s",
  },
  {
    style: "breathing-brackets",
    motion: "coding",
    selector: ".ai-bracket",
    pseudo: "::after",
    name: "ai-rightbracket",
    duration: "1.5s",
  },
  {
    style: "breathing-brackets",
    motion: "reviewing",
    selector: ".ai-bracket",
    pseudo: "::before",
    name: "ai-fade",
    duration: "1.8s",
  },
  {
    style: "breathing-brackets",
    motion: "agent",
    selector: ".ai-bracket",
    pseudo: null,
    name: "ai-breathe",
    duration: "1.8s",
  },
  // Micro dot matrix.
  {
    style: "micro-dot-matrix",
    motion: "coding",
    selector: ".ai-matrix i",
    pseudo: null,
    name: "ai-fade",
    duration: "1.2s",
  },
  {
    style: "micro-dot-matrix",
    motion: "reviewing",
    selector: ".ai-matrix i",
    pseudo: null,
    name: "ai-twinkle",
    duration: "1.8s",
  },
  {
    style: "micro-dot-matrix",
    motion: "agent",
    selector: ".ai-matrix",
    pseudo: null,
    name: "ai-rotate",
    duration: "3.5s",
  },
  // Tiny signal bars.
  {
    style: "tiny-signal-bars",
    motion: "coding",
    selector: ".ai-bars i",
    pseudo: null,
    name: "ai-bars",
    duration: "1.2s",
  },
  {
    style: "tiny-signal-bars",
    motion: "reviewing",
    selector: ".ai-bars i",
    pseudo: null,
    name: "ai-scanbar",
    duration: "1.8s",
  },
  {
    style: "tiny-signal-bars",
    motion: "agent",
    selector: ".ai-bars i",
    pseudo: null,
    name: "ai-bars",
    duration: "2s",
  },
  // Spark / diamond.
  {
    style: "spark-diamond",
    motion: "coding",
    selector: ".ai-spark",
    pseudo: "::before",
    name: "ai-spark",
    duration: "2.2s",
  },
  {
    style: "spark-diamond",
    motion: "reviewing",
    selector: ".ai-spark",
    pseudo: "::before",
    name: "ai-inspect",
    duration: "2.4s",
  },
  {
    style: "spark-diamond",
    motion: "agent",
    selector: ".ai-spark",
    pseudo: "::before",
    name: "ai-spark",
    duration: "3s",
  },
  // Arcade hopper: coding jumps, reviewing peeks sideways, agent jumps slower.
  {
    style: "arcade-hopper",
    motion: "coding",
    selector: ".ai-hopper i",
    pseudo: null,
    name: "ai-hop",
    duration: "1s",
  },
  {
    style: "arcade-hopper",
    motion: "reviewing",
    selector: ".ai-hopper i",
    pseudo: null,
    name: "ai-hop-peek",
    duration: "1.35s",
  },
  {
    style: "arcade-hopper",
    motion: "agent",
    selector: ".ai-hopper i",
    pseudo: null,
    name: "ai-hop",
    duration: "1.2s",
  },
  // Puppy tracks: coding steps, reviewing sniffs wider, agent steps slower.
  {
    style: "puppy-tracks",
    motion: "coding",
    selector: ".ai-paws i",
    pseudo: null,
    name: "ai-paw-step",
    duration: "1s",
  },
  {
    style: "puppy-tracks",
    motion: "reviewing",
    selector: ".ai-paws i",
    pseudo: null,
    name: "ai-paw-sniff",
    duration: "1.35s",
  },
  {
    style: "puppy-tracks",
    motion: "agent",
    selector: ".ai-paws i",
    pseudo: null,
    name: "ai-paw-step",
    duration: "1.2s",
  },
  {
    style: "bird-quick-trail",
    motion: "coding",
    selector: ".ai-bird-quick .foot",
    pseudo: null,
    name: "ai-br-quick",
    duration: "0.7s",
  },
  {
    style: "bird-quick-trail",
    motion: "reviewing",
    selector: ".ai-bird-quick .foot",
    pseudo: null,
    name: "ai-br-careful",
    duration: "1.755s",
  },
  {
    style: "bird-quick-trail",
    motion: "agent",
    selector: ".ai-bird-quick .foot",
    pseudo: null,
    name: "ai-br-quick",
    duration: "0.84s",
  },
];

const STYLE_SELECTORS: Record<string, { selector: string; pseudo: string | null }> = {
  "orbital-pixel": { selector: ".ai-orbit", pseudo: "::after" },
  "cursor-scan-pulse": { selector: ".ai-caret", pseudo: "::before" },
  "breathing-brackets": { selector: ".ai-bracket", pseudo: null },
  "micro-dot-matrix": { selector: ".ai-matrix", pseudo: null },
  "tiny-signal-bars": { selector: ".ai-bars", pseudo: null },
  "spark-diamond": { selector: ".ai-spark", pseudo: "::before" },
  "arcade-hopper": { selector: ".ai-hopper i", pseudo: null },
  "puppy-tracks": { selector: ".ai-paws i", pseudo: null },
  "bird-quick-trail": { selector: ".ai-bird-quick .foot", pseudo: null },
  // #0833 artwork: one animated subject node per style.
  "rgb-keystorm": { selector: ".ai-key", pseudo: null },
  "wheelie-courier": { selector: ".ai-wheel-spokes", pseudo: null },
  "boo-swoop": { selector: ".ai-ghost-bank", pseudo: null },
  "pumpkin-spell": { selector: ".ai-pumpkin-bounce", pseudo: null },
  "three-dots": { selector: ".ai-dot", pseudo: null },
};

/** Primary animated node + expected animation name per #0833 artwork style. */
const ART_SUBJECTS: Record<string, { selector: string; name: string }> = {
  "rgb-keystorm": { selector: ".ai-key", name: "ai-key-wave" },
  "wheelie-courier": { selector: ".ai-wheel-spokes", name: "ai-spokes" },
  "boo-swoop": { selector: ".ai-ghost-bank", name: "ai-ghost-bank" },
  "pumpkin-spell": { selector: ".ai-pumpkin-bounce", name: "ai-pumpkin-bounce" },
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

  it("holds every activity style on its static frame for reduced motion", async () => {
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

      for (const [style, subject] of Object.entries(STYLE_SELECTORS)) {
        const result = await page.evaluate(
          ({ html, selector, pseudo, webFont }) => {
            document.body.innerHTML = `<div style="font-family:${webFont};font-size:12px">${html}</div>`;
            const root = document.querySelector<HTMLElement>(".ai")!;
            // This is the class the motion coordinator applies when
            // prefers-reduced-motion matches; the coordinator behavior itself
            // is covered by activity-motion-coordinator.test.ts.
            root.classList.add("ai-motion-paused");
            const el = document.querySelector(selector)!;
            const playState = getComputedStyle(el, pseudo).animationPlayState;
            const running = root
              .getAnimations({ subtree: true })
              .filter((animation) => animation.playState === "running").length;
            return { playState, running };
          },
          {
            html: renderHtml(style, "coding"),
            selector: subject.selector,
            pseudo: subject.pseudo,
            webFont,
          },
        );
        expect(result.playState, `${style}: computed animation state`).toBe("paused");
        expect(result.running, `${style}: running animations`).toBe(0);
      }
    } finally {
      await page.close();
    }
  });

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
            document.body.innerHTML = `<div style="font-family:${webFont};font-size:12px">${html}</div>`;
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

  it("renders every compact mark at the same fixed pixel width at card and preview sizes (#0816)", async () => {
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
      const target = Number(DEFAULT_ACTIVITY_ANIMATION_SIZE);
      for (const fontPx of [9, 12]) {
        for (const style of Object.keys(STYLE_SELECTORS)) {
          const res = await page.evaluate(
            ({ html, fontPx, webFont }) => {
              document.body.innerHTML =
                `<div style="font-family:${webFont};font-size:${fontPx}px">` +
                `${html}<span id="next-label">AGENT</span></div>`;
              const mark = document.querySelector(".ai-mark")!;
              const ai = document.querySelector(".ai")!;
              return {
                markW: mark.getBoundingClientRect().width,
                aiRight: ai.getBoundingClientRect().right,
                nextLeft: document.querySelector("#next-label")!.getBoundingClientRect().left,
              };
            },
            { html: renderHtml(style, "coding"), fontPx, webFont },
          );
          // Fixed pixel width, identical at both font sizes. A 0.5px slack
          // absorbs subpixel rounding.
          expect(res.markW, `${style} @${fontPx}px (${res.markW}px vs ${target}px)`).toBeCloseTo(
            target,
            0,
          );
          expect(res.nextLeft + 0.5, `${style} @${fontPx}px label overlap`).toBeGreaterThan(
            res.aiRight,
          );
        }
      }
    } finally {
      await page.close();
    }
  });

  it("scales artwork, reserved width and the height envelope at every pixel size (#0816)", async () => {
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
      // One measurable piece of real artwork per family. A width-only
      // implementation keeps these constant; a correct one scales them with
      // the slot.
      const art: Record<
        string,
        { selector: string; pseudo: string | null; metric: "width" | "height" | "fontSize" }
      > = {
        "orbital-pixel": { selector: ".ai-orbit", pseudo: "::before", metric: "width" },
        "cursor-scan-pulse": { selector: ".ai-caret", pseudo: "::before", metric: "height" },
        "breathing-brackets": {
          selector: ".ai-bracket",
          pseudo: "::before",
          metric: "fontSize",
        },
        "micro-dot-matrix": { selector: ".ai-matrix i", pseudo: null, metric: "width" },
        "tiny-signal-bars": { selector: ".ai-bars i", pseudo: null, metric: "height" },
        "spark-diamond": { selector: ".ai-spark", pseudo: "::before", metric: "fontSize" },
        "arcade-hopper": { selector: ".ai-hopper i", pseudo: null, metric: "width" },
        "puppy-tracks": { selector: ".ai-paws i", pseudo: null, metric: "width" },
        "bird-quick-trail": { selector: ".ai-bird-quick .foot", pseudo: null, metric: "width" },
        // #0833 artwork measures its SVG, which fills the whole square slot.
        "rgb-keystorm": { selector: ".ai-art-svg", pseudo: null, metric: "width" },
        "wheelie-courier": { selector: ".ai-art-svg", pseudo: null, metric: "width" },
        "boo-swoop": { selector: ".ai-art-svg", pseudo: null, metric: "width" },
        "pumpkin-spell": { selector: ".ai-art-svg", pseudo: null, metric: "width" },
      };
      const sizes = ACTIVITY_ANIMATION_SIZES;
      for (const fontPx of [9, 12]) {
        for (const style of Object.keys(art)) {
          const htmls = sizes.map((size) => renderHtml(style, "coding", size));
          const spec = art[style]!;
          const res = await page.evaluate(
            ({ htmls, sizes, fontPx, webFont, selector, pseudo, metric, style }) => {
              return htmls.map((html, index) => {
                document.body.innerHTML =
                  `<div style="font-family:${webFont};font-size:${fontPx}px">` +
                  `${html}<span id="next-label">AGENT</span>` +
                  `<span id="ch-probe" style="display:inline-block;width:1ch"></span></div>`;
                const mark = document.querySelector(".ai-mark")!;
                const ai = document.querySelector(".ai")!;
                const node = document.querySelector(selector)!;
                const cs = pseudo ? getComputedStyle(node, pseudo) : getComputedStyle(node);
                const measured =
                  metric === "fontSize"
                    ? parseFloat(cs.fontSize)
                    : parseFloat(cs[metric as "width" | "height"]);
                const ch = document.querySelector("#ch-probe")!.getBoundingClientRect().width;
                const markRect = mark.getBoundingClientRect();
                const aiRect = ai.getBoundingClientRect();
                return {
                  style,
                  size: sizes[index],
                  ch,
                  markW: markRect.width,
                  markH: markRect.height,
                  aiH: aiRect.height,
                  aiRight: aiRect.right,
                  nextLeft: document.querySelector("#next-label")!.getBoundingClientRect().left,
                  art: measured,
                  scrollW: mark.scrollWidth,
                };
              });
            },
            {
              htmls,
              sizes,
              fontPx,
              webFont,
              selector: spec.selector,
              pseudo: spec.pseudo,
              metric: spec.metric,
              style,
            },
          );
          for (const row of res) {
            const target = Number(row.size);
            // The reserved width is exactly the chosen pixel size, whatever the
            // surrounding font — a 0.5px slack absorbs subpixel rounding.
            expect(
              row.markW,
              `${style} @${fontPx}px size ${row.size}: reserved ${row.markW}px`,
            ).toBeCloseTo(target, 0);
            // The mark must not grow outside the wrapper's reserved height.
            expect(
              row.aiH + 0.5,
              `${style} size ${row.size}: height envelope`,
            ).toBeGreaterThanOrEqual(row.markH);
            // Motion/artwork may overhang the slot by subpixel glyph bearing,
            // but never enough to hit the following label.
            expect(row.nextLeft + 0.5, `${style} size ${row.size}: label overlap`).toBeGreaterThan(
              row.aiRight,
            );
            expect(row.scrollW, `${style} size ${row.size}: horizontal clip`).toBeLessThanOrEqual(
              row.markW + 2,
            );
          }
          const first = res[0]!;
          const last = res.at(-1)!;
          // Artwork and vertical envelope grow with the setting (3× between the
          // smallest and largest). A width-only change leaves this ratio at 1.
          expect(first.art, `${style}: measurable artwork`).toBeGreaterThan(0);
          expect(last.art / first.art, `${style}: artwork scales with the setting`).toBeGreaterThan(
            2.7,
          );
          expect(last.markH / first.markH, `${style}: mark height scales`).toBeGreaterThan(2.7);
        }
      }
    } finally {
      await page.close();
    }
  });

  it("sizes the legacy dot group at fixed pixels as one unit (#0816)", async () => {
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
      const measure = async (html: string) =>
        page.evaluate(
          ({ html, webFont }) => {
            document.body.innerHTML =
              `<div style="font-family:${webFont};font-size:12px">${html}` +
              `<span id="ch-probe" style="display:inline-block;width:1ch"></span></div>`;
            const ai = document.querySelector(".ai")!;
            const dot = document.querySelector(".ai-dot")!;
            const style = getComputedStyle(dot);
            // Sample the bounce at its 40% keyframe so the jump distance is
            // measured from the real animation, not a stylesheet declaration.
            const dotAnim = dot.getAnimations()[0];
            if (dotAnim) {
              dotAnim.pause();
              dotAnim.currentTime = 0.4 * 1200;
            }
            const matrix = getComputedStyle(dot).transform;
            const ty = matrix.startsWith("matrix")
              ? Number(matrix.split(",").at(-1)?.replace(")", "").trim())
              : Number.NaN;
            return {
              groupW: ai.getBoundingClientRect().width,
              groupH: ai.getBoundingClientRect().height,
              dotW: parseFloat(style.width),
              dotH: parseFloat(style.height),
              gap: parseFloat(getComputedStyle(ai).columnGap || "0"),
              ch: document.querySelector("#ch-probe")!.getBoundingClientRect().width,
              ty,
            };
          },
          { html, webFont },
        );
      const small = await measure(renderHtml("three-dots", "coding", "8"));
      const large = await measure(renderHtml("three-dots", "coding", "24"));
      // The whole group — dots and gaps together — reserves the chosen pixel
      // width, and scales as one unit between settings (24 / 8 = 3×).
      expect(small.groupW).toBeCloseTo(8, 0);
      expect(large.groupW).toBeCloseTo(24, 0);
      expect(large.dotW / small.dotW).toBeCloseTo(3, 1);
      expect(large.dotH / small.dotH).toBeCloseTo(3, 1);
      expect(large.ty / small.ty, "bounce distance scales").toBeCloseTo(3, 1);
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
              document.body.innerHTML = `<div style="font-family:${webFont};font-size:12px">${html}</div>`;
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

  it("keeps every style static and visible under reduced motion at the largest size (#0816)", async () => {
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
      for (const style of [...Object.keys(STYLE_SELECTORS), "three-dots"]) {
        const running = await page.evaluate(
          ({ html, webFont }) => {
            document.body.innerHTML = `<div style="font-family:${webFont};font-size:12px">${html}</div>`;
            const root = document.querySelector(".ai")!;
            const rect = root.getBoundingClientRect();
            return {
              count: root.getAnimations({ subtree: true }).length,
              width: rect.width,
              height: rect.height,
            };
          },
          {
            html: renderHtml(style, "coding", String(ACTIVITY_ANIMATION_SIZE_MAX_PX)),
            webFont,
          },
        );
        expect(running.count, `${style} still animating at the largest size`).toBe(0);
        expect(running.width, `${style} static mark width`).toBeGreaterThan(0);
        expect(running.height, `${style} static mark height`).toBeGreaterThan(0);
      }
    } finally {
      await page.close();
    }
  });

  it("arcade-hopper eye cutouts reveal the surface behind the mark (#0807)", async () => {
    const page = await browser!.newPage();
    try {
      await page.goto("about:blank", { waitUntil: "load", timeout: 10_000 });
      await page.evaluate(
        ({ css }) => {
          const s = document.createElement("style");
          // Freeze the hop so the geometry we measure is not mid-transform.
          s.textContent = `${css}\n.ai-hopper i { animation: none !important; }`;
          document.head.appendChild(s);
          document.body.style.margin = "0";
        },
        { css: pageCss },
      );
      const shot = page as unknown as {
        screenshot(opts: {
          clip: { x: number; y: number; width: number; height: number };
        }): Promise<{ equals(other: unknown): boolean }>;
      };
      const fontPx = 48;
      const geom = await page.evaluate(
        ({ html, webFont, fontPx }) => {
          document.body.innerHTML = `<div style="font-family:${webFont};font-size:${fontPx}px">${html}</div>`;
          const body = document.querySelector(".ai-hopper i")!;
          const r = body.getBoundingClientRect();
          return {
            eyeX: r.left + 0.2208 * fontPx + (0.14 * r.width) / 2,
            eyeY: r.top + 0.26 * fontPx + (0.18 * r.height) / 2,
            // Midway between the two eye holes, so this point is solid body.
            bodyX: r.left + r.width * 0.5,
            bodyY: r.top + r.height * 0.5,
          };
        },
        { html: renderHtml("arcade-hopper", "coding"), webFont, fontPx },
      );
      const onePixel = (x: number, y: number) => ({
        clip: { x: Math.round(x), y: Math.round(y), width: 1, height: 1 },
      });
      const eye = await shot.screenshot(onePixel(geom.eyeX, geom.eyeY));
      const solid = await shot.screenshot(onePixel(geom.bodyX, geom.bodyY));
      // Hide the mark (keeping its layout) so the same pixels show the surface.
      await page.evaluate(() => {
        const s = document.createElement("style");
        s.textContent = ".ai-hopper i { visibility: hidden !important; }";
        document.head.appendChild(s);
      });
      const surfaceBehindEye = await shot.screenshot(onePixel(geom.eyeX, geom.eyeY));
      const surfaceBehindSolid = await shot.screenshot(onePixel(geom.bodyX, geom.bodyY));
      expect(eye.equals(surfaceBehindEye), "eye cutout should show the surface through").toBe(true);
      expect(
        solid.equals(surfaceBehindSolid),
        "the solid silhouette should paint over the surface",
      ).toBe(false);
    } finally {
      await page.close();
    }
  });

  it("#0833 artwork animates its subject and slows for reviewing/agent", async () => {
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
      for (const [style, subject] of Object.entries(ART_SUBJECTS)) {
        const read = (motion: Motion) =>
          page.evaluate(
            ({ html, webFont, selector }) => {
              document.body.innerHTML = `<div style="font-family:${webFont};font-size:12px">${html}</div>`;
              const node = document.querySelector(selector)!;
              const cs = getComputedStyle(node);
              return {
                name: cs.animationName,
                duration: parseFloat(cs.animationDuration),
                count: node.getAnimations().length,
              };
            },
            { html: renderHtml(style, motion), webFont, selector: subject.selector },
          );
        const coding = await read("coding");
        const reviewing = await read("reviewing");
        const agent = await read("agent");
        expect(coding.name, style).toBe(subject.name);
        expect(coding.count, style).toBeGreaterThan(0);
        // The 0.78× / 0.9× speed envelope means a LONGER duration than coding.
        expect(reviewing.duration, `${style} reviewing`).toBeGreaterThan(coding.duration);
        expect(agent.duration, `${style} agent`).toBeGreaterThan(coding.duration);
        expect(reviewing.duration - coding.duration, `${style} reviewing delta`).toBeGreaterThan(
          0.1,
        );
      }
    } finally {
      await page.close();
    }
  });
});
