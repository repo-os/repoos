// @vitest-environment node
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { webkit, type Browser } from "@playwright/test";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const css = readFileSync(resolve(__dirname, "../src/style.css"), "utf8").replace(
  '@import "tailwindcss";',
  "",
);

describe.skipIf(!existsSync(webkit.executablePath()))("page fade reduced motion (WebKit)", () => {
  let browser: Browser | undefined;

  beforeAll(async () => {
    browser = await webkit.launch();
  });

  afterAll(async () => {
    await browser?.close();
  });

  it("uses the short opacity fade normally and disables it for reduced motion", async () => {
    const page = await browser!.newPage();
    try {
      await page.setContent(`<style>${css}</style><div class="page-fade-enter-active">Page</div>`);
      const transition = async () =>
        page.locator(".page-fade-enter-active").evaluate((element) => {
          const style = getComputedStyle(element);
          return { property: style.transitionProperty, duration: style.transitionDuration };
        });

      await page.emulateMedia({ reducedMotion: "no-preference" });
      expect(await transition()).toEqual({ property: "opacity", duration: "0.12s" });

      await page.emulateMedia({ reducedMotion: "reduce" });
      const reducedTransition = await transition();
      expect(reducedTransition.property).toBe("none");
      expect(Number.parseFloat(reducedTransition.duration)).toBeLessThanOrEqual(0.001);
    } finally {
      await page.close();
    }
  });
});
