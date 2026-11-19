// @vitest-environment jsdom
/**
 * #1231 — QA pass: keyboard shortcuts and the command palette across pages.
 *
 * Inventory verified here (full write-up in docs/qa/2026-11-keyboard-shortcuts-qa.md):
 *   ⌘K / Ctrl+K  — command palette (SearchBar on every route except repo and
 *                  settings, where the view-scoped palette handles it)
 *   Esc          — closes the topmost floating layer only: the palette consumes
 *                  Escape while open (fixed here), the board nav's two-stage
 *                  close then still works, header popovers / dialogs keep their
 *                  own handlers for Escapes that are not already handled
 *   j/k/h/l etc. — board navigation (opt-in), never while focus is editable
 *
 * Bugs this suite locks down:
 *   1. Escape with the palette open also reached window-level Escape handlers —
 *      on Work with a task drawer open, one Esc closed the palette AND the
 *      drawer (SearchOverlay now stops propagation; the AreaPicker popover
 *      already used the same pattern).
 *   2. The palette backdrop and the task drawer shared z-index 100, so the
 *      palette could lose the stacking race against an already-open drawer.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, nextTick, ref, type Ref } from "vue";
import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import SearchBar from "../src/components/SearchBar.vue";
import SearchOverlay from "../src/components/SearchOverlay.vue";
import CopyInspectorOverlay from "../src/components/CopyInspectorOverlay.vue";
import { useBoardKeyboardNav } from "../src/composables/useBoardKeyboardNav.js";
import { makeTask } from "./component-test-helpers";
import type { Task } from "../src/types.js";

const hoisted = vi.hoisted(() => ({ routeName: "work" as string }));

vi.mock("vue-router", () => ({
  useRoute: () => ({ name: hoisted.routeName, query: {} }),
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    currentRoute: { value: { name: hoisted.routeName, query: {} } },
  }),
}));

beforeEach(() => {
  setActivePinia(createPinia());
  // jsdom does not implement scrollIntoView; the board nav scrolls its
  // highlight into view on every move.
  Element.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, text: async () => "", json: async () => ({}) })),
  );
  hoisted.routeName = "work";
  document.body.innerHTML = "";
});

/* ── 1. ⌘K coverage: the palette opens on every main page ────────────────── */

/** Routes that render the shared top bar and must answer ⌘K with the palette.
 *  repo/settings are excluded on purpose: those views open their own scoped
 *  palette (context docs / settings), so the global handler steps aside. */
const PALETTE_ROUTES = [
  "dashboard",
  "work",
  "client-board",
  "stories",
  "checks",
  "dev",
  "secrets",
  "releases",
  "deployments",
  "inputs",
  "agents",
  "diff",
] as const;

describe("⌘K opens the command palette on every main page", () => {
  it.each(PALETTE_ROUTES)("opens the palette on the %s route", async (routeName) => {
    hoisted.routeName = routeName;
    const wrapper = mount(SearchBar, { attachTo: document.body });
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "k", metaKey: true, bubbles: true, cancelable: true }),
    );
    await nextTick();
    expect(document.body.querySelector(".search-overlay-backdrop")).toBeTruthy();
    wrapper.unmount();
  });

  it("also answers Ctrl+K (Windows/Linux) with the palette", async () => {
    const wrapper = mount(SearchBar, { attachTo: document.body });
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "K", ctrlKey: true, bubbles: true, cancelable: true }),
    );
    await nextTick();
    expect(document.body.querySelector(".search-overlay-backdrop")).toBeTruthy();
    wrapper.unmount();
  });

  it.each(["repo", "settings"] as const)(
    "steps aside on the %s route so the view-scoped palette can answer ⌘K",
    async (routeName) => {
      hoisted.routeName = routeName;
      const wrapper = mount(SearchBar, { attachTo: document.body });
      const event = new KeyboardEvent("keydown", {
        key: "k",
        metaKey: true,
        bubbles: true,
        cancelable: true,
      });
      window.dispatchEvent(event);
      await nextTick();
      expect(document.body.querySelector(".search-overlay-backdrop")).toBeNull();
      // Not consumed here: the view's own handler must still get a chance.
      expect(event.defaultPrevented).toBe(false);
      wrapper.unmount();
    },
  );

  /** Wiring guard: the two scoped palettes must keep their ⌘K handlers. Full
   *  mounts of these views are disproportionate; the assertion pins the exact
   *  handler wiring (metaKey/ctrlKey + "k" + preventDefault + open call). */
  it("keeps the scoped ⌘K handlers wired in ContextView and SettingsView", async () => {
    for (const [file, opener] of [
      ["ContextView.vue", "openContextSearch\\(\\)"],
      ["SettingsView.vue", "openSettingsSearch\\(\\)"],
    ] as const) {
      const source = readFileSync(resolve(__dirname, "../src/views", file), "utf8");
      const pattern = new RegExp(
        `function on\\w*SearchKey\\([^)]*\\)[\\s\\S]{0,120}?metaKey[\\s\\S]{0,120}?=== "k"` +
          `[\\s\\S]{0,120}?preventDefault\\(\\)[\\s\\S]{0,120}?${opener}`,
      );
      expect(pattern.test(source), `${file} lost its ⌘K handler`).toBe(true);
    }
  });

  it("opens the palette even when focus is inside a page text field", async () => {
    const wrapper = mount(SearchBar, { attachTo: document.body });
    const field = document.createElement("input");
    document.body.appendChild(field);
    field.focus();
    expect(document.activeElement).toBe(field);
    field.dispatchEvent(
      new KeyboardEvent("keydown", { key: "k", metaKey: true, bubbles: true, cancelable: true }),
    );
    await nextTick();
    expect(document.body.querySelector(".search-overlay-backdrop")).toBeTruthy();
    wrapper.unmount();
  });
});

/* ── 2. Escape is consumed by the topmost layer (the palette) ────────────── */

/** Copy-inspector harness: the popup opens from the affordance pill, exactly
 *  as copy-inspector-overlay.test.ts drives it. Its window keydown listener
 *  runs in the CAPTURE phase, ahead of every bubble handler, so it is the one
 *  layer whose Escape handling `stopPropagation` in a bubble handler cannot
 *  reach — it must consume its own Escapes (#1231 review round 2). */
async function mountInspectorWithPopup() {
  const { useRepoStore } = await import("../src/stores/repo");
  const { useConfigStore } = await import("../src/stores/config");
  const repo = useRepoStore();
  repo.health = { ok: true, copyInspectorAvailable: true } as typeof repo.health;
  const config = useConfigStore();
  config.data = { dev: { inspector: { enabled: true } } } as typeof config.data;

  const labeled = document.createElement("p");
  labeled.setAttribute("data-repoos-file", "src/ui-app/Foo.vue");
  labeled.setAttribute("data-repoos-line", "12");
  labeled.textContent = "Hello inspector";
  document.body.appendChild(labeled);
  document.elementFromPoint = vi.fn(() => labeled) as typeof document.elementFromPoint;

  const wrapper = mount(CopyInspectorOverlay, { attachTo: document.body });
  window.dispatchEvent(
    new PointerEvent("pointermove", { bubbles: true, clientX: 40, clientY: 40, altKey: true }),
  );
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
  await nextTick();
  expect(
    document.body.querySelector(".copy-inspector-affordance"),
    "affordance pill shows",
  ).not.toBeNull();
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  await nextTick();
  const pane = () => document.body.querySelector(".copy-inspector-pane");
  expect(pane(), "inspector popup should be open").not.toBeNull();
  return { wrapper, pane };
}

/** Board harness around the real useBoardKeyboardNav composable, so the
 *  Esc interplay with the palette is tested against the production wiring
 *  (WorkView uses panelOpen = !!ui.active, closePanel = ui.close). */
function mountBoardHarness(options: { panelOpen: Ref<boolean> }) {
  const closePanel = vi.fn();
  const tasks = ref<Task[]>([
    makeTask({ id: "t1", status: "ready" }),
    makeTask({ id: "t2", status: "ready" }),
  ]);
  const Harness = defineComponent({
    setup() {
      const container = ref<HTMLElement | null>(null);
      const nav = useBoardKeyboardNav({
        containerRef: container,
        tasks,
        open: vi.fn(),
        enabled: ref(true),
        panelOpen: options.panelOpen,
        closePanel,
      });
      return { container, highlightId: nav.highlightId };
    },
    template: `<div ref="container" id="board">
      <div class="board-col">
        <div class="task-card" data-task-id="t1">one</div>
        <div class="task-card" data-task-id="t2">two</div>
      </div>
    </div>`,
  });
  const wrapper = mount(Harness, { attachTo: document.body });
  return {
    wrapper,
    closePanel,
    highlightId: () => (wrapper.vm as { highlightId: string }).highlightId,
  };
}

describe("Escape reaches only the topmost layer", () => {
  it("closes the palette without firing window-level Escape handlers", async () => {
    const wrapper = mount(SearchOverlay, {
      props: { open: true, scope: "all" },
      attachTo: document.body,
    });
    await flushPromises();
    const windowEscape = vi.fn();
    window.addEventListener("keydown", windowEscape);

    const input = document.body.querySelector(".search-overlay-input") as HTMLInputElement;
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
    );
    await nextTick();

    expect(wrapper.emitted("update:open")?.at(-1)).toEqual([false]);
    expect(windowEscape).not.toHaveBeenCalled();
    window.removeEventListener("keydown", windowEscape);
    wrapper.unmount();
  });

  it("one Esc with the palette over an open task drawer closes only the palette; the next Esc closes the drawer", async () => {
    const panelOpen = ref(true);
    const board = mountBoardHarness({ panelOpen });
    const palette = mount(SearchOverlay, {
      props: { open: true, scope: "all" },
      attachTo: document.body,
    });
    await flushPromises();

    const input = document.body.querySelector(".search-overlay-input") as HTMLInputElement;
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
    );
    await nextTick();
    expect(palette.emitted("update:open")?.at(-1)).toEqual([false]);
    expect(
      board.closePanel,
      "Esc while the palette is open must not close the drawer",
    ).not.toHaveBeenCalled();

    // The palette is gone; this Esc belongs to the layer beneath (the drawer).
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
    );
    expect(board.closePanel).toHaveBeenCalledTimes(1);
    palette.unmount();
    board.wrapper.unmount();
  });

  it("traps Tab inside the palette and cycles input ↔ close button", async () => {
    const wrapper = mount(SearchOverlay, {
      props: { open: true, scope: "all" },
      attachTo: document.body,
    });
    await flushPromises();
    const input = document.body.querySelector(".search-overlay-input") as HTMLInputElement;
    const close = document.body.querySelector(".search-overlay-close") as HTMLButtonElement;

    // Tab from the last focusable wraps to the first, and never leaves the dialog.
    close.focus();
    const tab = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
    close.dispatchEvent(tab);
    expect(tab.defaultPrevented, "Tab inside the palette is consumed by the trap").toBe(true);
    expect(document.activeElement).toBe(input);

    // Shift+Tab from the input wraps back to the close button.
    const shiftTab = new KeyboardEvent("keydown", {
      key: "Tab",
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    });
    input.dispatchEvent(shiftTab);
    expect(shiftTab.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(close);
    wrapper.unmount();
  });

  it("the copy-inspector popup (capture-phase listener) consumes its own Escape", async () => {
    const { wrapper, pane } = await mountInspectorWithPopup();
    const windowEscape = vi.fn();
    window.addEventListener("keydown", windowEscape);

    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
    );
    await nextTick();
    expect(pane(), "one Esc closes only the inspector popup").toBeNull();
    expect(
      windowEscape,
      "the consumed Escape must not reach window-level handlers",
    ).not.toHaveBeenCalled();
    window.removeEventListener("keydown", windowEscape);
    wrapper.unmount();
  });

  it("with no popup open, the inspector leaves Escape to the layer beneath", async () => {
    const { useRepoStore } = await import("../src/stores/repo");
    const { useConfigStore } = await import("../src/stores/config");
    const repo = useRepoStore();
    repo.health = { ok: true, copyInspectorAvailable: true } as typeof repo.health;
    const config = useConfigStore();
    config.data = { dev: { inspector: { enabled: true } } } as typeof config.data;
    const wrapper = mount(CopyInspectorOverlay, { attachTo: document.body });
    const windowEscape = vi.fn();
    window.addEventListener("keydown", windowEscape);

    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
    );
    expect(windowEscape, "an unhandled Escape must still propagate").toHaveBeenCalledTimes(1);
    window.removeEventListener("keydown", windowEscape);
    wrapper.unmount();
  });

  it("keeps the board nav's two-stage Esc intact with the palette closed", async () => {
    const panelOpen = ref(true);
    const board = mountBoardHarness({ panelOpen });

    // Stage 1: a task drawer is open — Esc closes it and keeps the highlight.
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
    );
    expect(board.closePanel).toHaveBeenCalledTimes(1);

    // Stage 2: no panel now — highlight a card, then Esc clears it.
    panelOpen.value = false;
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "j", bubbles: true }));
    await nextTick();
    expect(board.highlightId()).toBe("t1");
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
    );
    expect(board.highlightId()).toBeNull();
    board.wrapper.unmount();
  });

  it("never hijacks list keys while focus is in an editable field", async () => {
    const panelOpen = ref(false);
    const board = mountBoardHarness({ panelOpen });
    const field = document.createElement("input");
    document.body.appendChild(field);
    field.focus();
    for (const key of ["j", "k", "h", "l", "ArrowDown"]) {
      field.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
    }
    expect(board.highlightId()).toBeNull();
    board.wrapper.unmount();
  });
});

/* ── 3. Stacking: the palette sits above the layers it can open over ─────── */

describe("palette stacking above drawers and below tooltips", () => {
  /** Numeric z-index declared for one selector in the global stylesheet. */
  function zIndexOf(selector: string): number | null {
    const css = readFileSync(resolve(__dirname, "../src/style.css"), "utf8");
    const match = css.match(
      new RegExp(
        `${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\{[^}]*z-index:\\s*(\\d+)`,
      ),
    );
    return match ? Number(match[1]) : null;
  }

  it("renders above the layers the palette can be opened over", () => {
    const palette = zIndexOf(".search-overlay-backdrop");
    expect(palette).not.toBeNull();
    for (const [below, what] of [
      [".drawer-wrap", "task drawer"],
      [".chat-jump-latest", "chat jump-to-latest"],
      [".shot-viewer-overlay.overlay", "screenshot viewer"],
      [".shot-viewer.drawer-wrap.drawer", "screenshot viewer pane"],
    ] as const) {
      const z = zIndexOf(below);
      expect(z, `${what} must declare a z-index`).not.toBeNull();
      expect(palette! > z!, `palette must stack above the ${what}`).toBe(true);
    }
  });

  it("stays below always-on-top chrome (tooltip, card agent preview)", () => {
    const palette = zIndexOf(".search-overlay-backdrop");
    for (const above of [".app-tooltip", ".tc-agent-preview"]) {
      const z = zIndexOf(above);
      expect(z, `${above} must declare a z-index`).not.toBeNull();
      expect(palette! < z!, `palette must stack below ${above}`).toBe(true);
    }
  });

  /** Deliberate modality (#1231 review round 2): the confirm overlays (dirty
   *  close-out, hotfix, deploy) and the chat queued popover stay ABOVE the
   *  palette, so ⌘K opened under them cannot draw the user into navigating
   *  away from a confirmation. Pinned here so a future palette raise has to
   *  argue with this comment, not silently drift above them. */
  it("stays below the modal confirmations (deliberate modality)", () => {
    const palette = zIndexOf(".search-overlay-backdrop");
    for (const [modal, what] of [
      [".dirty-overlay", "dirty close-out overlay"],
      [".hotfix-overlay", "hotfix confirm overlay"],
      [".dep-overlay", "deploy confirm overlay"],
      [".chat-queued-pop", "chat queued popover"],
    ] as const) {
      const z = zIndexOf(modal);
      expect(z, `${what} must declare a z-index`).not.toBeNull();
      expect(palette! < z!, `palette must stack below the ${what}`).toBe(true);
    }
  });
});

/* ── 4. Focus indicators: every outline variable must exist ──────────────── */

describe("visible focus rings in the global stylesheet", () => {
  const css = readFileSync(resolve(__dirname, "../src/style.css"), "utf8");

  /** Custom properties actually declared somewhere in the file (`--name:`). */
  const defined = new Set([...css.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]));

  it("defines the --ring focus token used by focus indicators", () => {
    expect(defined.has("--ring"), "--ring must be declared (dark and light roots)").toBe(true);
  });

  /** #1231: `outline: … var(--focus-ring)` referenced a custom property that
   *  was never defined anywhere, so invalid-at-computed-value time silently
   *  painted `outline: none` — three :focus-visible rules were dead. The same
   *  silent-failure family hid nine more undeclared tokens (muted text
   *  rendered in the sans face, missing focus borders, no shadows); they are
   *  now aliased to the real theme tokens at :root. This guard covers the
   *  whole class: every fallback-less `var()` in style.css must resolve —
   *  either to a declaration anywhere in src/ui-app (CSS or a component's
   *  runtime style binding) or to a documented library exception. */
  it("never references an undeclared custom property without a fallback", async () => {
    const { readdirSync, statSync } = await import("node:fs");
    const srcRoot = resolve(__dirname, "../src");
    const files: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const p = resolve(dir, entry.name);
        if (entry.isDirectory()) walk(p);
        else if (/\.(css|vue|ts)$/.test(entry.name)) files.push(p);
      }
    };
    walk(srcRoot);

    const declared = new Set<string>();
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      // CSS declarations (`--name:`) and runtime style bindings, both quote
      // styles (`"--x"` and `'--x'` in template object literals).
      for (const m of source.matchAll(/--[\w-]+\s*:/g)) declared.add(m[0].replace(/\s*:$/, ""));
      for (const m of source.matchAll(/['"](--[\w-]+)['"]\s*:/g)) declared.add(m[1]);
      for (const m of source.matchAll(/setProperty\(\s*['"](--[\w-]+)['"]/g)) declared.add(m[1]);
    }
    // radix-vue positions its own poppers with these at runtime (standard
    // Radix convention, not ours to declare).
    const libraryExceptions = /^--radix-/;

    const offenders = new Map<string, number>();
    for (const m of css.matchAll(/var\(\s*(--[\w-]+)\s*(,)?/g)) {
      if (m[2]) continue; // fallback present: degrades on purpose
      if (libraryExceptions.test(m[1])) continue;
      if (!declared.has(m[1])) offenders.set(m[1], (offenders.get(m[1]) ?? 0) + 1);
    }
    expect(
      [...offenders.entries()].map(([name, uses]) => `${name} x${uses}`),
      "fallback-less var() references to undeclared custom properties",
    ).toEqual([]);
  });
});
