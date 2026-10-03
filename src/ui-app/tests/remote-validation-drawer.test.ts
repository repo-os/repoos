import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { h } from "vue";
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import RemoteValidationDrawer from "../src/components/RemoteValidationDrawer.vue";
import { useUiStore } from "../src/stores/ui";
import { useConfigStore } from "../src/stores/config";

/**
 * Component tests for the RemoteValidationDrawer (Hetzner + Tailscale runner
 * setup). Established pattern: radix dialog primitives are stubbed to render
 * their slot in place (the real ones only add portal/overlay behaviour), the
 * stores mount fresh against their own pinia, and `api()`'s fetch is stubbed
 * with a stateful fake server so real store actions (setConfigValues) and the
 * component's refresh() both resolve against consistent fixture state.
 */

const uiRoot = resolve(__dirname, "..");

// ── dialog stubs (same pattern as screenshot-viewer.test.ts) ───────────────
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
const dialogStubs = {
  teleport: true,
  Dialog: DialogStub,
  DialogContent: AttrPassThrough,
  DialogOverlay: true,
  DialogTitle: Slot,
  DialogDescription: Slot,
  DialogClose: AttrPassThrough,
};

// ── plumbing ────────────────────────────────────────────────────────────────

async function flush(): Promise<void> {
  await flushPromises();
  await new Promise((r) => setTimeout(r, 0));
}

interface ApiCall {
  method: string;
  path: string;
  body?: unknown;
}

interface HostRow {
  host: string;
  user?: string;
  os?: string;
  labels?: string[];
  probed?: boolean;
  healthy?: boolean;
  detail?: string;
  inFlight?: number;
  maxConcurrent?: number;
  queued?: number;
  lastRun?: { taskId: string; ok: boolean } | null;
}

/** Fixture knobs for one mount, standing in for the server's mutable state. */
interface Fixture {
  provider: "hetzner" | "tailscale";
  tailscaleHosts: string[];
  hosts: HostRow[];
  statusFails: boolean;
  testResponse: Record<string, unknown> | null;
  testError: Error | null;
  /** Save-hosts PATCH also repopulates the live host rows (server-side apply). */
  syncHostsOnSave: boolean;
}

function hostRow(host: string, over: Partial<HostRow> = {}): HostRow {
  return {
    host,
    user: "root",
    os: "linux",
    labels: [],
    probed: true,
    healthy: true,
    detail: "",
    inFlight: 0,
    maxConcurrent: 1,
    queued: 0,
    lastRun: null as { taskId: string; ok: boolean } | null,
    ...over,
  };
}

function statusPayload(s: Fixture): Record<string, unknown> {
  if (s.provider === "tailscale") {
    return {
      enabled: true,
      running: true,
      provider: s.provider,
      hasSshKey: true,
      containerImage: "repoos-ci",
      maxConcurrent: 2,
      tailscaleHosts: s.tailscaleHosts,
      hosts: s.hosts as unknown[],
    };
  }
  return {
    enabled: true,
    running: true,
    provider: s.provider,
    hasSshKey: true,
    hasApiToken: true,
    snapshotConfigured: true,
    sshKeyName: "nick-key",
    serverType: "cax31",
    location: "hil",
    activeServer: null,
  };
}

const okJson = (data: unknown): Response =>
  ({ ok: true, status: 200, statusText: "OK", json: async () => data }) as unknown as Response;

async function mountDrawer(overrides: Partial<Fixture> = {}): Promise<{
  wrapper: VueWrapper;
  ui: ReturnType<typeof useUiStore>;
  config: ReturnType<typeof useConfigStore>;
  calls: ApiCall[];
  fixture: Fixture;
}> {
  const fixture: Fixture = {
    provider: "tailscale",
    tailscaleHosts: [],
    hosts: [],
    statusFails: false,
    testResponse: null,
    testError: null,
    syncHostsOnSave: true,
    ...overrides,
  };
  const calls: ApiCall[] = [];

  // The fake server mirrors what the real route handlers do: status reflects
  // current provider/pool state, a config PATCH applies it, and saving the
  // pool repopulates the live host rows (the "Saved — new jobs will use this
  // pool." resolution depends on that round trip).
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string | URL, init?: RequestInit) => {
      const path = String(url);
      const method = (init?.method ?? "GET").toUpperCase();
      let body: unknown;
      if (typeof init?.body === "string") body = JSON.parse(init.body);
      calls.push({ method, path, body });
      if (path === "/api/remote-validation/status") {
        if (fixture.statusFails) {
          return {
            ok: false,
            status: 500,
            statusText: "Internal Server Error",
            json: async () => ({ error: "boom" }),
          } as unknown as Response;
        }
        return okJson(statusPayload(fixture));
      }
      if (path === "/api/remote-validation/test") {
        if (fixture.testError) throw fixture.testError;
        return okJson(fixture.testResponse ?? { ok: true, output: "" });
      }
      if (path === "/api/config" && method === "PATCH") {
        const partial = (body ?? {}) as Record<string, unknown>;
        if ("remoteValidation.provider" in partial) {
          fixture.provider = partial["remoteValidation.provider"] as Fixture["provider"];
        }
        if ("remoteValidation.tailscaleHosts" in partial) {
          fixture.tailscaleHosts = partial["remoteValidation.tailscaleHosts"] as string[];
          if (fixture.syncHostsOnSave) {
            fixture.hosts = fixture.tailscaleHosts.map((host) => hostRow(host));
          }
        }
        return okJson({ ok: true });
      }
      throw new Error(`unexpected fetch ${method} ${path}`);
    }),
  );

  const pinia = createPinia();
  setActivePinia(pinia);
  const ui = useUiStore();
  const config = useConfigStore();
  ui.openRemoteValidation();
  const wrapper = mount(RemoteValidationDrawer, {
    global: { plugins: [pinia], stubs: dialogStubs },
  });
  await flush();
  return { wrapper, ui, config, calls, fixture };
}

/** The two `#0521` sections share the `.rvr-hosts` class; tell them apart by their h3. */
function poolSectionTitles(wrapper: VueWrapper): string[] {
  return wrapper.findAll(".rvr-hosts h3").map((h) => h.text());
}

function tabByLabel(wrapper: VueWrapper, label: string) {
  const tab = wrapper.findAll(".rvr-tab").find((b) => b.text() === label);
  if (!tab) throw new Error(`no provider tab labelled ${label}`);
  return tab;
}

const POPULATED_POOL_HOSTS: HostRow[] = [
  {
    host: "bee",
    user: "root",
    os: "linux",
    labels: ["docker"],
    probed: true,
    healthy: true,
    detail: "",
    inFlight: 1,
    maxConcurrent: 2,
    queued: 0,
    lastRun: { taskId: "0548", ok: true },
  },
  {
    host: "mac1",
    user: "nick",
    os: "macos",
    labels: [],
    probed: true,
    healthy: false,
    detail: "ssh: permission denied (publickey)",
    inFlight: 0,
    maxConcurrent: 1,
    queued: 3,
    lastRun: { taskId: "0546", ok: false },
  },
  {
    host: "fresh1",
    user: "root",
    os: "",
    labels: [],
    probed: false,
    healthy: false,
    detail: "",
    inFlight: 0,
    maxConcurrent: 1,
    queued: 0,
    lastRun: null,
  },
];

describe("RemoteValidationDrawer", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
  });

  describe("#0521 regression — empty pool vs host-pool editor", () => {
    it("renders the host-pool editor for tailscale even when status.hosts is empty", async () => {
      // The exact bug #0521 shipped: the editor shared the status list's
      // v-if, so an empty pool hid the only UI that could add the first host.
      const { wrapper } = await mountDrawer();
      expect(poolSectionTitles(wrapper)).toEqual(["Host pool"]);

      const input = wrapper.get("#rvr-hosts-input");
      expect(input.attributes("placeholder")).toBe("bee, mac1");
      expect((input.element as HTMLInputElement).value).toBe("");

      const save = wrapper.get('[data-testid="save-hosts"]');
      expect(save.text()).toBe("Save hosts");
      expect(save.attributes("disabled")).toBeUndefined();
    });

    it("does NOT render the Hosts status list when status.hosts is empty", async () => {
      const { wrapper } = await mountDrawer();
      expect(wrapper.findAll(".rvr-host")).toHaveLength(0);
      // The status list's heading gone with its rows; only the editor remains.
      expect(poolSectionTitles(wrapper).includes("Hosts")).toBe(false);
    });

    it("shows the empty-state readiness hint and the needs-setup status for an empty pool", async () => {
      const { wrapper } = await mountDrawer();
      expect(wrapper.text()).toContain("hosts: missing — set tailscaleHost or tailscaleHosts");
      expect(wrapper.text()).toContain("Needs setup — no tailscale host configured");
    });

    it("prefills the editor input from the configured pool and renders host rows", async () => {
      const pool: HostRow[] = POPULATED_POOL_HOSTS;
      const { wrapper } = await mountDrawer({
        tailscaleHosts: pool.map((h) => h.host),
        hosts: pool,
      });

      expect((wrapper.get("#rvr-hosts-input").element as HTMLInputElement).value).toBe(
        "bee, mac1, fresh1",
      );

      const rows = wrapper.findAll(".rvr-host");
      expect(rows).toHaveLength(3);
      // row 1: probed + healthy → "ready", caps built from os + labels
      expect(rows[0].text()).toContain("root@bee");
      expect(rows[0].text()).toContain("linux · docker");
      expect(rows[0].text()).toContain("in flight 1/2");
      expect(rows[0].text()).toContain("ready");
      expect(rows[0].find(".rvr-host-state--ok").exists()).toBe(true);
      expect(rows[0].text()).toContain("last: #0548 passed");
      // row 2: probed + unhealthy → its detail, plus the queued count
      expect(rows[1].text()).toContain("nick@mac1");
      expect(rows[1].get(".rvr-host-state--bad").text()).toContain("ssh: permission denied");
      expect(rows[1].text()).toContain("3 queued");
      expect(rows[1].text()).toContain("last: #0546 failed");
      // row 3: never probed → idle state saying what to do
      expect(rows[2].get(".rvr-host-state--idle").text()).toContain("not checked yet");

      expect(poolSectionTitles(wrapper)).toEqual(["Hosts", "Host pool"]);
    });
  });

  describe("provider switching", () => {
    it("starts on tailscale with its provider-specific sections", async () => {
      const { wrapper } = await mountDrawer({ tailscaleHosts: ["bee"], hosts: [hostRow("bee")] });
      const active = wrapper.get(".rvr-tab.active");
      expect(active.text()).toBe("Tailscale");
      expect(wrapper.findAll('button[role="switch"]')).toHaveLength(3);
      expect(wrapper.text()).toContain("containerImage: repoos-ci");
      expect(wrapper.text()).not.toContain("HETZNER_API_TOKEN");
      // tailscale setup recipe, not hetzner's
      expect(wrapper.text()).toContain("Install Docker on the runner machine");
      expect(wrapper.text()).not.toContain("Hetzner API token");
    });

    it("switches to hetzner: readiness, setup steps and pool editor swap over", async () => {
      const { wrapper } = await mountDrawer({ tailscaleHosts: ["bee"], hosts: [hostRow("bee")] });

      await tabByLabel(wrapper, "Hetzner").trigger("click");
      await flush();

      expect(wrapper.get(".rvr-tab.active").text()).toBe("Hetzner");
      // hetzner readiness replaces the tailscale lines
      expect(wrapper.text()).toContain("HETZNER_API_TOKEN: set");
      expect(wrapper.text()).toContain("snapshotId: set");
      expect(wrapper.text()).toContain("runner VM: none running");
      expect(wrapper.text()).not.toContain("containerImage:");
      // both tailscale-only sections go away — pool editor included
      expect(wrapper.findAll(".rvr-hosts h3")).toHaveLength(0);
      expect(wrapper.find("#rvr-hosts-input").exists()).toBe(false);
      expect(wrapper.findAll(".rvr-host")).toHaveLength(0);
      // and the setup recipe swaps
      expect(wrapper.text()).toContain("Hetzner API token");
      expect(wrapper.text()).not.toContain("Install Docker on the runner machine");
      expect(wrapper.text()).toContain(".env (secrets — never commit)");
    });

    it("switches back to tailscale and the pool editor returns", async () => {
      const { wrapper, calls } = await mountDrawer();

      await tabByLabel(wrapper, "Hetzner").trigger("click");
      await flush();
      await tabByLabel(wrapper, "Tailscale").trigger("click");
      await flush();

      expect(poolSectionTitles(wrapper)).toEqual(["Host pool"]);
      expect(wrapper.get(".rvr-tab.active").text()).toBe("Tailscale");
      // provider PATCHes issued for the tab clicks (not just the reads)
      const patches = calls.filter((c) => c.method === "PATCH");
      expect(
        patches.map((c) => (c.body as Record<string, unknown>)["remoteValidation.provider"]),
      ).toEqual(["hetzner", "tailscale"]);
      // initial mount + one refresh per switch
      expect(calls.filter((c) => c.path === "/api/remote-validation/status")).toHaveLength(3);
    });
  });

  describe("host pool editor", () => {
    it("saves a comma-separated pool and re-syncs the input from fresh status", async () => {
      const { wrapper, calls } = await mountDrawer();

      await wrapper.get("#rvr-hosts-input").setValue(" bee , mac1 ,");
      await wrapper.get('[data-testid="save-hosts"]').trigger("click");
      await flush();

      const patch = calls.find(
        (c) => c.method === "PATCH" && "remoteValidation.tailscaleHosts" in (c.body as object),
      );
      expect(patch).toBeTruthy();
      expect((patch!.body as Record<string, unknown>)["remoteValidation.tailscaleHosts"]).toEqual([
        "bee",
        "mac1",
      ]);
      // the server-reported pool is fed back into the editor
      expect((wrapper.get("#rvr-hosts-input").element as HTMLInputElement).value).toBe("bee, mac1");
      expect(wrapper.get(".btn-row .tunnel-help").text()).toBe(
        "Saved — new jobs will use this pool.",
      );
    });

    it("refuses an empty pool with guidance instead of clearing the config", async () => {
      const { wrapper, calls } = await mountDrawer();

      await wrapper.get('[data-testid="save-hosts"]').trigger("click");
      await flush();

      expect(calls.filter((c) => c.method === "PATCH")).toHaveLength(0);
      expect(wrapper.get(".btn-row .tunnel-help").text()).toBe(
        "Nothing to save — add at least one host. To remove every host, edit repoos.toml.",
      );
    });

    it("does not claim success when the live dispatcher still has the old pool", async () => {
      // "Never claim success on trust" (from the code comment): the save
      // landed in config but the live host rows lag behind.
      const { wrapper } = await mountDrawer({
        tailscaleHosts: ["bee"],
        hosts: [hostRow("bee")],
        syncHostsOnSave: false,
      });

      await wrapper.get("#rvr-hosts-input").setValue("bee, mac1");
      await wrapper.get('[data-testid="save-hosts"]').trigger("click");
      await flush();

      const msg = wrapper.get(".btn-row .tunnel-help").text();
      expect(msg).toContain("Saved, but the live dispatcher has [bee]");
      expect(msg).toContain("check repoos.toml");
    });
  });

  describe("test connection", () => {
    it("shows a passing run with its output", async () => {
      const { wrapper } = await mountDrawer({
        testResponse: { ok: true, output: "bee: docker 27.3.1 · validate.sh ok" },
      });

      const section = wrapper.get(".rvr-test-section");
      await section.get("button").trigger("click");
      await flush();

      expect(section.get("button").text()).toBe("Passed");
      expect(wrapper.get(".rvr-codeblock").text()).toBe("bee: docker 27.3.1 · validate.sh ok");
      expect(wrapper.find(".rvr-codeblock--fail").exists()).toBe(false);
    });

    it("shows a failing run with its error and marks the output block", async () => {
      const { wrapper } = await mountDrawer({
        testResponse: { ok: false, error: "bee: ssh refused" },
      });

      const section = wrapper.get(".rvr-test-section");
      await section.get("button").trigger("click");
      await flush();

      expect(section.get("button").text()).toBe("Failed");
      const block = wrapper.get(".rvr-codeblock--fail");
      expect(block.text()).toBe("bee: ssh refused");
    });

    it("surfaces a thrown network error as the failed output", async () => {
      const { wrapper } = await mountDrawer({
        testError: new Error("Can't reach the RepoOS server — it may be down."),
      });

      const section = wrapper.get(".rvr-test-section");
      await section.get("button").trigger("click");
      await flush();

      expect(section.get("button").text()).toBe("Failed");
      expect(wrapper.get(".rvr-codeblock--fail").text()).toContain("Can't reach the RepoOS server");
    });
  });

  it("degrades gracefully when the status fetch fails", async () => {
    const { wrapper } = await mountDrawer({ statusFails: true });

    expect(wrapper.text()).toContain("Status unavailable.");
    // no provider-specific content when nothing loaded
    expect(wrapper.find(".tunnel-checks").exists()).toBe(false);
    expect(wrapper.find(".rvr-hosts").exists()).toBe(false);
  });

  it("keeps the host-pool editor's v-if split from the status list in the template", () => {
    // Belt and braces for the mounted tests above: the exact re-merge of the
    // two conditions (#0521) is caught here even if fixture drift ever hides
    // it. The status list carries the hosts-length gate; the editor's own
    // v-if must not.
    const src = readFileSync(join(uiRoot, "src/components/RemoteValidationDrawer.vue"), "utf8");
    const statusGate = src.indexOf("(status?.hosts || []).length");
    expect(statusGate).toBeGreaterThan(-1);
    const editorComment = src.indexOf("Host pool editor");
    expect(editorComment).toBeGreaterThan(statusGate);

    // The editor's own v-if is the first one after the editor comment; it must
    // be exactly the provider gate with no hosts-length condition re-merged.
    const editorBlock = src.slice(editorComment);
    const editorVif = editorBlock.match(/v-if="([^"]+)"/);
    expect(editorVif?.[1]).toBe("provider === 'tailscale'");
  });
});
