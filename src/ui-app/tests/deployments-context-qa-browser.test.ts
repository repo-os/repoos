// @vitest-environment jsdom
/**
 * QA pass: Deployments and Context pages at 375/768/1280px (#1238). Each case
 * mounts the real view in jsdom against fixture API responses (failed deploy,
 * refused push, load failures, empty repo, very long names and logs), then
 * renders the captured markup in headless WebKit with the built global
 * stylesheet and the view's compiled scoped CSS. Every visible element must
 * stay inside the viewport and failure copy must say what happened and what
 * to do next. No live server, git remote or provider is touched.
 *
 * Set `QA_SHOTS=<dir>` to save a full-page screenshot per case and width.
 */
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { webkit, type Browser, type Page } from "@playwright/test";
import { compileStyle, parse } from "@vue/compiler-sfc";
import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { createMemoryHistory, createRouter } from "vue-router";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import DeploymentsView from "../src/views/DeploymentsView.vue";
import ContextView from "../src/views/ContextView.vue";
import { useDocsStore } from "../src/stores/docs";
import { useAuthStore } from "../src/stores/auth";
import { invalidatePageData } from "../src/composables/page-data-cache";
import { json } from "./component-test-helpers";

const VIEWPORTS = [375, 768, 1280] as const;
const uiRoot = resolve(__dirname, "..");

/** Long, unbroken identifiers: the things a real repo produces that break layouts. */
const LONG_BRANCH = "feature/an-extremely-long-branch-name-for-the-deployments-qa-pass-0123456789";
const LONG_SERVICE = "Marketing site with an unexpectedly long service name for overflow checks";
const LONG_URL =
  "https://marketing-site-with-an-unbroken-hostname-that-keeps-going.example.workers.dev/some/really/long/path/segment";
const LONG_TOKEN = `https://example.test/${"segment-".repeat(40)}`;
const LONG_DOC_PATH = `docs/${"nested-folder/".repeat(6)}a-very-long-document-name-that-never-breaks.md`;

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

/* ── Fixtures ─────────────────────────────────────────────────────────────── */

type Reply = {
  ok: boolean;
  status: number;
  statusText: string;
  json: () => Promise<unknown>;
  text: () => Promise<string>;
};

function reply(status: number, body: unknown): Reply {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status >= 400 ? "Error" : "OK",
    json: async () => (typeof body === "string" ? JSON.parse(body) : body),
    text: async () => text,
  };
}

function deploymentsStatus(overrides: Record<string, unknown> = {}) {
  return {
    enabled: true,
    dirty: false,
    currentBranch: "main",
    root: "/repo",
    rows: [
      {
        name: `${LONG_SERVICE} (prod)`,
        service: LONG_SERVICE,
        branch: "main",
        provider: "cloudflare-workers-enterprise-edition-regional",
        url: LONG_URL,
        dashboardUrl: "https://dash.example.test/workers/services/view/marketing-site",
        subdir: "apps/marketing/site/with/a/deeply/nested/path/segment",
        environmentConsumer: "deployment:marketing-site-prod",
        environment: "staging-eu-west-prod-with-a-long-environment-name",
        environmentError: `Environment "staging-eu-west-prod-with-a-long-environment-name" is missing SUPER_LONG_SECRET_NAME_THAT_NEVER_BREAKS for this service.`,
        lastPushAt: new Date(Date.now() - 3 * 3600_000).toISOString(),
        lastPushSha: "a1b2c3d4e5f6",
        changesVsMain: { aheadOfMain: 3, behindMain: 12 },
      },
      {
        name: `${LONG_SERVICE} (dev)`,
        service: LONG_SERVICE,
        branch: LONG_BRANCH,
        provider: "cloudflare-workers-enterprise-edition-regional",
        url: null,
        dashboardUrl: null,
        subdir: "apps/marketing/site",
        environmentConsumer: "deployment:marketing-site-dev",
        environment: null,
        environmentError: null,
        lastPushAt: null,
        lastPushSha: null,
        changesVsMain: null,
      },
    ],
    branches: [
      {
        branch: "main",
        ahead: 0,
        behind: 0,
        hasOrigin: true,
        localExists: true,
        ffFrom: LONG_BRANCH,
        mainSync: { state: "diverged", aheadOfMain: 3, behindMain: 12 },
      },
      {
        branch: LONG_BRANCH,
        ahead: 4,
        behind: 0,
        hasOrigin: false,
        localExists: true,
        ffFrom: null,
        mainSync: { state: "unknown", aheadOfMain: 0, behindMain: 0 },
      },
    ],
    environments: [{ id: "dev" }, { id: "staging-eu-west-prod-with-a-long-environment-name" }],
    ...overrides,
  };
}

/** What git prints when a fast-forward is refused, with an unbroken ref and a long hint. */
const REFUSED_PUSH_OUTPUT = [
  `Could not fast-forward main to origin/${LONG_BRANCH} — the branches have diverged, so the deploy was refused rather than force-pushed.`,
  `! [rejected] main -> ${LONG_BRANCH} (non-fast-forward)`,
  `hint: ${"Updates were rejected because the tip of your current branch is behind ".repeat(3)}`,
  `remote: ${"x".repeat(220)}`,
].join("\n");

/* ── Shared WebKit harness ────────────────────────────────────────────────── */

describe.skipIf(!existsSync(webkit.executablePath()))(
  "Deployments and Context QA at 375/768/1280 (WebKit, fixtures)",
  () => {
    let browser: Browser;
    let globalCss: string;

    beforeAll(async () => {
      browser = await webkit.launch();
      const assetDir = resolve(uiRoot, "../../dist/ui/assets");
      const cssAsset = (await readdir(assetDir)).find((name) => /^index-.*\.css$/.test(name));
      if (!cssAsset) throw new Error("Built global UI stylesheet was not found");
      globalCss = await readFile(resolve(assetDir, cssAsset), "utf8");
    });
    afterAll(async () => {
      await browser?.close();
    });

    /** Compiled scoped CSS of one view, scoped to the scope id its root carries. */
    function scopedCss(markup: string, rootMarker: string, sfc: string): string {
      const source = readFileSync(resolve(uiRoot, sfc), "utf8");
      const style = parse(source, { filename: sfc }).descriptor.styles[0]?.content ?? "";
      const marker = markup.indexOf(rootMarker);
      if (marker < 0) throw new Error(`${sfc} markup is missing ${rootMarker}`);
      const tag = markup.slice(markup.lastIndexOf("<", marker), markup.indexOf(">", marker));
      const scopeId = tag.match(/data-v-[a-f0-9]+/)?.[0];
      if (!scopeId) throw new Error(`${sfc} scope ID was not present on ${rootMarker}`);
      const compiled = compileStyle({ filename: sfc, id: scopeId, source: style });
      if (compiled.errors.length) throw compiled.errors[0]!;
      return compiled.code;
    }

    async function openFixturePage(
      label: string,
      markup: string,
      scoped: string,
      width: number,
    ): Promise<Page> {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      await page.setViewportSize({ width, height: 900 });
      await page.setContent(
        `<meta name="viewport" content="width=device-width, initial-scale=1.0">` +
          `<style>${globalCss}</style><style>${scoped}</style>` +
          `<style>html, body { width: 100%; margin: 0; } *, *::before, *::after { animation: none !important; transition: none !important; }</style>` +
          `<div class="app-shell"><div class="body"><div class="main">${markup}</div></div></div>`,
      );
      const shots = process.env.QA_SHOTS;
      if (shots) {
        mkdirSync(shots, { recursive: true });
        await page.screenshot({ path: resolve(shots, `${label}-${width}.png`), fullPage: true });
      }
      return page;
    }

    /** Every visible element must sit inside the viewport, and no page box may
     *  clip its own text sideways. A horizontal scroller is only acceptable for
     *  code blocks and tables, which are built to scroll; anywhere else the
     *  long content must wrap inside its box, not hide off to the side. */
    async function audit(page: Page): Promise<{ documentWidth: number; overflowers: string[] }> {
      return page.evaluate(() => {
        const vw = window.innerWidth;
        const describe = (el: HTMLElement): string =>
          `${el.tagName.toLowerCase()}${el.className && typeof el.className === "string" ? `.${el.className.trim().split(/\s+/).join(".")}` : ""}`;
        const overflowers: string[] = [];
        for (const el of document.body.querySelectorAll<HTMLElement>("*")) {
          const style = getComputedStyle(el);
          if (style.display === "none" || style.visibility === "hidden") continue;
          const details = el.closest("details");
          if (details && !details.open) continue;
          if (!el.offsetParent && style.position !== "fixed") continue;
          const rect = el.getBoundingClientRect();
          if (rect.width === 0 || rect.height === 0) continue;
          const inDesignedScroller = el.closest("pre, .md-table-wrap") !== null;
          if (!inDesignedScroller && (rect.right > vw + 1 || rect.left < -1)) {
            overflowers.push(
              `${describe(el)} at ${Math.round(rect.left)}..${Math.round(rect.right)}`,
            );
          }
          const scrolls = style.overflowX === "auto" || style.overflowX === "scroll";
          const codeOrTable = el.closest("pre") !== null || el.querySelector("table") !== null;
          if (scrolls && !codeOrTable && el.scrollWidth > el.clientWidth + 1) {
            overflowers.push(
              `${describe(el)} clips ${el.scrollWidth - el.clientWidth}px sideways (scroll width ${el.scrollWidth})`,
            );
          }
        }
        return { documentWidth: document.documentElement.scrollWidth, overflowers };
      });
    }

    async function expectFits(page: Page, what: string, width: number): Promise<void> {
      const result = await audit(page);
      expect(result.overflowers, `${what} at ${width}px has off-viewport elements`).toEqual([]);
      expect(result.documentWidth, `${what} at ${width}px widens the document`).toBeLessThanOrEqual(
        width + 1,
      );
    }

    /** Text of the first match, or a visible "missing" marker: a missing element
     *  fails the assertion at once instead of Playwright waiting out its timeout. */
    async function textOf(page: Page, selector: string): Promise<string> {
      const locator = page.locator(selector);
      if ((await locator.count()) === 0) return `<no ${selector}>`;
      return (await locator.first().textContent()) ?? "";
    }

    /* ── Deployments ──────────────────────────────────────────────────────── */

    /** Mounts the real Deployments view against `respond`, optionally driving the
     *  deploy confirm flow, and returns the captured markup. */
    async function captureDeployments(
      respond: (url: string, init?: RequestInit) => Reply,
      options: { admin?: boolean; deploy?: boolean } = {},
    ): Promise<string> {
      invalidatePageData("deployments");
      vi.stubGlobal(
        "fetch",
        vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => respond(String(input), init)),
      );
      const pinia = createPinia();
      setActivePinia(pinia);
      useAuthStore().role = options.admin ? "admin" : "member";
      const wrapper = mount(DeploymentsView, {
        attachTo: document.body,
        global: { plugins: [pinia], stubs: { PageSkeleton: true } },
      });
      await flushPromises();
      if (options.deploy) {
        // `main` is blocked by its environment error, so the first enabled deploy wins.
        document.querySelector<HTMLButtonElement>(".dep-branch button:not([disabled])")?.click();
        await flushPromises();
        document.querySelector<HTMLButtonElement>(".dep-modal-actions button")?.click();
        await flushPromises();
      }
      const markup = document.body.innerHTML;
      wrapper.unmount();
      document.body.innerHTML = "";
      return markup;
    }

    const deployRoutes = (
      status: unknown,
      deployResult?: Reply,
    ): ((url: string, init?: RequestInit) => Reply) => {
      return (url, init) => {
        if (url.startsWith("/api/deployments/deploy")) {
          return deployResult ?? reply(200, { ok: true, output: "Pushed." });
        }
        if (url.startsWith("/api/deployments")) return reply(200, status);
        if (url.startsWith("/api/project-environments")) return reply(200, { environments: [] });
        return reply(200, {});
      };
    };

    describe("Deployments", () => {
      it.each(VIEWPORTS)(
        "long service, branch and log data stays in its boxes at %spx",
        async (width) => {
          const markup = await captureDeployments(deployRoutes(deploymentsStatus()), {
            admin: true,
          });
          const page = await openFixturePage(
            "deployments-long",
            markup,
            scopedCss(markup, 'class="dep-page', "src/views/DeploymentsView.vue"),
            width,
          );
          try {
            await expectFits(page, "deployments with long names and URLs", width);
          } finally {
            await page.close();
          }
        },
      );

      it.each(VIEWPORTS)(
        "a refused push explains the cause and the next step at %spx",
        async (width) => {
          const markup = await captureDeployments(
            deployRoutes(
              deploymentsStatus(),
              reply(409, { ok: false, error: REFUSED_PUSH_OUTPUT, output: REFUSED_PUSH_OUTPUT }),
            ),
            { admin: true, deploy: true },
          );
          const page = await openFixturePage(
            "deployments-refused-push",
            markup,
            scopedCss(markup, 'class="dep-page', "src/views/DeploymentsView.vue"),
            width,
          );
          try {
            await expectFits(page, "refused-push deploy dialog", width);
            const hint = await textOf(page, ".dep-modal-error .dep-fail-hint");
            expect(hint).toMatch(/different commits/i);
            expect(hint).toMatch(/never force-pushes/i);
          } finally {
            await page.close();
          }
        },
      );

      it.each(VIEWPORTS)("a failed status load says what to do next at %spx", async (width) => {
        const markup = await captureDeployments((url) =>
          url.startsWith("/api/deployments")
            ? reply(500, { error: "Could not read the git status of the checkout." })
            : reply(200, { environments: [] }),
        );
        const page = await openFixturePage(
          "deployments-load-failed",
          markup,
          scopedCss(markup, 'class="dep-page', "src/views/DeploymentsView.vue"),
          width,
        );
        try {
          await expectFits(page, "deployments load failure", width);
          expect(await textOf(page, ".dep-err")).toMatch(/Could not read the git status/);
          expect(await textOf(page, ".dep-err-hint")).toMatch(/Refresh/);
        } finally {
          await page.close();
        }
      });

      it.each(VIEWPORTS)(
        "an unconfigured repo says how to turn deployments on at %spx",
        async (width) => {
          const markup = await captureDeployments(
            deployRoutes({ enabled: false, rows: [], branches: [] }),
          );
          const page = await openFixturePage(
            "deployments-unconfigured",
            markup,
            scopedCss(markup, 'class="dep-page', "src/views/DeploymentsView.vue"),
            width,
          );
          try {
            await expectFits(page, "unconfigured deployments", width);
            expect(await textOf(page, ".dep-empty")).toMatch(/\[\[deployments\]\]/);
          } finally {
            await page.close();
          }
        },
      );

      it.each(VIEWPORTS)("a configured repo with no targets says so at %spx", async (width) => {
        const markup = await captureDeployments(
          deployRoutes({
            enabled: true,
            dirty: false,
            currentBranch: "main",
            root: "/repo",
            rows: [],
            branches: [],
            environments: [],
          }),
        );
        const page = await openFixturePage(
          "deployments-empty",
          markup,
          scopedCss(markup, 'class="dep-page', "src/views/DeploymentsView.vue"),
          width,
        );
        try {
          await expectFits(page, "configured deployments with no targets", width);
          expect(await textOf(page, ".dep-empty-targets")).toMatch(/no deployment targets/i);
        } finally {
          await page.close();
        }
      });
    });

    /* ── Context ──────────────────────────────────────────────────────────── */

    /** Mounts the real Context view at `path` against `respond` and returns its
     *  markup. The app loads docs and skills at startup (App.vue), so the harness
     *  does the same before mounting; `tabLabel` clicks a tab after mount, the
     *  way a reader would reach the Skills.sh catalog. */
    async function captureContext(
      path: string,
      respond: (url: string) => Reply | string,
      tabLabel?: string,
    ): Promise<string> {
      vi.stubGlobal(
        "fetch",
        vi.fn(async (input: RequestInfo | URL) => {
          const url = String(input);
          if (url.startsWith("/api/")) return respond(url) as Reply;
          // The docs store fetches a doc or skill by its relative path.
          const body = respond(url);
          return typeof body === "string" ? reply(200, body) : (body as Reply);
        }),
      );
      const pinia = createPinia();
      setActivePinia(pinia);
      const docsStore = useDocsStore();
      await docsStore.loadDocs();
      await docsStore.loadSkills();
      const router = createRouter({
        history: createMemoryHistory(),
        routes: [{ path: "/repo", component: { template: "<div />" } }],
      });
      await router.push(path);
      await router.isReady();
      const wrapper = mount(ContextView, {
        attachTo: document.body,
        global: {
          plugins: [pinia, router],
          stubs: {
            teleport: true,
            SearchOverlay: true,
            NewDocPanel: true,
            NewSkillPanel: true,
            RepoHistoryPanel: true,
          },
        },
      });
      await flushPromises();
      if (tabLabel) {
        [...document.querySelectorAll<HTMLButtonElement>(".ctx-tab")]
          .find((tab) => tab.textContent?.trim() === tabLabel)
          ?.click();
      }
      await flushPromises();
      await new Promise((r) => setTimeout(r, 0));
      const markup = document.body.innerHTML;
      wrapper.unmount();
      document.body.innerHTML = "";
      return markup;
    }

    const CONTEXT_SCOPE = { marker: 'id="context-top"', sfc: "src/views/ContextView.vue" };
    const longDocBody = [
      "# " + "A very long document title that keeps going without a break ".repeat(3),
      "",
      `Reference: ${LONG_TOKEN}`,
      "",
      "```text",
      "x".repeat(600),
      "```",
      "",
      "| column | value |",
      "| --- | --- |",
      `| ${"y".repeat(300)} | ok |`,
    ].join("\n");

    describe("Context", () => {
      it.each(VIEWPORTS)(
        "a long doc path and unbroken content stay in the doc box at %spx",
        async (width) => {
          const markup = await captureContext("/repo", (url) => {
            if (url.startsWith("/api/docs")) {
              return reply(200, [
                { path: LONG_DOC_PATH, title: "Long doc", mtimeMs: Date.now() },
                { path: "docs/short.md", title: "Short", mtimeMs: Date.now() },
              ]);
            }
            if (url.startsWith("/api/")) return reply(200, []);
            return longDocBody;
          });
          const page = await openFixturePage(
            "context-long-doc",
            markup,
            scopedCss(markup, CONTEXT_SCOPE.marker, CONTEXT_SCOPE.sfc),
            width,
          );
          try {
            await expectFits(page, "context doc with a long path and long content", width);
          } finally {
            await page.close();
          }
        },
      );

      it.each(VIEWPORTS)("a failed docs load offers a retry at %spx", async (width) => {
        const markup = await captureContext("/repo", (url) =>
          url.startsWith("/api/docs") ? reply(500, { error: "docs index failed" }) : reply(200, []),
        );
        const page = await openFixturePage(
          "context-docs-failed",
          markup,
          scopedCss(markup, CONTEXT_SCOPE.marker, CONTEXT_SCOPE.sfc),
          width,
        );
        try {
          await expectFits(page, "context docs load failure", width);
          expect(await textOf(page, ".ctx-load-error")).toMatch(
            /Could not load docs\. Try again\./,
          );
          expect(await page.locator(".ctx-load-error button").count()).toBe(1);
        } finally {
          await page.close();
        }
      });

      it.each(VIEWPORTS)("an empty docs repo says what to add at %spx", async (width) => {
        const markup = await captureContext("/repo", (url) =>
          url.startsWith("/api/docs") ? reply(200, []) : reply(200, []),
        );
        const page = await openFixturePage(
          "context-docs-empty",
          markup,
          scopedCss(markup, CONTEXT_SCOPE.marker, CONTEXT_SCOPE.sfc),
          width,
        );
        try {
          await expectFits(page, "empty context docs", width);
          expect(await textOf(page, ".ctx-empty")).toMatch(/No docs found\..*docs\//);
        } finally {
          await page.close();
        }
      });

      it.each(VIEWPORTS)("a doc that fails to open says what to do at %spx", async (width) => {
        const markup = await captureContext("/repo", (url) => {
          if (url.startsWith("/api/docs"))
            return reply(200, [{ path: "docs/broken.md", title: "Broken", mtimeMs: 1 }]);
          if (url.startsWith("/api/")) return reply(200, []);
          return reply(404, "not found");
        });
        const page = await openFixturePage(
          "context-doc-failed",
          markup,
          scopedCss(markup, CONTEXT_SCOPE.marker, CONTEXT_SCOPE.sfc),
          width,
        );
        try {
          await expectFits(page, "context doc that failed to open", width);
          expect(await textOf(page, ".doc-view")).toMatch(
            /could not be loaded.*Pick another doc/is,
          );
        } finally {
          await page.close();
        }
      });

      it.each(VIEWPORTS)("a failed Skills.sh catalog says what to do at %spx", async (width) => {
        const markup = await captureContext(
          "/repo",
          (url) =>
            url.startsWith("/api/skill-registry")
              ? reply(502, { error: "Skills.sh is unavailable" })
              : reply(200, []),
          "Discover",
        );
        const page = await openFixturePage(
          "context-registry-failed",
          markup,
          scopedCss(markup, CONTEXT_SCOPE.marker, CONTEXT_SCOPE.sfc),
          width,
        );
        try {
          await expectFits(page, "context Skills.sh failure", width);
          expect(await textOf(page, ".ctx-refresh-error")).toMatch(/Skills\.sh is unavailable/);
          expect(await textOf(page, ".ctx-error-next")).toMatch(/Try again/);
        } finally {
          await page.close();
        }
      });

      it.each(VIEWPORTS)(
        "long skill names and descriptions stay in their rows at %spx",
        async (width) => {
          const longSkill = {
            name: `skills/${"very-long-skill-name-".repeat(6)}`,
            description: `${"A description with no spaces at all ".repeat(4)}`,
            path: `skills/${"very-long-skill-name-".repeat(6)}/SKILL.md`,
          };
          const markup = await captureContext("/repo?tab=skills", (url) => {
            if (url.startsWith("/api/skills")) return reply(200, [longSkill]);
            if (url.startsWith("/api/")) return reply(200, []);
            return "---\nname: long\n---\n# Skill";
          });
          const page = await openFixturePage(
            "context-long-skills",
            markup,
            scopedCss(markup, CONTEXT_SCOPE.marker, CONTEXT_SCOPE.sfc),
            width,
          );
          try {
            await expectFits(page, "context skills with long names", width);
          } finally {
            await page.close();
          }
        },
      );

      it.each(VIEWPORTS)("the header and tab row fit at %spx", async (width) => {
        const markup = await captureContext("/repo", (url) =>
          url.startsWith("/api/docs")
            ? reply(200, [{ path: "docs/a.md", title: "A", mtimeMs: 1 }])
            : reply(200, []),
        );
        const page = await openFixturePage(
          "context-header",
          markup,
          scopedCss(markup, CONTEXT_SCOPE.marker, CONTEXT_SCOPE.sfc),
          width,
        );
        try {
          await expectFits(page, "context header and tabs", width);
        } finally {
          await page.close();
        }
      });
    });
  },
);
