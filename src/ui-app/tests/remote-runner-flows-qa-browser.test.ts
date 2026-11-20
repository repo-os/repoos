// @vitest-environment jsdom
/**
 * #1256 — QA pass: remote runner add, test and remove flows when a host is
 * unreachable, logs in as the wrong user, is missing a CLI or answers slowly.
 * Fixtures and stubbed responses only: `fetch` is replaced, no ssh runs and no
 * real runner is touched. The interaction assertions run on the real
 * RemoteValidationDrawer in jsdom; the same failure states are then rendered in
 * headless WebKit at 375 / 768 / 1280 px, where nothing may overflow the
 * viewport and each failure must say what went wrong and the next step.
 *
 * Set `QA_SHOTS=<dir>` to save a full-page screenshot per state and width.
 */
import { resolve } from "node:path";
import { mkdirSync, readFileSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { webkit, type Browser, type Page } from "@playwright/test";
import { compileStyle, parse } from "@vue/compiler-sfc";
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { h } from "vue";
import RemoteValidationDrawer from "../src/components/RemoteValidationDrawer.vue";
import { useUiStore } from "../src/stores/ui";
import { useConfigStore } from "../src/stores/config";
import { SERVER_UNREACHABLE_MESSAGE } from "../src/api";
import { describeHostProbeFailure } from "../../server/remote-validation.js";

const VIEWPORTS = [375, 768, 1280] as const;
const uiRoot = resolve(__dirname, "..");

// Same dialog stubs as remote-validation-drawer.test.ts: render the slot in place.
const DialogStub = {
  props: { open: { type: Boolean, default: false } },
  template: `<div v-if="open" class="dialog-stub"><slot /></div>`,
};
const AttrPassThrough = {
  inheritAttrs: false,
  setup(
    _props: unknown,
    { slots, attrs }: { slots: { default?: () => unknown }; attrs: Record<string, unknown> },
  ) {
    return () => h("div", attrs, slots.default?.() as never);
  },
};
const Slot = {
  setup(_props: unknown, { slots }: { slots: { default?: () => unknown } }) {
    return () => slots.default?.();
  },
};
// ui/dialog/content.vue adds `drawer-wrap drawer`, which the app's ≤600px rules
// key on (full-width, resize handle hidden). The stub must add it too.
const DrawerContent = {
  inheritAttrs: false,
  setup(
    _props: unknown,
    { slots, attrs }: { slots: { default?: () => unknown }; attrs: Record<string, unknown> },
  ) {
    return () => h("div", { ...attrs, class: "drawer-wrap drawer" }, slots.default?.() as never);
  },
};
const dialogStubs = {
  teleport: true,
  Dialog: DialogStub,
  DialogContent: DrawerContent,
  DialogOverlay: true,
  DialogTitle: Slot,
  DialogDescription: Slot,
  DialogClose: AttrPassThrough,
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

/* ── fixtures ──────────────────────────────────────────────────────────────── */

interface HostFixture {
  host: string;
  user: string;
  os: string;
  probed: boolean;
  healthy: boolean;
  detail: string;
}

function hostRow(over: Partial<HostFixture> & { host: string }): HostFixture {
  return { user: "root", os: "linux", probed: true, healthy: true, detail: "", ...over };
}

/** The failing `Test connection` payload, built with the classifier the route uses. */
function failingTestPayload(): Record<string, unknown> {
  const hosts = [
    { host: "bee", user: "root", os: "linux" },
    { host: "mac1", user: "nick", os: "macos" },
    { host: "pi-den", user: "root", os: "linux" },
  ];
  const probes = [
    { code: 0, output: "docker 27.3.1 · validate.sh ok", timedOut: false },
    {
      code: 255,
      output: "nick@mac1: Permission denied (publickey).",
      timedOut: false,
    },
    { code: null, output: "", timedOut: true },
  ];
  const reports = hosts.map((h, i) => {
    const label = `── ${h.host} (${h.os}) ──`;
    if (i === 0) return `${label}\n${probes[i]!.output}`;
    const { cause, next } = describeHostProbeFailure(probes[i]!, h);
    const details = probes[i]!.output ? `\n\nDetails:\n${probes[i]!.output}` : "";
    return `${label}\n${cause} ${next}${details}`;
  });
  return {
    ok: false,
    error:
      "2 of 3 hosts failed the setup check: mac1, pi-den. Fix the problem listed under each host, then Test again.",
    output: reports.join("\n\n"),
  };
}

interface Scenario {
  hosts: string[];
  rows: HostFixture[];
  testResponse?: Record<string, unknown>;
  testError?: Error;
  /** Never answer the test request — a host that is still being probed. */
  holdTest?: boolean;
}

interface ApiCall {
  method: string;
  path: string;
  body?: unknown;
}

const okJson = (data: unknown): Response =>
  ({ ok: true, status: 200, statusText: "OK", json: async () => data }) as unknown as Response;

function stubFetch(s: Scenario): ApiCall[] {
  const calls: ApiCall[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string | URL, init?: RequestInit) => {
      const path = String(url);
      const method = (init?.method ?? "GET").toUpperCase();
      const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
      calls.push({ method, path, body });
      if (path === "/api/remote-validation/status") {
        return okJson({
          enabled: true,
          running: true,
          provider: "tailscale",
          hasSshKey: true,
          containerImage: "repoos-ci",
          maxConcurrent: 1,
          tailscaleHosts: s.hosts,
          hosts: s.rows,
        });
      }
      if (path === "/api/remote-validation/test") {
        if (s.holdTest) return new Promise<Response>(() => {});
        if (s.testError) throw s.testError;
        return okJson(s.testResponse ?? { ok: true, output: "" });
      }
      if (path === "/api/config" && method === "PATCH") return okJson({ ok: true });
      throw new Error(`unexpected fetch ${method} ${path}`);
    }),
  );
  return calls;
}

async function flush(): Promise<void> {
  await flushPromises();
  await new Promise((r) => setTimeout(r, 0));
}

async function mountDrawer(s: Scenario): Promise<{ wrapper: VueWrapper; calls: ApiCall[] }> {
  const calls = stubFetch(s);
  const pinia = createPinia();
  setActivePinia(pinia);
  useUiStore().openRemoteValidation();
  useConfigStore();
  const wrapper = mount(RemoteValidationDrawer, {
    global: { plugins: [pinia], stubs: dialogStubs },
  });
  await flush();
  return { wrapper, calls };
}

const POOL_ROWS: HostFixture[] = [
  hostRow({ host: "bee" }),
  hostRow({
    host: "mac1",
    user: "nick",
    os: "macos",
    healthy: false,
    detail: "ssh: permission denied (publickey)",
  }),
];

const FAILING_SCENARIO: Scenario = {
  hosts: ["bee", "mac1", "pi-den"],
  rows: [...POOL_ROWS, hostRow({ host: "pi-den", healthy: false, detail: "unavailable" })],
  testResponse: failingTestPayload(),
};

const REMOVAL_SCENARIO: Scenario = { hosts: ["bee", "mac1"], rows: POOL_ROWS };

/* ── interaction flows (jsdom) ─────────────────────────────────────────────── */

describe("remote runner flows: add, test and remove failures (#1256)", () => {
  it("names the failing hosts and their next steps in the Test connection output", async () => {
    const { wrapper } = await mountDrawer(FAILING_SCENARIO);
    await wrapper.get(".rvr-test-section button").trigger("click");
    await flush();

    expect(wrapper.get(".rvr-test-section button").text()).toBe("Failed");
    const block = wrapper.get(".rvr-codeblock--fail").text();
    expect(block).toContain("2 of 3 hosts failed the setup check: mac1, pi-den.");
    expect(block).toContain("SSH refused the login as nick@mac1.");
    expect(block).toContain("Details:");
    expect(block).toContain("Permission denied (publickey)");
    expect(block).toContain("pi-den did not answer within 15 seconds.");
    expect(block).not.toContain("FAILED (exit");
  });

  it("says the wait is up to 15 seconds while the probe runs, and disables Test", async () => {
    const { wrapper } = await mountDrawer({ ...FAILING_SCENARIO, holdTest: true });
    await wrapper.get(".rvr-test-section button").trigger("click");
    await flush();

    expect(wrapper.get(".rvr-test-section button").text()).toBe("Testing…");
    expect(wrapper.get(".rvr-test-section button").attributes("disabled")).toBeDefined();
    expect(wrapper.text()).toContain("A host that does not answer is reported after 15 seconds.");
  });

  it("explains a network failure with the server-unreachable message, not a raw fetch error", async () => {
    const { wrapper } = await mountDrawer({
      ...FAILING_SCENARIO,
      testError: new Error(SERVER_UNREACHABLE_MESSAGE),
    });
    await wrapper.get(".rvr-test-section button").trigger("click");
    await flush();

    expect(wrapper.get(".rvr-codeblock--fail").text()).toContain("Can't reach the RepoOS server");
    expect(wrapper.get(".rvr-codeblock--fail").text()).not.toContain("Failed to fetch");
  });

  it("asks before saving a pool that drops a host, and sends nothing until confirmed", async () => {
    const { wrapper, calls } = await mountDrawer(REMOVAL_SCENARIO);
    await wrapper.get("#rvr-hosts-input").setValue("bee");
    await wrapper.get('[data-testid="save-hosts"]').trigger("click");
    await flush();

    expect(calls.filter((c) => c.method === "PATCH")).toHaveLength(0);
    const confirm = wrapper.get('[data-testid="remove-hosts-confirm"]');
    expect(confirm.text()).toMatch(/Remove mac1 from the host pool\?/);
    expect(confirm.text()).toMatch(/New jobs will stop going to\s+it\./);

    await wrapper.get('[data-testid="confirm-remove-hosts"]').trigger("click");
    await flush();
    const patch = calls.find((c) => c.method === "PATCH");
    expect((patch!.body as Record<string, unknown>)["remoteValidation.tailscaleHosts"]).toEqual([
      "bee",
    ]);
    expect(wrapper.find('[data-testid="remove-hosts-confirm"]').exists()).toBe(false);
  });

  it("keeping the host restores the saved list and sends nothing", async () => {
    const { wrapper, calls } = await mountDrawer(REMOVAL_SCENARIO);
    await wrapper.get("#rvr-hosts-input").setValue("bee");
    await wrapper.get('[data-testid="save-hosts"]').trigger("click");
    await flush();
    await wrapper.get('[data-testid="cancel-remove-hosts"]').trigger("click");
    await flush();

    expect(calls.filter((c) => c.method === "PATCH")).toHaveLength(0);
    expect((wrapper.get("#rvr-hosts-input").element as HTMLInputElement).value).toBe("bee, mac1");
    expect(wrapper.get(".btn-row .tunnel-help").text()).toBe(
      "Not removed. The host pool is unchanged.",
    );
    expect(wrapper.find('[data-testid="remove-hosts-confirm"]').exists()).toBe(false);
  });

  it("adding a host saves straight away with no removal prompt", async () => {
    const { wrapper, calls } = await mountDrawer({
      hosts: ["bee"],
      rows: [hostRow({ host: "bee" })],
    });
    await wrapper.get("#rvr-hosts-input").setValue("bee, mac1");
    await wrapper.get('[data-testid="save-hosts"]').trigger("click");
    await flush();

    expect(calls.filter((c) => c.method === "PATCH")).toHaveLength(1);
    expect(wrapper.find('[data-testid="remove-hosts-confirm"]').exists()).toBe(false);
  });
});

/* ── rendered failure states (headless WebKit, 375 / 768 / 1280 px) ───────── */

describe("remote runner failure states at 375/768/1280 (WebKit, fixtures)", () => {
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

  /** Compiled scoped CSS of the drawer, with the scope id its markup carries. */
  function scopedCss(markup: string): string {
    const source = readFileSync(
      resolve(uiRoot, "src/components/RemoteValidationDrawer.vue"),
      "utf8",
    );
    const style = parse(source, { filename: "RemoteValidationDrawer.vue" }).descriptor.styles[0];
    const marker = markup.indexOf("rvr-hosts");
    if (marker < 0) throw new Error("drawer markup is missing .rvr-hosts");
    const tag = markup.slice(markup.lastIndexOf("<", marker), markup.indexOf(">", marker));
    const scopeId = tag.match(/data-v-[a-f0-9]+/)?.[0];
    if (!scopeId) throw new Error("drawer scope ID was not present on .rvr-hosts");
    const compiled = compileStyle({
      filename: "RemoteValidationDrawer.vue",
      id: scopeId,
      source: style?.content ?? "",
    });
    if (compiled.errors.length) throw compiled.errors[0]!;
    return compiled.code;
  }

  /** `show` scrolls the drawer's own body to the state's block before the shot. */
  async function renderAt(
    label: string,
    markup: string,
    width: number,
    show: string,
  ): Promise<Page> {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    await page.setViewportSize({ width, height: 900 });
    await page.setContent(
      `<meta name="viewport" content="width=device-width, initial-scale=1.0">` +
        `<style>${globalCss}</style><style>${scopedCss(markup)}</style>` +
        `<style>html, body { width: 100%; margin: 0; } *, *::before, *::after { animation: none !important; transition: none !important; }</style>` +
        `<div class="app-shell"><div class="body"><div class="main">${markup}</div></div></div>`,
    );
    await page.locator(show).first().scrollIntoViewIfNeeded();
    const shots = process.env.QA_SHOTS;
    if (shots) {
      mkdirSync(shots, { recursive: true });
      // JPEG keeps the staged artifact under the guard's scan limit (see
      // work-board-moves-qa-browser.test.ts). The drawer scrolls inside
      // itself, so the shot is the viewport at the state's block.
      await page.screenshot({ path: resolve(shots, `${label}-${width}.jpg`) });
    }
    return page;
  }

  /** Elements that sit outside the viewport, and the document's scroll width. */
  async function audit(page: Page): Promise<{ documentWidth: number; overflowers: string[] }> {
    return page.evaluate(() => {
      const vw = window.innerWidth;
      const overflowers: string[] = [];
      for (const el of document.body.querySelectorAll<HTMLElement>("*")) {
        const style = getComputedStyle(el);
        if (style.display === "none" || style.visibility === "hidden") continue;
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) continue;
        if (rect.right > vw + 1 || rect.left < -1) {
          overflowers.push(
            `${el.tagName.toLowerCase()}.${String(el.className).split(" ").join(".")} at ${Math.round(rect.left)}..${Math.round(rect.right)}`,
          );
        }
      }
      return { documentWidth: document.documentElement.scrollWidth, overflowers };
    });
  }

  const states: {
    label: string;
    scenario: Scenario;
    typed?: string;
    click?: string;
    show: string;
    expect: RegExp[];
  }[] = [
    {
      label: "test-failures",
      scenario: FAILING_SCENARIO,
      click: ".rvr-test-section button",
      show: ".rvr-codeblock--fail",
      expect: [
        /2 of 3 hosts failed the setup check/,
        /SSH refused the login as nick@mac1/,
        /did not answer within 15 seconds/,
      ],
    },
    {
      label: "remove-confirm",
      scenario: REMOVAL_SCENARIO,
      typed: "bee",
      click: '[data-testid="save-hosts"]',
      show: '[data-testid="remove-hosts-confirm"]',
      expect: [/Remove mac1 from the host pool\?/, /Keep it/],
    },
  ];

  for (const width of VIEWPORTS) {
    for (const state of states) {
      it(`${state.label} fits at ${width}px and says what to do`, async () => {
        const { wrapper } = await mountDrawerForRender(state.scenario, state.click, state.typed);
        // outerHTML, not html(): Test Utils pretty-prints html() and that
        // indents the pre-wrap output text, which the app never does.
        const page = await renderAt(state.label, wrapper.element.outerHTML, width, state.show);
        try {
          const { documentWidth, overflowers } = await audit(page);
          // The document may be narrower than the viewport, never wider.
          expect(documentWidth).toBeLessThanOrEqual(width);
          expect(overflowers).toEqual([]);
          const text = await page.evaluate(() => document.body.innerText);
          for (const pattern of state.expect) expect(text).toMatch(pattern);
        } finally {
          await page.close();
        }
      });
    }
  }
});

/** Mounts the drawer for a rendered state, pressing the state's trigger once. */
async function mountDrawerForRender(
  s: Scenario,
  click?: string,
  typed?: string,
): Promise<{ wrapper: VueWrapper }> {
  const { wrapper } = await mountDrawer(s);
  if (typed !== undefined) {
    await wrapper.get("#rvr-hosts-input").setValue(typed);
  }
  if (click) {
    await wrapper.get(click).trigger("click");
    await flush();
  }
  return { wrapper };
}
