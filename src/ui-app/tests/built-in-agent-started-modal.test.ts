import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { h } from "vue";
import { mount, type VueWrapper } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import BuiltInAgentCard from "../src/components/BuiltInAgentCard.vue";
import { useConfigStore } from "../src/stores/config";
import { flush } from "./component-test-helpers";

// Render dialog children in place; real radix only adds portal/overlay behaviour.
// Template-based stub so `open` updates re-render reliably under VTU.
const DialogStub = {
  props: { open: { type: Boolean, default: false } },
  template: `<div v-if="open"><slot /></div>`,
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
  AgentModelControl: true,
  Select: true,
  SelectTrigger: true,
  SelectValue: true,
  SelectContent: true,
  SelectViewport: true,
  SelectItem: true,
  routerLink: true,
};

describe("BuiltInAgentCard 'Run now' started modal", () => {
  let pinia: ReturnType<typeof createPinia>;

  beforeEach(() => {
    pinia = createPinia();
    setActivePinia(pinia);
    const config = useConfigStore();
    config.agentsMeta = {
      clis: ["opencode"],
      models: ["default"],
      defaults: [],
      skills: [],
    };
    config.data = {
      builtInAgents: {
        performance: { enabled: true, schedule: "manual" },
        "tech-debt": { enabled: true, schedule: "manual" },
        design: { enabled: true, schedule: "manual" },
        architect: { enabled: true, schedule: "manual" },
        "docs-debt": { enabled: true, schedule: "manual" },
      },
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function mountCard(agent: string): VueWrapper {
    return mount(BuiltInAgentCard, {
      props: { agent },
      global: {
        plugins: [pinia],
        stubs: dialogStubs,
      },
    });
  }

  function mockPendingRun(response: Record<string, unknown>): {
    resolve: () => void;
  } {
    let resolveApi!: (val: unknown) => void;
    const apiPromise = new Promise((resolve) => {
      resolveApi = resolve;
    });

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const path = typeof input === "string" ? input : input.toString();
      // Let the run wait; config saves after completion resolve immediately.
      if (path.includes("/api/agents/built-in/") && path.endsWith("/run")) {
        await apiPromise;
        return {
          ok: true,
          status: 200,
          json: async () => response,
        } as Response;
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          config: {
            builtInAgents: {
              performance: { enabled: true, schedule: "manual" },
              "tech-debt": { enabled: true, schedule: "manual" },
              design: { enabled: true, schedule: "manual" },
              architect: { enabled: true, schedule: "manual" },
              "docs-debt": { enabled: true, schedule: "manual" },
            },
          },
        }),
      } as Response;
    });

    return { resolve: () => resolveApi(true) };
  }

  it("shows the started modal immediately on 'Run now' click before API completes", async () => {
    const pending = mockPendingRun({
      ok: true,
      taskCount: 0,
      scannedFiles: 10,
    });

    const wrapper = mountCard("performance");
    await flush();

    const runButton = wrapper.findAll("button").find((b) => b.text().includes("Run now"));
    expect(runButton).toBeDefined();

    expect(wrapper.find('[data-testid="built-in-started-modal"]').exists()).toBe(false);

    await runButton!.trigger("click");
    await flush();

    const modal = wrapper.find('[data-testid="built-in-started-modal"]');
    expect(modal.exists()).toBe(true);
    expect(modal.text()).toContain("Performance Agent started");
    expect(modal.text()).toContain(
      "Scans for performance issues like slow functions, blocking operations, deeply nested loops, unbounded memory growth, and duplicate computations. Findings are bundled into one inbox task.",
    );
    expect(modal.text()).toContain("Usually takes 1–3 minutes");
    expect(modal.text()).toContain(
      "Findings will appear as a new task in your inbox when the run is complete.",
    );

    pending.resolve();
    await flush(24);
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="built-in-started-modal"]').exists()).toBe(false);
    });
    expect(wrapper.find(".built-in-status.success").exists()).toBe(true);
  });

  it("dismisses the modal when 'Got it' button is clicked while run continues", async () => {
    const pending = mockPendingRun({
      ok: true,
      taskCount: 1,
      taskId: "0999",
      scannedFiles: 5,
    });

    const wrapper = mountCard("tech-debt");
    await flush();

    const runButton = wrapper.findAll("button").find((b) => b.text().includes("Run now"));
    await runButton!.trigger("click");
    await flush();

    expect(wrapper.find('[data-testid="built-in-started-modal"]').exists()).toBe(true);

    const gotItBtn = wrapper.findAll("button").find((b) => b.text().trim() === "Got it");
    expect(gotItBtn).toBeDefined();
    await gotItBtn!.trigger("click");
    await flush();

    expect(wrapper.find('[data-testid="built-in-started-modal"]').exists()).toBe(false);
    expect(wrapper.text()).toContain("Running…");

    pending.resolve();
    await flush();

    expect(wrapper.find(".built-in-status.success").exists()).toBe(true);
  });

  it("provides correct agent-specific copy for all built-in team agents", async () => {
    const agents = [
      {
        slug: "performance",
        name: "Performance Agent",
        copy: "Scans for performance issues like slow functions, blocking operations, deeply nested loops, unbounded memory growth, and duplicate computations. Findings are bundled into one inbox task.",
      },
      {
        slug: "tech-debt",
        name: "Tech Debt Agent",
        copy: "Scans for technical debt patterns including outdated dependencies, code duplication, high-complexity files, unused code, and deprecated APIs. Findings are bundled into one inbox task.",
      },
      {
        slug: "design",
        name: "Design Agent",
        copy: "Reviews your web UI for layout issues, styling inconsistencies, accessibility gaps, and UX friction. Findings and proposed fixes are bundled into one inbox task.",
      },
      {
        slug: "architect",
        name: "Architect Agent",
        copy: "Analyses your codebase for tight coupling, missing abstractions, scalability risks, and over-engineering. Findings are bundled into one inbox task.",
      },
      {
        slug: "docs-debt",
        name: "Docs Debt Agent",
        copy: "Verifies that AGENTS.md and your project docs still match the code — checks file paths, symbols, and stated constraints. Stale references it can fix automatically are committed; anything that needs a human decision is bundled into one inbox task.",
      },
    ];

    for (const item of agents) {
      vi.spyOn(globalThis, "fetch").mockReturnValue(new Promise(() => {})); // never resolves

      const wrapper = mountCard(item.slug);
      await flush();

      const runButton = wrapper.findAll("button").find((b) => b.text().includes("Run now"));
      await runButton!.trigger("click");
      await flush();

      const modal = wrapper.find('[data-testid="built-in-started-modal"]');
      expect(modal.exists()).toBe(true);
      expect(modal.text()).toContain(`${item.name} started`);
      expect(modal.text()).toContain(item.copy);
      expect(modal.text()).toContain("Usually takes 1–3 minutes");
      expect(modal.text()).toContain(
        "Findings will appear as a new task in your inbox when the run is complete.",
      );
      wrapper.unmount();
      vi.restoreAllMocks();
    }
  });
});
