// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { defineComponent, h } from "vue";

const mocks = vi.hoisted(() => ({
  server: {
    id: "server-1",
    url: "https://repoos.example",
    name: "repoos",
    order: 0,
    createdAt: 1,
  },
  verify: vi.fn(),
  selectServer: vi.fn(async () => undefined),
  openServer: vi.fn(async () => undefined),
  init: vi.fn(async () => undefined),
}));

vi.mock("../../../mobile/src/app-state", async () => {
  const { ref } = await import("vue");
  return {
    servers: ref([mocks.server]),
    selectedId: ref(null),
    selectServer: mocks.selectServer,
    addServer: vi.fn(async () => ({ error: null })),
    removeServer: vi.fn(),
    renameServer: vi.fn(),
    moveServer: vi.fn(),
    setLock: vi.fn(),
    lockSettings: ref({ enabled: true, scope: "server" }),
    lockSupported: ref(true),
    loaded: ref(true),
    designTheme: ref("classic"),
    appearanceMode: ref("system"),
    reachability: ref({}),
    setDesignTheme: vi.fn(),
    setAppearanceMode: vi.fn(),
    discovery: ref({
      trustedName: "",
      trustedUrl: "",
      message: "",
      error: "",
      results: [],
      selected: [],
    }),
    discoveryLoading: ref(false),
    discoverTailnet: vi.fn(),
    toggleDiscovered: vi.fn(),
    addSelectedDiscovered: vi.fn(),
    init: mocks.init,
  };
});

vi.mock("../../../mobile/src/browser", () => ({
  openServer: mocks.openServer,
  onBrowserEvents: vi.fn(),
}));
vi.mock("../../../mobile/src/lock", () => ({
  verifyWithDeviceLock: mocks.verify,
  lockOverlayShouldRemainOpen: (verified: boolean) => !verified,
}));
vi.mock("../../../mobile/src/platform", () => ({
  loadHubDevUpdateConfig: vi.fn(async () => ({ installedCommit: "test", enabled: false })),
  resolveShellPlatform: () => "web",
}));
vi.mock("../../../mobile/src/fixture", () => ({
  readHubFixture: () => null,
  fixtureInitialRoute: () => "picker",
}));
vi.mock("../../../mobile/src/haptics", () => ({ impactHeavy: vi.fn() }));
vi.mock("../../../mobile/src/back-navigation", () => ({
  installHubBackButton: vi.fn(async () => vi.fn(async () => undefined)),
}));
vi.mock("../../../mobile/src/dev-updates", () => ({
  checkForDevUpdate: vi.fn(async () => null),
  openDevUpdateApk: vi.fn(),
  snoozeDevUpdate: vi.fn(),
}));

import App from "../../../mobile/src/App.vue";

const ServerListStub = defineComponent({
  name: "ServerListView",
  props: ["servers"],
  emits: ["select"],
  setup(props, { emit }) {
    return () =>
      h(
        "button",
        {
          "data-testid": "select-server",
          onClick: () => emit("select", props.servers[0]),
        },
        "Open server",
      );
  },
});

function mountApp() {
  return mount(App, {
    global: {
      stubs: {
        HubLogo: true,
        ServerListView: ServerListStub,
        SettingsView: true,
        AddServerView: true,
        TailnetDiscoveryView: true,
        BottomSheet: true,
      },
    },
  });
}

describe("Hub App server-scope lock flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    document.documentElement.className = "";
  });

  it("offers a cancel path after rejection without opening the server", async () => {
    mocks.verify.mockResolvedValueOnce(false);
    const wrapper = mountApp();
    await flushPromises();

    await wrapper.find('[data-testid="select-server"]').trigger("click");
    await flushPromises();

    expect(wrapper.find(".lock-overlay").exists()).toBe(true);
    expect(wrapper.find('[data-testid="hub-lock-cancel"]').exists()).toBe(true);
    expect(mocks.openServer).not.toHaveBeenCalled();

    await wrapper.find('[data-testid="hub-lock-cancel"]').trigger("click");
    expect(wrapper.find(".lock-overlay").exists()).toBe(false);
    expect(mocks.openServer).not.toHaveBeenCalled();
  });

  it("opens the originally tapped server after a successful retry", async () => {
    mocks.verify.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    const wrapper = mountApp();
    await flushPromises();

    await wrapper.find('[data-testid="select-server"]').trigger("click");
    await flushPromises();
    expect(wrapper.find(".lock-overlay").exists()).toBe(true);

    await wrapper.find(".btn-primary").trigger("click");
    await flushPromises();

    expect(mocks.verify).toHaveBeenCalledTimes(2);
    expect(mocks.selectServer).toHaveBeenCalledWith(mocks.server.id);
    expect(mocks.openServer).toHaveBeenCalledWith(mocks.server.url);
    expect(wrapper.find(".lock-overlay").exists()).toBe(false);
  });
});
