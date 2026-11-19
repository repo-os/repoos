// @vitest-environment jsdom
/**
 * #1248 — QA pass: New input uploads with large, wrong-type and failing files at
 * 375 / 768 / 1280 px.
 *
 * The New input panel is mounted with the real components in jsdom, seeded with
 * fixture picks and mocked upload failures (no network, no real files beyond
 * tiny in-memory blobs). The serialized markup is then injected into headless
 * WebKit with the built global stylesheet. Each width must have no off-viewport
 * elements and no clipped controls, including a very long unbroken file name.
 *
 * Set `QA_SHOTS=<dir>` to save a screenshot per fixture and width.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { webkit, type Browser, type Page } from "@playwright/test";
import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { nextTick } from "vue";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import NewInputPanel from "../src/components/NewInputPanel.vue";
import { useRepoStore } from "../src/stores/repo";
import { useUiStore } from "../src/stores/ui";

const VIEWPORTS = [375, 768, 1280] as const;
const uiRoot = resolve(__dirname, "..");

const PNG_1PX =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

/** The built global stylesheet: the dialog, drawer and pending-file rows are all
 *  global CSS in style.css, so the bundle carries everything the panel needs. */
function builtGlobalCss(): string {
  const dir = resolve(uiRoot, "../../dist/ui/assets");
  let files: string[];
  try {
    files = readdirSync(dir).filter((f) => f.endsWith(".css") && f.startsWith("index-"));
  } catch {
    throw new Error(
      "dist/ui/assets was not found — run `bun run build:ui` before the QA browser tests",
    );
  }
  if (!files.length)
    throw new Error("Built global UI stylesheet was not found — run `bun run build:ui`");
  return files.map((f) => readFileSync(resolve(dir, f), "utf8")).join("\n");
}

/** A tiny in-memory image pick. Size is set explicitly so the size rule can run. */
function pick(name: string, size = 1024, type = "image/png"): File {
  return new File([new Uint8Array(size)], name, { type });
}

/** Mount the real panel after `setup` seeds the store, and return its markup. */
async function mountPanel(
  setup: (ui: ReturnType<typeof useUiStore>, repo: ReturnType<typeof useRepoStore>) => void,
): Promise<string> {
  const pinia = createPinia();
  setActivePinia(pinia);
  const ui = useUiStore();
  const repo = useRepoStore();
  ui.openNewInput();
  ui.inputText = "Upload hangs on the Settings page after a big screenshot";
  setup(ui, repo);
  await vi.waitFor(() => expect(ui.inputScreenshots.every((s) => s.dataUrl !== "")).toBe(true));
  const wrapper = mount(NewInputPanel, {
    global: { plugins: [pinia], stubs: { teleport: true, Transition: true } },
  });
  await flushPromises();
  await nextTick();
  return wrapper.html();
}

/* ── Fixtures ────────────────────────────────────────────────────────────── */

/** Picks a person would really make: one long unbroken name, one duplicate that
 *  is renamed, and a PDF that is rejected with a notice. */
async function pickedFixture(): Promise<string> {
  return mountPanel((ui) => {
    ui.addInputScreenshots([
      pick("login-error-after-a-long-session-on-the-staging-environment-2026-03-14.png"),
      pick("shot.png"),
      pick("shot.png"),
      pick("spec.pdf", 2048, "application/pdf"),
    ]);
  });
}

/** A large capture from an earlier input failed to upload and is waiting for a
 *  retry or dismissal in the follow-up region. */
async function failedUploadFixture(): Promise<string> {
  return mountPanel((_ui, repo) => {
    repo.inputAttachmentUploads.push({
      batchId: "batch-earlier",
      inputId: "0042",
      attachment: {
        name: "very-large-capture-from-the-customer-call-and-the-long-follow-up.png",
        mime: "image/png",
        dataUrl: PNG_1PX,
        size: 12 * 1024 * 1024,
        uploadPhase: "failed",
        uploadError: "The image is too large (max 10 MB). Crop or compress it, then add it again.",
      },
    });
  });
}

/* ── Browser audit ───────────────────────────────────────────────────────── */

describe.skipIf(!existsSync(webkit.executablePath()))(
  "#1248 New input uploads QA at 375/768/1280 (WebKit, fixtures)",
  () => {
    let browser: Browser;
    let css: string;

    beforeAll(async () => {
      browser = await webkit.launch();
      css = builtGlobalCss();
    });
    afterAll(async () => {
      await browser?.close();
    });

    async function openFixturePage(label: string, markup: string, width: number): Promise<Page> {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      await page.setContent(
        `<meta name="viewport" content="width=device-width, initial-scale=1.0">` +
          `<style>${css}</style>` +
          `<style>html, body { width: 100%; margin: 0; } *, *::before, *::after { animation: none !important; transition: none !important; }</style>` +
          `<div class="app-shell"><div class="body"><div class="main">${markup}</div></div></div>`,
      );
      const shots = process.env.QA_SHOTS;
      if (shots) {
        mkdirSync(shots, { recursive: true });
        await page.screenshot({
          path: resolve(shots, `new-input-${label}-${width}.png`),
          fullPage: true,
        });
      }
      return page;
    }

    /** Off-viewport elements and controls clipped by a scroll box. Mirrors the
     *  stories QA audit so both pages hold the same bar. */
    async function audit(page: Page): Promise<{
      documentWidth: number;
      overflowers: string[];
      clippedControls: string[];
    }> {
      return page.evaluate(() => {
        const vw = window.innerWidth;
        const describe = (el: Element): string =>
          `${el.tagName.toLowerCase()}${el.className ? `.${String(el.className).split(" ").join(".")}` : ""}`;
        const visible = (el: HTMLElement): boolean => {
          const s = getComputedStyle(el);
          if (s.display === "none" || s.visibility === "hidden") return false;
          if (!el.offsetParent && s.position !== "fixed") return false;
          const r = el.getBoundingClientRect();
          return r.width > 0 && r.height > 0;
        };
        const overflowers: string[] = [];
        for (const el of document.body.querySelectorAll<HTMLElement>("*")) {
          if (!visible(el)) continue;
          const r = el.getBoundingClientRect();
          if (r.right > vw + 1 || r.left < -1) {
            overflowers.push(`${describe(el)} at ${Math.round(r.left)}..${Math.round(r.right)}`);
          }
        }
        const clippedControls: string[] = [];
        for (const el of document.body.querySelectorAll<HTMLElement>(
          "button, a[href], input, textarea",
        )) {
          if (!visible(el)) continue;
          const r = el.getBoundingClientRect();
          for (let p = el.parentElement; p; p = p.parentElement) {
            const ps = getComputedStyle(p);
            if (/(auto|scroll|hidden|clip)/.test(ps.overflowX)) {
              const box = p.getBoundingClientRect();
              if (r.left < box.left - 1 || r.right > box.right + 1) {
                clippedControls.push(
                  `${describe(el)} "${(el.textContent ?? "").trim().slice(0, 30)}" clipped by ${describe(p)}`,
                );
                break;
              }
            }
            if (ps.position === "fixed") break;
          }
        }
        return {
          documentWidth: document.documentElement.scrollWidth,
          overflowers,
          clippedControls,
        };
      });
    }

    async function expectFits(page: Page, what: string, width: number): Promise<void> {
      const result = await audit(page);
      expect(result.overflowers, `${what} at ${width}px has off-viewport elements`).toEqual([]);
      expect(result.clippedControls, `${what} at ${width}px clips a control`).toEqual([]);
      expect(result.documentWidth, `${what} at ${width}px widens the document`).toBeLessThanOrEqual(
        width + 1,
      );
    }

    it.each(VIEWPORTS)("picked screenshots, notices and a long name fit at %spx", async (width) => {
      const markup = await pickedFixture();
      expect(markup).toContain("“spec.pdf” isn’t an image we can attach");
      expect(markup).toContain("saved as “shot-2.png”");
      const page = await openFixturePage("picked", markup, width);
      try {
        await expectFits(page, "picked screenshots", width);
        const notices = await page.locator(".ff-upload-notices").innerText();
        expect(notices).toContain("Dismiss");
      } finally {
        await page.close();
      }
    });

    it.each(VIEWPORTS)("failed upload follow-up fits at %spx with a retry path", async (width) => {
      const markup = await failedUploadFixture();
      expect(markup).toContain("Attachment uploads");
      const page = await openFixturePage("failed-upload", markup, width);
      try {
        await expectFits(page, "failed upload follow-up", width);
      } finally {
        await page.close();
      }
    });
  },
);
