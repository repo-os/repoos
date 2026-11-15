// @vitest-environment jsdom
/**
 * Hub picker interaction (#1131).
 *
 * Reordering is hold-to-drag now: there is no Edit mode, so the row itself must
 * distinguish a tap (open the server) from a scroll (do nothing) from a long
 * press followed by movement (reorder). These tests drive real pointer events
 * against the component so that distinction stays honest.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import type { ServerEntry } from "../../../mobile/src/types";

vi.mock("../../../mobile/src/haptics", () => ({
  impactLight: vi.fn(),
  impactMedium: vi.fn(),
}));

import ServerListView from "../../../mobile/src/components/ServerListView.vue";
import TailnetDiscoveryView from "../../../mobile/src/components/TailnetDiscoveryView.vue";

const SERVERS: ServerEntry[] = [
  { id: "a", url: "https://a.example", name: "a", order: 0, createdAt: 1 },
  { id: "b", url: "https://b.example", name: "b", order: 1, createdAt: 2 },
  { id: "c", url: "https://c.example", name: "c", order: 2, createdAt: 3 },
];

function mountList(overrides: Record<string, unknown> = {}) {
  return mount(ServerListView, {
    props: {
      servers: SERVERS,
      selectedId: null,
      reachability: {},
      loaded: true,
      platform: "android",
      ...overrides,
    },
  });
}

function pointerDown(el: Element, x = 10, y = 10) {
  el.dispatchEvent(
    new MouseEvent("pointerdown", { bubbles: true, cancelable: true, clientX: x, clientY: y }),
  );
}

function pointerMove(x: number, y: number) {
  window.dispatchEvent(
    new MouseEvent("pointermove", { bubbles: true, cancelable: true, clientX: x, clientY: y }),
  );
}

function pointerUp() {
  window.dispatchEvent(new MouseEvent("pointerup", { bubbles: true }));
}

function cardIds(wrapper: ReturnType<typeof mountList>): string[] {
  return wrapper.findAll(".server-card").map((card) => card.attributes("data-server-id") ?? "");
}

describe("mobile hub server list", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    delete (document as { elementFromPoint?: unknown }).elementFromPoint;
  });

  it("has no Edit mode and puts Find servers next to Add server", () => {
    const wrapper = mountList();

    expect(wrapper.find('[data-testid="hub-edit-toggle"]').exists()).toBe(false);
    expect(wrapper.find(".drag-handle").exists()).toBe(false);

    const find = wrapper.find('[data-testid="hub-find-tailnet"]');
    expect(find.exists()).toBe(true);
    expect(find.element.closest(".picker-actions")).not.toBeNull();
    expect(wrapper.findAll('[data-testid="hub-find-tailnet"]')).toHaveLength(1);
    expect(
      wrapper.find('[data-testid="hub-add-server"]').element.closest(".picker-actions"),
    ).not.toBeNull();
  });

  it("keeps both add actions when the list is empty", () => {
    const wrapper = mountList({ servers: [] });

    expect(wrapper.find('[data-testid="hub-empty-state"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="hub-find-tailnet"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="hub-add-server"]').exists()).toBe(true);
  });

  it("opens a server on tap and edits it from the ⋮ menu", async () => {
    const wrapper = mountList();

    await wrapper.findAll(".server-row")[1].trigger("click");
    expect(wrapper.emitted("select")?.[0]).toEqual([SERVERS[1]]);

    await wrapper.findAll('[data-testid="hub-server-more"]')[2].trigger("click");
    expect(wrapper.emitted("edit")?.[0]).toEqual([SERVERS[2]]);
    // Opening the menu never also opens the server.
    expect(wrapper.emitted("select")).toHaveLength(1);
  });

  it("starts a drag only after a long press, then saves the new order on release", async () => {
    const wrapper = mountList();
    const rows = wrapper.findAll(".server-row");

    pointerDown(rows[0].element);
    vi.advanceTimersByTime(200);
    await nextTick();
    expect(wrapper.find(".server-card.dragging").exists()).toBe(false);

    vi.advanceTimersByTime(150);
    await nextTick();
    expect(wrapper.find(".server-card.dragging").attributes("data-server-id")).toBe("a");

    // The finger moves over the last card while the row is lifted.
    const last = wrapper.findAll(".server-card")[2].element;
    document.elementFromPoint = vi.fn(() => last);
    pointerMove(10, 300);
    await nextTick();

    expect(cardIds(wrapper)).toEqual(["b", "c", "a"]);

    pointerUp();
    expect(wrapper.emitted("reorder")).toEqual([["a", 2]]);

    // The click that follows a drop must not open the server.
    await wrapper.findAll(".server-row")[0].trigger("click");
    expect(wrapper.emitted("select")).toBeUndefined();

    await nextTick();
    expect(wrapper.find(".server-card.dragging").exists()).toBe(false);
    expect(cardIds(wrapper)).toEqual(["a", "b", "c"]);
  });

  it("treats movement before the hold fires as a scroll, not a drag", async () => {
    const wrapper = mountList();

    pointerDown(wrapper.findAll(".server-row")[0].element);
    pointerMove(10, 120);
    vi.advanceTimersByTime(1000);
    await nextTick();

    expect(wrapper.find(".server-card.dragging").exists()).toBe(false);
    pointerUp();
    expect(wrapper.emitted("reorder")).toBeUndefined();

    // A tap after a scroll still opens the server (the browser cancels the
    // click on a real scroll; here we assert the component did not latch).
    await wrapper.findAll(".server-row")[0].trigger("click");
    expect(wrapper.emitted("select")?.[0]).toEqual([SERVERS[0]]);
  });

  it("does not open the server when a long press is released without dragging", async () => {
    const wrapper = mountList();

    pointerDown(wrapper.findAll(".server-row")[0].element);
    vi.advanceTimersByTime(350);
    await nextTick();
    pointerUp();

    await wrapper.findAll(".server-row")[0].trigger("click");
    expect(wrapper.emitted("select")).toBeUndefined();
    expect(wrapper.emitted("reorder")).toBeUndefined();
  });
});

describe("mobile tailnet discovery message", () => {
  function mountDiscovery(overrides: Record<string, unknown> = {}) {
    return mount(TailnetDiscoveryView, {
      props: {
        busy: false,
        trustedName: "bee",
        trustedUrl: "https://bee.example:7499",
        message: "",
        error: "",
        servers: [],
        selected: [],
        platform: "android",
        ...overrides,
      },
    });
  }

  it("offers manual add when the trusted server is too old for the endpoint", async () => {
    const wrapper = mountDiscovery({
      message:
        "bee is running an older RepoOS that can't list tailnet servers yet. " +
        "Update RepoOS on that machine, or add servers by URL.",
    });

    expect(wrapper.find('[data-testid="hub-discovery-message"]').text()).toContain("older RepoOS");
    const manual = wrapper.find('[data-testid="hub-discovery-add-manual"]');
    expect(manual.exists()).toBe(true);
    expect(manual.text()).toBe("Add server by URL");
    expect(wrapper.find('[data-testid="hub-add-discovered"]').exists()).toBe(false);

    await manual.trigger("click");
    expect(wrapper.emitted("manual")).toHaveLength(1);
  });

  it("keeps manual add out of the way while discovery runs and with results", () => {
    const busy = mountDiscovery({ busy: true });
    expect(busy.find('[data-testid="hub-discovery-add-manual"]').exists()).toBe(false);

    const results = mountDiscovery({
      servers: [
        {
          key: "https://new.example",
          url: "https://new.example",
          name: "new",
          host: "new",
          https: true,
          saved: false,
          selectable: true,
        },
      ],
    });
    expect(results.find('[data-testid="hub-discovery-add-manual"]').exists()).toBe(false);
    expect(results.find('[data-testid="hub-add-discovered"]').exists()).toBe(true);
  });
});
