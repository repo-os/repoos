// @vitest-environment jsdom
/**
 * #1269 — QA pass: command palette focus, wording and screen-reader contract.
 *
 * Every palette scope (all / settings / context) shares one SearchOverlay, so
 * each class of bug is pinned with a table over the scopes rather than one
 * case per caller:
 *   1. Screen readers: the input is a combobox whose active option is named by
 *      aria-activedescendant and whose listbox is aria-controls'd; groups are
 *      role=group and the keyboard legend is a labelled group (an aria-label on
 *      a role-less div is ignored by assistive tech).
 *   2. Focus: dismissing the palette returns focus to whatever had it before
 *      the palette opened, even when no caller passed returnFocusEl (the header
 *      pill does not).
 *   3. Keyboard movement keeps the active option scrolled into view.
 *   4. Wording/state: an empty query names the query, and an empty result list
 *      while doc bodies are still loading says so instead of "no match".
 *   5. Rendering: two results with the same title each get their own row
 *      (rows were keyed by title, so duplicates collided).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import SearchOverlay from "../src/components/SearchOverlay.vue";
import type { RecentSearchScope as SearchScope } from "../src/composables/use-recent-searches";
import { useDocsStore } from "../src/stores/docs";
import { useRepoStore } from "../src/stores/repo";
import { makeTask } from "./component-test-helpers";

vi.mock("vue-router", () => ({
  useRoute: () => ({ name: "work", query: {} }),
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    currentRoute: { value: { name: "work", query: {} } },
  }),
}));

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

beforeEach(() => {
  setActivePinia(createPinia());
  Element.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, text: async () => "" })),
  );
  document.body.innerHTML = "";
  useRepoStore().tasks = [
    makeTask({ id: "1269", title: "QA pass: command palette" }),
    makeTask({ id: "1270", title: "Duplicate title" }),
    makeTask({ id: "1271", title: "Duplicate title" }),
  ];
});

/** Scope + the query that yields rows without any seeded settings/docs. */
const SCOPES: { scope: SearchScope; query: string }[] = [
  { scope: "all", query: "QA pass" },
  { scope: "settings", query: "" },
  { scope: "context", query: "" },
];

function mountPalette(open: boolean, scope: SearchScope, returnFocusEl: HTMLElement | null = null) {
  return mount(SearchOverlay, {
    props: { open, scope, returnFocusEl },
    attachTo: document.body,
  });
}

function openPalette(scope: SearchScope) {
  return mountPalette(true, scope);
}

/** setProps is typed from the .vue shim, which omits `open`; cast to the real prop. */
function setOpen(wrapper: ReturnType<typeof mountPalette>, open: boolean): Promise<void> {
  return (wrapper as unknown as { setProps(p: { open: boolean }): Promise<void> }).setProps({
    open,
  });
}

function typeQuery(input: HTMLInputElement, q: string): void {
  input.value = q;
  input.dispatchEvent(new Event("input"));
}

function keydown(el: Element, key: string): void {
  el.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
}

describe.each(SCOPES)("palette a11y contract ($scope scope)", ({ scope, query }) => {
  it("wires the combobox input to its listbox and active option", async () => {
    const wrapper = openPalette(scope);
    try {
      const input = document.querySelector<HTMLInputElement>(".search-overlay-input")!;
      if (query) typeQuery(input, query);
      await nextTick();
      await wait(250);
      await nextTick();

      expect(input.getAttribute("role")).toBe("combobox");
      const listbox = document.querySelector<HTMLElement>("[role='listbox']")!;
      expect(listbox.getAttribute("role")).toBe("listbox");
      expect(input.getAttribute("aria-controls")).toBe(listbox.id);

      const rows = document.querySelectorAll<HTMLElement>(".search-overlay-body [role='option']");
      expect(rows.length).toBeGreaterThan(0);
      keydown(input, "ArrowDown");
      await nextTick();
      const active = input.getAttribute("aria-activedescendant");
      expect(active).toBeTruthy();
      expect(document.getElementById(active!)?.getAttribute("aria-selected")).toBe("true");

      for (const group of document.querySelectorAll(".search-group")) {
        expect(group.getAttribute("role")).toBe("group");
      }
    } finally {
      wrapper.unmount();
    }
  });

  it("labels the keyboard legend as a group rather than a bare aria-label div", async () => {
    const wrapper = openPalette(scope);
    try {
      const legend = document.querySelector(".search-overlay-keyboard-hint")!;
      expect(legend.getAttribute("role")).toBe("group");
      expect(legend.getAttribute("aria-label")).toBe("Keyboard controls");
    } finally {
      wrapper.unmount();
    }
  });
});

describe.each(SCOPES)("palette focus restore ($scope scope, no returnFocusEl)", ({ scope }) => {
  it("returns focus to the element that had it before the palette opened", async () => {
    const trigger = document.createElement("button");
    trigger.textContent = "Search";
    document.body.appendChild(trigger);
    trigger.focus();
    expect(document.activeElement).toBe(trigger);

    const wrapper = mountPalette(false, scope);
    try {
      await setOpen(wrapper, true);
      await wait(10);
      const input = document.querySelector<HTMLInputElement>(".search-overlay-input")!;
      expect(document.activeElement).toBe(input);

      keydown(input, "Escape");
      await wait(10);
      expect(document.activeElement).toBe(trigger);
    } finally {
      wrapper.unmount();
      trigger.remove();
    }
  });
});

describe("palette keyboard movement and state", () => {
  it("scrolls the newly highlighted option into view", async () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    const wrapper = openPalette("all");
    try {
      const input = document.querySelector<HTMLInputElement>(".search-overlay-input")!;
      typeQuery(input, "Duplicate");
      await wait(250);
      await nextTick();
      scrollIntoView.mockClear();
      keydown(input, "ArrowDown");
      await nextTick();
      await nextTick();
      expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest" });
    } finally {
      wrapper.unmount();
    }
  });

  it("renders every same-titled result as its own row", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const wrapper = openPalette("all");
    try {
      const input = document.querySelector<HTMLInputElement>(".search-overlay-input")!;
      typeQuery(input, "Duplicate title");
      await wait(250);
      await nextTick();
      const titles = Array.from(document.querySelectorAll(".search-row-title")).map(
        (el) => el.textContent,
      );
      expect(titles.filter((t) => t === "Duplicate title")).toHaveLength(2);
      expect(warn.mock.calls.flat().join(" ")).not.toContain("Duplicate keys");
    } finally {
      warn.mockRestore();
      wrapper.unmount();
    }
  });

  it("names the query in the empty result message", async () => {
    const wrapper = openPalette("all");
    try {
      const input = document.querySelector<HTMLInputElement>(".search-overlay-input")!;
      typeQuery(input, "zzz-nothing");
      await wait(250);
      await nextTick();
      expect(document.querySelector(".search-empty")?.textContent).toBe(
        "No results for “zzz-nothing”",
      );
    } finally {
      wrapper.unmount();
    }
  });

  it("keeps empty and loading copy out of the listbox, in a status region", async () => {
    const wrapper = openPalette("all");
    try {
      const input = document.querySelector<HTMLInputElement>(".search-overlay-input")!;
      typeQuery(input, "zzz-nothing");
      await wait(250);
      await nextTick();
      // A listbox may only contain option/group, so the message cannot live in it.
      expect(document.querySelector("[role='listbox']")).toBeNull();
      const status = document.querySelector(".search-status");
      expect(status?.getAttribute("role")).toBe("status");
      expect(status?.textContent).toBe("No results for “zzz-nothing”");
      // Collapsed while there is nothing to list, so the combobox state matches.
      expect(input.getAttribute("aria-expanded")).toBe("false");
      expect(input.getAttribute("aria-controls")).toBeNull();
    } finally {
      wrapper.unmount();
    }
  });

  it("expands the combobox and names its listbox only while results are listed", async () => {
    const wrapper = openPalette("all");
    try {
      const input = document.querySelector<HTMLInputElement>(".search-overlay-input")!;
      typeQuery(input, "Duplicate title");
      await wait(250);
      await nextTick();
      const listbox = document.querySelector<HTMLElement>("[role='listbox']")!;
      expect(listbox).not.toBeNull();
      expect(input.getAttribute("aria-expanded")).toBe("true");
      expect(input.getAttribute("aria-controls")).toBe(listbox.id);
    } finally {
      wrapper.unmount();
    }
  });

  it("returns focus to the header pill when the trigger was removed while open", async () => {
    const pill = document.createElement("button");
    pill.className = "search-input";
    document.body.appendChild(pill);
    const trigger = document.createElement("button");
    document.body.appendChild(trigger);
    trigger.focus();

    const wrapper = mountPalette(false, "all");
    try {
      await setOpen(wrapper, true);
      await wait(10);
      trigger.remove();
      const input = document.querySelector<HTMLInputElement>(".search-overlay-input")!;
      keydown(input, "Escape");
      await wait(10);
      expect(document.activeElement).toBe(pill);
    } finally {
      wrapper.unmount();
      pill.remove();
    }
  });

  it("does not let an older body load clear the loading state of a newer one", async () => {
    const pending: (() => void)[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise((resolve) => {
            pending.push(() => resolve({ ok: true, text: async () => "" }));
          }),
      ),
    );
    const docs = useDocsStore();
    docs.docs = [{ path: "docs/overlap-a.md", title: "A", mtimeMs: 0 }];
    const wrapper = mountPalette(false, "all");
    try {
      await setOpen(wrapper, true);
      const input = document.querySelector<HTMLInputElement>(".search-overlay-input")!;
      typeQuery(input, "zzz-nothing");
      await wait(250); // first load starts and stays pending
      docs.docs = [{ path: "docs/overlap-b.md", title: "B", mtimeMs: 0 }];
      await wait(250); // second load starts and stays pending
      pending[0]();
      await wait(10); // the older load settles first
      await nextTick();
      expect(document.querySelector(".search-status")?.textContent).toBe("Loading results…");
      pending[1]();
      await wait(10);
      await nextTick();
      expect(document.querySelector(".search-status")?.textContent).toBe(
        "No results for “zzz-nothing”",
      );
    } finally {
      wrapper.unmount();
      docs.docs = [];
    }
  });

  it("falls back to the header pill when the caller's trigger was unmounted", async () => {
    const pill = document.createElement("button");
    pill.className = "search-input";
    document.body.appendChild(pill);
    const caller = document.createElement("button");
    // Never attached: the caller's trigger unmounted before the palette closed.
    const wrapper = mountPalette(false, "context", caller);
    try {
      await setOpen(wrapper, true);
      await wait(10);
      const input = document.querySelector<HTMLInputElement>(".search-overlay-input")!;
      keydown(input, "Escape");
      await wait(10);
      expect(document.activeElement).toBe(pill);
    } finally {
      wrapper.unmount();
      pill.remove();
    }
  });

  it("falls back to the header pill when nothing was focused before opening", async () => {
    const pill = document.createElement("button");
    pill.className = "search-input";
    document.body.appendChild(pill);
    (document.activeElement as HTMLElement | null)?.blur();
    const wrapper = mountPalette(false, "all");
    try {
      await setOpen(wrapper, true);
      await wait(10);
      const input = document.querySelector<HTMLInputElement>(".search-overlay-input")!;
      keydown(input, "Escape");
      await wait(10);
      expect(document.activeElement).toBe(pill);
    } finally {
      wrapper.unmount();
      pill.remove();
    }
  });

  it("keeps the loading state until the older load settles, even if the newer one finishes first", async () => {
    const pending: (() => void)[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise((resolve) => {
            pending.push(() => resolve({ ok: true, text: async () => "" }));
          }),
      ),
    );
    const docs = useDocsStore();
    docs.docs = [{ path: "docs/inverse-a.md", title: "A", mtimeMs: 0 }];
    const wrapper = mountPalette(false, "all");
    try {
      await setOpen(wrapper, true);
      const input = document.querySelector<HTMLInputElement>(".search-overlay-input")!;
      typeQuery(input, "zzz-nothing");
      await wait(250);
      docs.docs = [{ path: "docs/inverse-b.md", title: "B", mtimeMs: 0 }];
      await wait(250);
      pending[1](); // newer load settles first
      await wait(10);
      await nextTick();
      expect(document.querySelector(".search-status")?.textContent).toBe("Loading results…");
      pending[0](); // older load settles last
      await wait(10);
      await nextTick();
      expect(document.querySelector(".search-status")?.textContent).toBe(
        "No results for “zzz-nothing”",
      );
    } finally {
      wrapper.unmount();
      docs.docs = [];
    }
  });

  it("says results are loading, not 'no match', while doc bodies are fetched", async () => {
    useDocsStore().docs = [{ path: "docs/loading-probe.md", title: "Probe", mtimeMs: 0 }];
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => {})),
    );
    // Mount closed and open it, as the header pill does: the body load is
    // scheduled by the open watcher, which does not fire for an initial prop.
    const wrapper = mountPalette(false, "all");
    try {
      await setOpen(wrapper, true);
      const input = document.querySelector<HTMLInputElement>(".search-overlay-input")!;
      typeQuery(input, "zzz-nothing");
      await wait(250);
      await nextTick();
      expect(document.querySelector(".search-empty")?.textContent).toBe("Loading results…");
    } finally {
      wrapper.unmount();
      useDocsStore().docs = [];
    }
  });
});
