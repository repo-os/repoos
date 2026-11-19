// @vitest-environment jsdom
/**
 * #1234 — QA pass: Stats, Dev and activity-log pages at 375/768/1280px.
 *
 * Covers the three data-heavy surfaces with long-row / long-line fixtures:
 *
 *  - Stats (Mission Control): `SystemResourcePanel` — sparkline charts, the
 *    process table, top processes, serve/orphan chips, the pressure banner and
 *    the worktree GC preview with long worktree paths — and `UsagePanel` —
 *    usage tables and the recent-failures grid with long failure reasons.
 *  - Dev: `DevView` — long target names, commands, URLs, artifact paths,
 *    port-holder commands, per-service rows and expanded log bodies.
 *  - Activity log: `FeedPanel` — the live activity feed with long unbroken
 *    tokens (error paths pasted verbatim) — and `RepoHistoryPanel` (Context →
 *    History), the commit activity log with long subjects, deep file paths
 *    and an expanded commit detail.
 *
 * The real components are mounted in jsdom, their markup plus the real built
 * global stylesheet and compiled scoped styles are rendered in headless
 * WebKit, and every visible element must stay inside the viewport at every
 * width. Tables may scroll inside their own box; the page itself never
 * widens.
 *
 * Set `QA_SHOTS=<dir>` to save a full-page screenshot per fixture and width.
 */
import { resolve } from "node:path";
import { mkdirSync, readFileSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { webkit, type Browser, type Page } from "@playwright/test";
import { compileStyle, parse } from "@vue/compiler-sfc";
import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import SystemResourcePanel from "../src/components/SystemResourcePanel.vue";
import UsagePanel from "../src/components/UsagePanel.vue";
import FeedPanel from "../src/components/FeedPanel.vue";
import RepoHistoryPanel from "../src/components/RepoHistoryPanel.vue";
import DevView from "../src/views/DevView.vue";
import { useRepoStore, type FeedItem } from "../src/stores/repo";
import { useConfigStore } from "../src/stores/config";
import { invalidatePageData } from "../src/composables/page-data-cache";
import type { HistoryCommit } from "../src/lib/repo-history";
import { json } from "./component-test-helpers";
import type { BoardUsageStats, DevTargetView, SystemStats } from "../src/types.js";

vi.mock("vue-router", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

const VIEWPORTS = [375, 768, 1280] as const;
const uiRoot = resolve(__dirname, "..");

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.innerHTML = "";
  localStorage.clear();
});

/* ── Shared WebKit harness ──────────────────────────────────────────────── */

describe("Stats, Dev and activity-log pages QA at 375/768/1280 (WebKit, fixtures)", () => {
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

  /** Compiled scoped CSS for one component, with the scope id its markup carries. */
  function scopedCss(markup: string, markerClass: string, file: string): string {
    const source = readFileSync(resolve(uiRoot, `src/${file}.vue`), "utf8");
    const parsed = parse(source, { filename: file });
    const style = parsed.descriptor.styles[0]?.content ?? "";
    const marker = markup.indexOf(markerClass);
    if (marker < 0) throw new Error(`${file} markup is missing .${markerClass}`);
    const tagStart = markup.lastIndexOf("<", marker);
    const tag = markup.slice(tagStart, markup.indexOf(">", marker));
    const scopeId = tag.match(/data-v-[a-f0-9]+/)?.[0];
    if (!scopeId) throw new Error(`${file} scope ID was not present on .${markerClass}`);
    const compiled = compileStyle({ filename: file, id: scopeId, source: style });
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
        `<div class="app-shell"><div class="body"><aside class="sidebar"><nav>Navigation</nav></aside><div class="main">${markup}</div></div></div>`,
    );
    const shots = process.env.QA_SHOTS;
    if (shots) {
      mkdirSync(shots, { recursive: true });
      await page.screenshot({
        path: resolve(shots, `${label}-${width}.png`),
        fullPage: true,
      });
    }
    return page;
  }

  /** Every visible element must sit inside the viewport, except content that
   *  a horizontal scroller legitimately clips. */
  async function audit(page: Page): Promise<{ documentWidth: number; overflowers: string[] }> {
    return page.evaluate(() => {
      const vw = window.innerWidth;
      const inHorizontalScroller = (start: Element | null): boolean => {
        for (let el: HTMLElement | null = start as HTMLElement; el; el = el.parentElement) {
          const s = getComputedStyle(el);
          if (
            (s.overflowX === "auto" || s.overflowX === "scroll") &&
            el.scrollWidth > el.clientWidth + 1
          )
            return true;
        }
        return false;
      };
      const overflowers: string[] = [];
      for (const el of document.body.querySelectorAll<HTMLElement>("*")) {
        const style = getComputedStyle(el);
        if (style.display === "none" || style.visibility === "hidden") continue;
        if (!el.offsetParent && style.position !== "fixed") continue;
        if (inHorizontalScroller(el)) continue;
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) continue;
        if (rect.right > vw + 1 || rect.left < -1) {
          overflowers.push(
            `${el.tagName.toLowerCase()}${el.className ? `.${String(el.className).split(" ").join(".")}` : ""} at ${Math.round(rect.left)}..${Math.round(rect.right)}`,
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

  async function textOf(page: Page, selector: string): Promise<string> {
    // A bounded wait: a missing target should fail fast with a clear error,
    // not eat the whole 30s test timeout (Playwright auto-waits forever).
    try {
      return (await page.locator(selector).first().textContent({ timeout: 3000 })) ?? "";
    } catch {
      throw new Error(`textOf: no element matched ${selector}`);
    }
  }

  /* ── 1. System Resources panel (stats: charts + long process rows) ─────── */

  const LONG_PATH =
    "/Users/nick/code/nick/repoos-worktrees/feat/qa-pass-stats-dev-and-activity-log-pages-with-a-very-long-directory-name";

  function systemStatsFixture(): SystemStats {
    return {
      machine: {
        cpuCount: 12,
        totalMem: 32 * 1024 ** 3,
        freeMem: 3 * 1024 ** 3,
        availableMem: 9 * 1024 ** 3,
        loadavg: [14.2, 11.7, 9.3],
        platform: "darwin",
      },
      totals: { cpuPercent: 87.5, memBytes: 19 * 1024 ** 3, memPercent: 59.4 },
      processes: [
        {
          pid: 4812,
          taskId: "1234",
          cpuPercent: 87.5,
          memBytes: 3 * 1024 ** 3,
          elapsed: "3:42:17",
          orphaned: false,
          unverified: false,
        },
        {
          pid: 99187,
          taskId: null,
          cpuPercent: 42,
          memBytes: 1.5 * 1024 ** 3,
          elapsed: "127:05:53",
          orphaned: true,
          unverified: false,
        },
        {
          pid: 4242,
          taskId: null,
          cpuPercent: 0.5,
          memBytes: 80 * 1024 ** 2,
          elapsed: "0:03",
          orphaned: false,
          unverified: true,
        },
      ],
      serve: {
        total: 3,
        strays: 2,
        inFlight: 0,
        deadRoot: 1,
        level: "warn",
        processes: [
          {
            pid: 73001,
            ppid: 1,
            port: 7171,
            root: LONG_PATH,
            rootExists: false,
            kind: "stray",
          },
          {
            pid: 73055,
            ppid: 1,
            port: null,
            root: "/tmp/scratch-clone-for-a-forgotten-qa-experiment",
            rootExists: true,
            kind: "stray",
          },
          {
            pid: 1000,
            ppid: 999,
            port: 7171,
            root: "/Users/nick/code/nick/repoos",
            rootExists: true,
            kind: "control-plane",
          },
        ],
      },
      repo: {
        worktrees: 27,
        trackedFiles: 1840,
        linesOfCode: 263_400,
        worktreeWarnThreshold: 20,
      },
      pressure: {
        level: "warning",
        availableMemRatio: 0.28,
        loadPerCpu: 1.18,
        swapUsedBytes: 3 * 1024 ** 3,
        swapTotalBytes: 4 * 1024 ** 3,
        swapUsedRatio: 0.75,
        compressorBytes: 7 * 1024 ** 3,
        compressorRatio: 0.4375,
        memoryFreePercent: 9,
        totalMemBytes: 32 * 1024 ** 3,
        swapIoBytesPerSec: 0,
        pageoutBytesPerSec: 0,
        activityWindowSec: 30,
        psiMemoryAvg10: null,
        cpuIdlePercent: 8,
        source: "memory",
        reasons: [],
        warnings: ["Swap and compressor use are elevated; occupancy alone does not hold new work."],
        reason: null,
      },
      topProcesses: {
        byCpu: [
          {
            pid: 4812,
            command:
              "/Users/nick/.bun/bin/bun run --cwd /Users/nick/code/nick/repoos-worktrees/feat/qa-pass-stats-dev-and-activity-log-pages src/cli/index.ts",
            cpuPercent: 87.5,
            memBytes: 3 * 1024 ** 3,
            memPercent: 9.4,
            owner: "repoos",
          },
          {
            pid: 30011,
            command:
              "/Applications/Xcode.app/Contents/Developer/usr/bin/simctl spawn booted com.apple.ContainerManager.Agent --verbose-diagnostics",
            cpuPercent: 34.2,
            memBytes: 2.2 * 1024 ** 3,
            memPercent: 6.9,
            owner: "other",
          },
        ],
        byMemory: [
          {
            pid: 30012,
            command:
              "/System/Library/CoreServices/Spotlight.app/Contents/MacOS/Spotlight --launch-foreground",
            cpuPercent: 1.1,
            memBytes: 6.5 * 1024 ** 3,
            memPercent: 20.3,
            owner: "other",
          },
        ],
      },
      globalEngineers: {
        own: 3,
        others: 2,
        servers: [
          {
            port: 7171,
            pid: 1000,
            root: "/Users/nick/code/nick/repoos",
            projectName: "repoos",
            activeEngineers: 3,
            own: true,
          },
          {
            port: 8282,
            pid: 51000,
            root: "/Users/nick/code/nick/side-project-with-a-long-name",
            projectName: "side-project-with-a-long-name",
            activeEngineers: 2,
            own: false,
          },
        ],
        at: new Date().toISOString(),
      },
      heavyJobs: { running: 2, queued: 3 },
      runProcesses: {
        lastSweepAt: new Date().toISOString(),
        orphans: [
          {
            pid: 99187,
            taskId: "1211",
            command:
              "/usr/local/bin/node /Users/nick/code/nick/repoos-worktrees/integrate-1211/node_modules/.bin/vitest run --changed main --reporter=verbose-with-very-long-name",
            cpuTimeMs: 187_000,
            cpuPercent: 42,
            ageMs: 5 * 60_000,
            matchedBy: "run-marker",
            survived: true,
            at: new Date().toISOString(),
          },
        ],
      },
      serverPid: 1000,
      at: new Date().toISOString(),
    };
  }

  function gcPreviewFixture() {
    return {
      report: {
        removedWorktrees: [
          {
            branch: "repoos/integrate/1211-with-a-rather-long-integration-branch-name",
            path: `../repoos-worktrees/integrate-1211-with-a-rather-long-integration-branch-name`,
          },
          {
            branch: "feat/qa-pass-stats-dev-and-activity-log-pages-stale-copy",
            path: "../repoos-worktrees/feat-qa-pass-stats-dev-and-activity-log-pages-stale-copy",
          },
        ],
        keptDirty: [
          {
            branch: "repoos/integrate/1234",
            reason: "close-out job still active for task #1234 — kept until it lands",
          },
        ],
      },
      activeCloseOutTaskIds: ["1234"],
      blocked: false,
    };
  }

  it.each(VIEWPORTS)(
    "System Resources panel fits at %spx: charts render, chips wrap, table scrolls in place",
    async (width) => {
      setActivePinia(createPinia());
      const repo = useRepoStore();
      // Stub the GC status fetch before mount so the preview box renders with
      // long worktree branch/path names.
      vi.stubGlobal(
        "fetch",
        vi.fn(async (input: RequestInfo | URL) => {
          const url = String(input);
          if (url.includes("/api/system/worktree-gc")) return json(gcPreviewFixture());
          return json({});
        }),
      );
      const wrapper = mount(SystemResourcePanel, {
        attachTo: document.body,
        global: { stubs: { teleport: true, Transition: true } },
      });
      await flushPromises();
      // Two live samples give both sparklines a two-point history, so the
      // chart paths actually render; the watch records one entry per change.
      const stats = systemStatsFixture();
      repo.systemStats = stats;
      await flushPromises();
      repo.systemStats = { ...stats, totals: { ...stats.totals, cpuPercent: 91.2 } };
      await flushPromises();
      // Open the worktree-cleanup preview the way a user would: its long
      // branch/path lines are part of the QA pass.
      await wrapper.findAll(".gc-action")[0]!.trigger("click");
      await flushPromises();
      const markup = document.body.innerHTML;
      const css = scopedCss(markup, "resource-panel", "components/SystemResourcePanel");
      wrapper.unmount();
      document.body.innerHTML = "";

      const page = await openFixturePage("system-resources", markup, css, width);
      try {
        await expectFits(page, "System Resources panel", width);

        // Charts stay drawn and readable: both sparklines keep a visible,
        // non-collapsed box at every width.
        const sparks = await page.evaluate(() =>
          [...document.querySelectorAll<SVGSVGElement>(".sparkline")].map((svg) => {
            const box = svg.getBoundingClientRect();
            return {
              paths: svg.querySelectorAll("path").length,
              width: Math.round(box.width),
              height: Math.round(box.height),
            };
          }),
        );
        expect(sparks.length).toBe(2);
        for (const s of sparks) {
          expect(s.paths).toBe(1);
          // A real drawn chart, not a collapsed or clipped sliver.
          expect(s.width).toBeGreaterThan(40);
          expect(s.height).toBe(32);
        }

        // Top-process rows ellipsize long command lines inside their column
        // instead of pushing the panel wider.
        const names = await page.evaluate(() =>
          [...document.querySelectorAll<HTMLElement>(".top-name")].map((el) => ({
            overflow: getComputedStyle(el).textOverflow,
            right: Math.round(el.getBoundingClientRect().right),
            text: el.textContent,
          })),
        );
        expect(names.length).toBeGreaterThanOrEqual(3);
        for (const n of names) {
          expect(n.overflow).toBe("ellipsis");
          expect(n.right).toBeLessThanOrEqual(width + 1);
        }
        expect(names.some((n) => n.text!.includes("src/cli/index.ts"))).toBe(true);

        // The process table scrolls inside its own box; the page never widens.
        const table = await page
          .locator(".process-table-wrap")
          .first()
          .evaluate((wrap) => {
            const row = wrap.querySelector<HTMLElement>(".process-row")!;
            return {
              clientWidth: wrap.clientWidth,
              scrollWidth: wrap.scrollWidth,
              rowWidth: Math.round(row.getBoundingClientRect().width),
            };
          });
        expect(table.rowWidth).toBeGreaterThanOrEqual(560);
        if (width < 700) {
          expect(table.scrollWidth).toBeGreaterThan(table.clientWidth);
        }

        // Serve/orphan chips with long commands wrap inside the alert list.
        const chips = await page.evaluate(() =>
          [...document.querySelectorAll<HTMLElement>(".serve-chip")].map((el) => ({
            right: Math.round(el.getBoundingClientRect().right),
            text: el.textContent,
          })),
        );
        expect(chips.length).toBeGreaterThanOrEqual(2);
        for (const c of chips) expect(c.right).toBeLessThanOrEqual(width + 1);

        // The GC preview names long worktree paths; every line stays inside.
        expect(await textOf(page, ".gc-preview")).toContain("long-integration-branch-name");
        const gcLines = await page.evaluate(() =>
          [...document.querySelectorAll<HTMLElement>(".gc-preview span")].map((el) =>
            Math.round(el.getBoundingClientRect().right),
          ),
        );
        for (const right of gcLines) expect(right).toBeLessThanOrEqual(width + 1);

        // The pressure banner explains the state in words next to the numbers.
        expect(await textOf(page, ".pressure-alert")).toContain("Pressure warning");
      } finally {
        await page.close();
      }
    },
  );

  /* ── 2. AI usage panel (stats tables + recent failures) ────────────────── */

  function usageFixture(): BoardUsageStats {
    const iso = (minutesAgo: number) => new Date(Date.now() - minutesAgo * 60_000).toISOString();
    return {
      totalSessions: 214,
      totalElapsedMs: 61 * 3600_000,
      totalTokens: 4_812_345_678,
      totalCostUsd: 132.75,
      costSource: "mixed",
      roles: [
        {
          role: "engineer",
          totalSessions: 120,
          totalElapsedMs: 40 * 3600_000,
          totalInputTokens: 900_000_000,
          totalOutputTokens: 40_000_000,
          totalTokens: 940_000_000,
          totalCostUsd: 84.2,
          costSource: "mixed",
        },
        {
          role: "engineering-quality-assurance-reviewer-with-an-extended-role-suffix",
          totalSessions: 64,
          totalElapsedMs: 14 * 3600_000,
          totalInputTokens: 500_000_000,
          totalOutputTokens: 10_000_000,
          totalTokens: 510_000_000,
          totalCostUsd: 31.05,
          costSource: "extractUsage",
        },
        {
          role: "pm",
          totalSessions: 30,
          totalElapsedMs: 7 * 3600_000,
          totalInputTokens: 100_000_000,
          totalOutputTokens: 5_000_000,
          totalTokens: 105_000_000,
          totalCostUsd: null,
          costSource: "none",
        },
      ],
      days: Array.from({ length: 9 }, (_, i) => ({
        day: new Date(Date.now() - (8 - i) * 86_400_000).toISOString().slice(0, 10),
        totalSessions: 12 + i,
        totalElapsedMs: (3 + i) * 3600_000,
        totalInputTokens: 90_000_000,
        totalOutputTokens: 4_000_000,
        totalTokens: 94_000_000,
        totalCostUsd: 9.4 + i,
        costSource: "mixed",
      })),
      recentFailures: [
        {
          sessionId: "s-1",
          sessionType: "dispatch",
          agent: "engineer",
          model: "gpt-6-luna-with-a-very-long-variant-suffix-name",
          codingAgent: "codex",
          startedAt: iso(48),
          endedAt: iso(46),
          elapsedMs: 118_000,
          inputTokens: 12_000,
          outputTokens: 900,
          totalTokens: 12_900,
          cacheReadTokens: null,
          cacheCreationTokens: null,
          turns: 2,
          costUsd: null,
          costSource: "none",
          status: "error",
          trigger:
            "event: input.received:https://linear.app/acme/issue/ac-4812-implement-retry-with-exponential-backoff",
          errorReason:
            "Codex hit a provider quota or rate limit. Wait for the provider limit to reset, then retry. (CLI: error: You've hit your usage limit. Upgrade to Pro (https://chatgpt.com/explore/pro), visit https://chatgpt.com/codex/settings/usage to purchase more) — the task was returned to ready without losing its worktree.",
        },
        {
          sessionId: "s-2",
          sessionType: "review",
          agent: "reviewer",
          model: "glm-5.3-flash",
          codingAgent: "opencode",
          startedAt: iso(190),
          endedAt: iso(188),
          elapsedMs: 92_000,
          inputTokens: 8_000,
          outputTokens: 400,
          totalTokens: 8_400,
          cacheReadTokens: null,
          cacheCreationTokens: null,
          turns: 1,
          costUsd: null,
          costSource: "none",
          status: "error",
          trigger: "timer",
          errorReason: "review transcript write failed: ENOSPC",
        },
      ],
    };
  }

  it.each(VIEWPORTS)(
    "AI usage panel fits at %spx: tables scroll in place, failure reasons stay readable",
    async (width) => {
      setActivePinia(createPinia());
      const repo = useRepoStore();
      vi.stubGlobal(
        "fetch",
        vi.fn(async (input: RequestInfo | URL) => {
          const url = String(input);
          if (url.includes("/api/stats/board")) {
            return json({ ok: true, stats: usageFixture() });
          }
          return json({});
        }),
      );
      const wrapper = mount(UsagePanel, {
        attachTo: document.body,
        global: { stubs: { teleport: true, Transition: true } },
      });
      await flushPromises();
      const markup = document.body.innerHTML;
      const css = scopedCss(markup, "usage-panel", "components/UsagePanel");
      wrapper.unmount();
      document.body.innerHTML = "";

      const page = await openFixturePage("usage-panel", markup, css, width);
      try {
        await expectFits(page, "AI usage panel", width);

        // Both breakdown tables scroll inside their own box, never the page.
        const wraps = await page.evaluate(() =>
          [...document.querySelectorAll<HTMLElement>(".usage-table-wrap")].map((w) => ({
            client: w.clientWidth,
            scroll: w.scrollWidth,
          })),
        );
        expect(wraps.length).toBe(2);
        for (const w of wraps) expect(w.client).toBeLessThanOrEqual(width + 1);
        // The by-role table's nowrap cells are wider than a phone's panel, so
        // at 375px its own scroller is what holds them.
        if (width <= 480) {
          expect(wraps.some((w) => w.scroll > w.client)).toBe(true);
        }

        // Every recent failure renders with its full reason available; the
        // visible cell clips inside the row instead of pushing the panel wide.
        const reasons = await page.evaluate(() =>
          [...document.querySelectorAll<HTMLElement>(".usage-failure-reason")].map((el) => ({
            title: el.getAttribute("title") ?? "",
            width: Math.round(el.getBoundingClientRect().width),
            right: Math.round(el.getBoundingClientRect().right),
          })),
        );
        expect(reasons.length).toBe(2);
        for (const r of reasons) {
          expect(r.right).toBeLessThanOrEqual(width + 1);
          // The hover/fallback text carries the full reason, whatever it was.
          expect(r.title.length).toBeGreaterThan(0);
          // #1234: the reason cell is readable at every width — the fixed
          // column layout used to leave it a few pixels wide just below the
          // 860px breakpoint.
          expect(r.width).toBeGreaterThanOrEqual(120);
        }
        expect(reasons[0].title).toContain("provider quota or rate limit");

        // The long role name stays inside its cell (it must wrap or clip).
        const roles = await page.evaluate(() =>
          [...document.querySelectorAll<HTMLElement>(".usage-failure-role")].map((el) => ({
            right: Math.round(el.getBoundingClientRect().right),
            scroll: el.scrollWidth,
            client: el.clientWidth,
          })),
        );
        for (const r of roles) {
          expect(r.scroll).toBeLessThanOrEqual(r.client + 1);
          expect(r.right).toBeLessThanOrEqual(width + 1);
        }
      } finally {
        await page.close();
      }
    },
  );

  /* ── 3. Live activity feed (long messages) ─────────────────────────────── */

  const LONG_ERROR_PATH =
    "/Users/nick/code/nick/repoos-worktrees/feat/qa-pass-stats-dev-and-activity-log-pages/node_modules/.bin/vitest-run-failed-with-an-unusually-long-binary-path-segment";
  /** A 200-char unbreakable token (a pasted session/API token in an error
   *  line): no slashes or hyphens, so nothing gives the line breaker a hold. */
  const LONG_TOKEN =
    "9f2c81ab4d7e6c15a0b3d8f2e41c7a96b5d0e3f8a2c61b4d9e7f0a3c582b6d1e4f" +
    "7a0c3b6d9e2f5a8c1b4d7e0f3a6c9b2d5e8f1a4c7b0d3e6f9a2c5b8d1e4f7a0c3b6";

  function feedFixture(): FeedItem[] {
    const now = new Date().toTimeString().slice(0, 8);
    return [
      {
        key: 1,
        msg: `<b>created</b> #1234 QA pass: Stats, Dev and activity-log pages at all screen sizes`,
        color: "#4ef0a8",
        kind: "task.created",
        time: now,
      },
      {
        key: 2,
        msg: `<span style="color:var(--red)">error:</span> agent auth failed with token ${LONG_TOKEN} — check the saved key`,
        color: "#ff6b7d",
        kind: "error",
        time: now,
      },
      {
        key: 3,
        msg: `check step "test" failed — spawn ${LONG_ERROR_PATH} ENOENT`,
        color: "#ff6b7d",
        kind: "error",
        time: now,
      },
      {
        key: 4,
        msg: `<b>review</b> started on #1198 — refactor the settings store so nested config groups normalize once (#1198) with an unusually long task title appended`,
        color: "#ffb454",
        kind: "review",
        time: now,
      },
      {
        key: 5,
        msg: `<b>new build</b> available — restart to apply`,
        color: "#39e0ff",
        kind: "build.available",
        time: now,
      },
    ];
  }

  it.each(VIEWPORTS)(
    "Live activity feed fits at %spx with long unbroken error paths and tokens",
    async (width) => {
      setActivePinia(createPinia());
      const repo = useRepoStore();
      repo.connected = true;
      for (const item of feedFixture()) repo.feed.push(item);

      const wrapper = mount(FeedPanel, {
        attachTo: document.body,
        global: { stubs: { teleport: true, Transition: true } },
      });
      await flushPromises();
      const markup = document.body.innerHTML;
      wrapper.unmount();
      document.body.innerHTML = "";

      const page = await openFixturePage("activity-feed", markup, "", width);
      try {
        await expectFits(page, "Live activity feed", width);
        expect(await page.locator(".feed-item").count()).toBe(5);
        // Every message wraps (or clips) inside the feed; the long unbreakable
        // token in the error line must never push the page wider.
        const msgs = await page.evaluate(() =>
          [...document.querySelectorAll<HTMLElement>(".feed-msg")].map((el) => ({
            right: Math.round(el.getBoundingClientRect().right),
            scroll: el.scrollWidth,
            client: el.clientWidth,
          })),
        );
        for (const m of msgs) {
          expect(m.scroll).toBeLessThanOrEqual(m.client + 1);
          expect(m.right).toBeLessThanOrEqual(width + 1);
        }
      } finally {
        await page.close();
      }
    },
  );

  /* ── 4. Dev page (long names, commands, URLs and expanded logs) ────────── */

  const LONG_LOG_LINE_1 =
    `vite v5.4.10  ready in 210 ms and then a single unbroken token for the wrapper to deal with: ` +
    `src/ui-app/src/components/settings/tabs/sections/panels/dialogs/wizards/deeply-nested-directory/ ExtremelyLongComponentNameForASettingsTabSection.tsx`;
  const LONG_LOG_LINE_2 =
    `warning: chunk "index-9f2c81ab" is larger than 500 kB — ` +
    `assets/vendor/moment-locales-every-language-in-the-world-including-klingon-and-elvish-variants.chunk.js`;

  function devTargetsFixture(): DevTargetView[] {
    return [
      {
        name: "my-very-long-development-server-target-name",
        kind: "server",
        command:
          "bun run dev --host 0.0.0.0 --port 5173 --config ./configs/vite.config.marketing-site-long-name.ts",
        label: "Marketing site dev server with HMR overlays and preview",
        status: "running",
        pid: 48121,
        startedAt: new Date(Date.now() - 17 * 3600_000).toISOString(),
        log: [LONG_LOG_LINE_1, LONG_LOG_LINE_2],
        url: "https://marketing-site.dev.local.staging.internal.example.com/preview/build/2026/11/index.html",
        port: 5173,
        services: [
          {
            name: "postgres-migrations-runner-service",
            status: "running",
            pid: 48140,
            port: 5433,
            url: "http://127.0.0.1:5433/health?probe=deep&token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.long-token",
            log: [LONG_LOG_LINE_2],
          },
        ],
      },
      {
        name: "build-ui",
        kind: "artifact",
        command: "bun run build:ui",
        label: "UI build",
        status: "stopped",
        log: [],
        artifactPath:
          "dist/ui/assets/static/chunks/very-long-artifact-directory-name/index-9f2c81ab.js",
      },
      {
        name: "native-app",
        kind: "process",
        command:
          "open -a /Applications/RepoOS.app --args --serve-root /Users/nick/code/nick/repoos-worktrees/feat/qa-pass-stats-dev-and-activity-log-pages",
        label: "Native hub",
        status: "failed",
        error:
          "exited with code 1 after 4 attempts: EADDRINUSE: address already in use 127.0.0.1:7171 while binding the control plane",
        log: Array.from({ length: 9 }, (_, i) =>
          i % 2 === 0
            ? `${LONG_LOG_LINE_1} (attempt ${i + 1})`
            : `error: bind EADDRINUSE 127.0.0.1:7171 — held by /Applications/RepoOS.app/Contents/MacOS/RepoOS --serve --port 7171 (attempt ${i + 1})`,
        ),
        failure: {
          kind: "port-in-use",
          port: 7171,
          what: "The hub could not bind 127.0.0.1:7171 — another process is already listening there.",
          cause:
            "An earlier repoos serve from a scratch worktree is still holding the port, so the supervised start never came up.",
          fix: "Stop the holder below, or run the hub on a different port in repoos.toml, then Start again.",
          holder: {
            pid: 73001,
            command:
              "/Users/nick/.bun/bin/bun /Users/nick/code/nick/repoos/dist/cli/index.js serve --port 7171 --root /Users/nick/code/nick/repoos-scratch-clone-from-an-earlier-experiment",
            repoosOwned: true,
            target: "control-plane",
            stale: true,
          },
          canStopHolder: true,
        },
      },
    ];
  }

  it.each(VIEWPORTS)(
    "Dev page fits at %spx: names, commands, holder rows and logs stay inside the card",
    async (width) => {
      setActivePinia(createPinia());
      const repo = useRepoStore();
      const config = useConfigStore();
      repo.health = {
        ok: true,
        root: "/tmp/repo",
        projectName: "repoos",
        branch: null,
        taskCount: 0,
        workDir: "work",
        version: "1.0.0",
        buildAt: null,
        buildHash: null,
        buildAvailableHash: null,
        buildAvailableAt: null,
        isPreviewBuild: false,
        canaryCounter: 0,
        canaryPath: ".repoos/canary.txt",
      };
      config.data = { dev: { failureSummary: { ai: true } } };
      config.loaded = true;
      invalidatePageData("dev-targets");
      // Open the running target's output and its service output the way a
      // reader would have (the failed target's opens on its own).
      localStorage.setItem(
        "repoos.dev.outputExpanded",
        JSON.stringify({ "my-very-long-development-server-target-name": true }),
      );
      localStorage.setItem(
        "repoos.dev.serviceExpanded",
        JSON.stringify({
          "my-very-long-development-server-target-name::postgres-migrations-runner-service": true,
        }),
      );
      vi.stubGlobal(
        "fetch",
        vi.fn(async (input: RequestInfo | URL) => {
          const url = String(input);
          if (url.includes("/api/dev/targets")) {
            return json({ ok: true, targets: devTargetsFixture(), errors: [] });
          }
          return json({});
        }),
      );
      const wrapper = mount(DevView, {
        attachTo: document.body,
        global: {
          stubs: { teleport: true, Transition: true, PageSkeleton: true },
        },
      });
      await flushPromises();
      await new Promise((r) => setTimeout(r, 0));
      const markup = document.body.innerHTML;
      const css = scopedCss(markup, "dev-page", "views/DevView");
      wrapper.unmount();
      document.body.innerHTML = "";

      const page = await openFixturePage("dev-page", markup, css, width);
      try {
        await expectFits(page, "Dev page", width);

        // All three cards render, the failed one with its expanded log.
        expect(await page.locator(".dev-card").count()).toBe(3);
        const logs = await page.evaluate(() =>
          [...document.querySelectorAll<HTMLElement>(".dev-log-body")]
            .filter((el) => el.offsetParent !== null)
            .map((el) => {
              const box = el.getBoundingClientRect();
              const code = el.querySelector("code")!;
              return {
                width: Math.round(box.width),
                right: Math.round(box.right),
                scroll: el.scrollWidth,
                client: el.clientWidth,
                codeScroll: code.scrollWidth,
                codeClient: code.clientWidth,
              };
            }),
        );
        // The running target's log, its service log and the failed target's
        // log are all open.
        expect(logs.length).toBe(3);
        for (const log of logs) {
          expect(log.right).toBeLessThanOrEqual(width + 1);
          // Long lines wrap inside the box instead of widening it.
          expect(log.scroll).toBeLessThanOrEqual(log.client + 1);
          expect(log.codeScroll).toBeLessThanOrEqual(log.codeClient + 1);
        }

        // The long target name, the long command and every bare meta code
        // (the artifact's output path) wrap instead of pushing the card wider.
        const codeCells = await page.evaluate(() =>
          [
            ...document.querySelectorAll<HTMLElement>(
              ".dev-card-name, .dev-card-label, .dev-command, .dev-holder-command, .dev-service-name, .dev-open, .dev-meta dd > code",
            ),
          ].map((el) => ({
            right: Math.round(el.getBoundingClientRect().right),
            scroll: el.scrollWidth,
            client: el.clientWidth,
          })),
        );
        expect(codeCells.length).toBeGreaterThanOrEqual(4);
        for (const c of codeCells) {
          expect(c.scroll).toBeLessThanOrEqual(c.client + 1);
          expect(c.right).toBeLessThanOrEqual(width + 1);
        }

        // Every action button stays on the page and clickable at every width.
        const buttons = await page.evaluate(() =>
          [...document.querySelectorAll<HTMLElement>(".dev-actions button")].map((b) => {
            const box = b.getBoundingClientRect();
            return { x: box.x, right: box.right, visible: box.width > 0 };
          }),
        );
        expect(buttons.length).toBeGreaterThanOrEqual(3);
        for (const b of buttons) {
          expect(b.visible).toBe(true);
          expect(b.x).toBeGreaterThanOrEqual(-1);
          expect(b.right).toBeLessThanOrEqual(width + 1);
        }
      } finally {
        await page.close();
      }
    },
  );

  /* ── 5. Commit activity log (Context → History, long subjects and paths) ─ */

  const LONG_COMMIT_PATH =
    "src/ui-app/src/components/settings/tabs/sections/panels/dialogs/wizards/deeply-nested-directory/ExtremelyLongComponentNameForASettingsTabSection.tsx";

  function historyCommits(): HistoryCommit[] {
    const iso = (hoursAgo: number) => new Date(Date.now() - hoursAgo * 3600_000).toISOString();
    return [
      {
        sha: "1aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1",
        shortSha: "1aaaaaa",
        subject:
          "feat(1234): QA pass: Stats, Dev and activity-log pages at all screen sizes — tables scroll or reflow, long lines wrap inside their own box",
        body:
          "Fix overflow, clipped controls and unreadable charts reported at phone width.\n\n" +
          "The wrapped commit body must break at spaces without dragging the row wider.",
        authorName: "QA Ada",
        authorEmail: "ada@example.com",
        date: iso(2),
        refs: ["main", "origin/feat/qa-pass-stats-dev-and-activity-log-pages-extended-branch-name"],
        parents: [],
        taskId: "1234",
        check: { passed: true, outcome: "passed" },
      },
      {
        sha: "2bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb2",
        shortSha: "2bbbbbb",
        subject:
          "fix(1199): https://linear.app/acme/issue/ac-4812-implement-retry-with-exponential-backoff-and-retry-queue-handling-in-the-worker-loop",
        body: "",
        authorName: "Bob Builder",
        authorEmail: "bob@example.com",
        date: iso(5),
        refs: [],
        parents: [],
        taskId: "1199",
      },
      {
        sha: "3ccccccccccccccccccccccccccccccccccccccccccc3",
        shortSha: "3cccccc",
        subject: "docs(1122): record held CTO nudge and long unbroken follow-up note",
        body: "",
        authorName: "Docs Bot",
        authorEmail: "docs@example.com",
        date: iso(26),
        refs: [],
        parents: [],
        taskId: "1122",
      },
    ];
  }

  function commitDetailFixture(sha: string) {
    return {
      ok: true,
      sha,
      shortSha: sha.slice(0, 7),
      subject: "feat(1234): QA pass",
      body: "",
      authorName: "QA Ada",
      authorEmail: "ada@example.com",
      date: new Date().toISOString(),
      refs: [],
      parents: [],
      taskId: "1234",
      patch: "",
      truncated: false,
      files: [
        { path: LONG_COMMIT_PATH, additions: 128, deletions: 4, status: "modified" },
        {
          path: "src/ui-app/src/components/RepoHistoryPanel.vue",
          additions: 12,
          deletions: 2,
          status: "modified",
        },
        {
          path: "docs/qa/2026-11-stats-dev-pages-qa/qa-evidence-screenshots-directory-with-long-name/index.png",
          additions: 1,
          deletions: 0,
          status: "added",
        },
      ],
    };
  }

  it.each(VIEWPORTS)(
    "commit history fits at %spx: subjects wrap, file paths wrap, expanded detail stays inside",
    async (width) => {
      setActivePinia(createPinia());
      useRepoStore();
      vi.stubGlobal(
        "fetch",
        vi.fn(async (input: RequestInfo | URL) => {
          const url = String(input);
          if (url.includes("/api/repo/branches")) {
            return json({
              ok: true,
              defaultBranch: "main",
              branches: ["main", "origin/feat/qa-pass-stats-dev-and-activity-log-pages"],
            });
          }
          if (url.includes("/api/repo/log")) {
            return json({
              ok: true,
              commits: historyCommits(),
              nextCursor: "cursor-2",
              branch: "main",
              defaultBranch: "main",
            });
          }
          if (url.includes("/api/repo/commits/")) {
            const sha = url.split("/api/repo/commits/")[1] ?? "";
            return json(commitDetailFixture(decodeURIComponent(sha)));
          }
          return json({});
        }),
      );
      const wrapper = mount(RepoHistoryPanel, {
        attachTo: document.body,
        global: { stubs: { teleport: true, Transition: true } },
      });
      await flushPromises();
      // Expand the first commit, the way a reader opens the activity detail —
      // its long file paths are exactly what the QA pass must find readable.
      await wrapper.findAll(".hist-row")[0]!.trigger("click");
      await flushPromises();
      await new Promise((r) => setTimeout(r, 0));
      const markup = document.body.innerHTML;
      const css = scopedCss(markup, "hist", "components/RepoHistoryPanel");
      wrapper.unmount();
      document.body.innerHTML = "";

      const page = await openFixturePage("history-panel", markup, css, width);
      try {
        await expectFits(page, "commit history", width);

        // The toolbar (branch select, path filter, docs toggle) fits and all
        // three controls stay clickable inside the card.
        const toolbar = await page.evaluate(() =>
          [...document.querySelectorAll<HTMLElement>(".hist-toolbar > *")].map((el) => {
            const box = el.getBoundingClientRect();
            return { left: Math.round(box.left), right: Math.round(box.right) };
          }),
        );
        expect(toolbar.length).toBe(3);
        for (const c of toolbar) {
          expect(c.left).toBeGreaterThanOrEqual(-1);
          expect(c.right).toBeLessThanOrEqual(width + 1);
        }

        // Subjects wrap instead of dragging the row wider — including the
        // long unbroken URL subject.
        const subjects = await page.evaluate(() =>
          [...document.querySelectorAll<HTMLElement>(".hist-subject")].map((el) => ({
            scroll: el.scrollWidth,
            client: el.clientWidth,
            right: Math.round(el.getBoundingClientRect().right),
          })),
        );
        expect(subjects.length).toBe(3);
        for (const s of subjects) {
          expect(s.scroll).toBeLessThanOrEqual(s.client + 1);
          expect(s.right).toBeLessThanOrEqual(width + 1);
        }

        // The expanded detail shows the long paths; every path wraps or clips
        // inside its own row, and the ±counts stay on the page.
        expect(await page.locator(".hist-detail").count()).toBe(1);
        const paths = await page.evaluate(() =>
          [...document.querySelectorAll<HTMLElement>(".hist-file-path")].map((el) => ({
            scroll: el.scrollWidth,
            client: el.clientWidth,
            right: Math.round(el.getBoundingClientRect().right),
          })),
        );
        expect(paths.length).toBe(3);
        for (const p of paths) {
          expect(p.scroll).toBeLessThanOrEqual(p.client + 1);
          expect(p.right).toBeLessThanOrEqual(width + 1);
        }
        expect(await textOf(page, ".hist-detail")).toContain("ExtremelyLongComponentName");

        // Load more stays clickable inside the card.
        const more = await page.locator(".hist-more .btn, .hist-more button").first().boundingBox();
        expect(more).not.toBeNull();
        expect(more!.x).toBeGreaterThanOrEqual(-1);
        expect(more!.x + more!.width).toBeLessThanOrEqual(width + 1);
      } finally {
        await page.close();
      }
    },
  );
});
