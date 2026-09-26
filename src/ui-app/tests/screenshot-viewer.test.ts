import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { h } from "vue";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import ScreenshotViewer from "../src/components/ScreenshotViewer.vue";
import ScreenshotExpandButton from "../src/components/ScreenshotExpandButton.vue";
import NewInputPanel from "../src/components/NewInputPanel.vue";
import { useUiStore } from "../src/stores/ui";
import { isImageMime, pendingToShots, shotIndex } from "../src/lib/screenshot-viewer";
import { flush } from "./component-test-helpers";

const uiRoot = resolve(__dirname, "..");

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

const shots = [
  { src: "data:image/png;base64,aaa", name: "first.png" },
  { src: "/api/inputs/0001/attachments/second.png", name: "second.png" },
];

describe("screenshot-viewer helpers", () => {
  it("maps pending files and finds a shot by src", () => {
    expect(
      pendingToShots([
        { name: "a.png", dataUrl: "data:a" },
        { name: "b.png", dataUrl: "data:b" },
      ]),
    ).toEqual([
      { src: "data:a", name: "a.png" },
      { src: "data:b", name: "b.png" },
    ]);
    expect(shotIndex(shots, shots[1].src)).toBe(1);
    expect(shotIndex(shots, "missing")).toBe(0);
  });

  it("treats only image/* as expandable", () => {
    expect(isImageMime("image/png")).toBe(true);
    expect(isImageMime("application/pdf")).toBe(false);
    expect(isImageMime("")).toBe(false);
    expect(isImageMime(undefined)).toBe(false);
  });
});

describe("ScreenshotViewer", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("renders every shot at natural size with a filename caption", () => {
    const wrapper = mount(ScreenshotViewer, {
      props: { open: true, shots },
      global: { stubs: dialogStubs },
    });
    const imgs = wrapper.findAll(".shot-viewer-print img");
    expect(imgs).toHaveLength(2);
    expect(imgs[0].attributes("src")).toBe(shots[0].src);
    expect(imgs[0].attributes("alt")).toBe("first.png");
    const captions = wrapper.findAll(".shot-viewer-caption");
    expect(captions.map((c) => c.text())).toEqual(["first.png", "second.png"]);
    expect(wrapper.find(".shot-viewer-scroll").exists()).toBe(true);
    expect(wrapper.find(".shot-viewer-close").attributes("aria-label")).toBe(
      "Close screenshot viewer",
    );
  });

  it("closes from the viewer [x], distinct from a remove control", async () => {
    const wrapper = mount(ScreenshotViewer, {
      props: { open: true, shots },
      global: { stubs: dialogStubs },
    });
    expect(wrapper.find(".shot-remove").exists()).toBe(false);
    expect(wrapper.find(".pm-shot-remove").exists()).toBe(false);
    await wrapper.find(".shot-viewer-close").trigger("click");
    expect(wrapper.emitted("update:open")?.at(-1)).toEqual([false]);
  });
});

describe("ScreenshotExpandButton", () => {
  it("is a named button with a tooltip", async () => {
    const wrapper = mount(ScreenshotExpandButton, { props: { name: "bug.png" } });
    const btn = wrapper.get("button.shot-expand");
    expect(btn.attributes("type")).toBe("button");
    expect(btn.attributes("aria-label")).toBe("See larger: bug.png");
    expect(btn.attributes("title")).toBe("See larger");
    await btn.trigger("click");
    expect(wrapper.emitted("click")).toHaveLength(1);
  });
});

describe("New input panel screenshot viewer", () => {
  async function mountPanel() {
    const pinia = createPinia();
    setActivePinia(pinia);
    const ui = useUiStore();
    ui.openNewInput();
    const wrapper = mount(NewInputPanel, {
      global: { plugins: [pinia], stubs: { ...dialogStubs, teleport: true } },
    });
    await flush();
    return { wrapper, ui };
  }

  it("opens the shared viewer from the expand button and not from Remove", async () => {
    const { wrapper, ui } = await mountPanel();
    ui.inputScreenshots.push({
      name: "draft.png",
      mime: "image/png",
      dataUrl: "data:image/png;base64,QUJD",
      size: 3,
    });
    await flush();
    const expand = wrapper.get('button[aria-label="See larger: draft.png"]');
    await expand.trigger("click");
    await flush();
    expect(wrapper.find(".shot-viewer-print img").attributes("src")).toBe(
      "data:image/png;base64,QUJD",
    );
    expect(wrapper.find(".shot-viewer-caption").text()).toBe("draft.png");

    await wrapper.find(".shot-viewer-close").trigger("click");
    await flush();
    expect(wrapper.find(".shot-viewer-print").exists()).toBe(false);

    await wrapper.find(".ff-pending-file-remove").trigger("click");
    expect(ui.inputScreenshots.length).toBe(0);
    expect(wrapper.find(".shot-viewer-print").exists()).toBe(false);
  });

  it("does not offer expand on a non-image attachment", async () => {
    const { wrapper, ui } = await mountPanel();
    ui.inputScreenshots.push({
      name: "notes.pdf",
      mime: "application/pdf",
      dataUrl: "data:application/pdf;base64,QUJD",
      size: 4,
    });
    await flush();
    expect(wrapper.find('button[aria-label="See larger: notes.pdf"]').exists()).toBe(false);
    expect(wrapper.find(".ff-pending-file-remove").exists()).toBe(true);
  });
});

describe("screenshot viewer wiring contract", () => {
  const css = readFileSync(join(uiRoot, "src/style.css"), "utf8");
  const viewer = readFileSync(join(uiRoot, "src/components/ScreenshotViewer.vue"), "utf8");
  const expand = readFileSync(join(uiRoot, "src/components/ScreenshotExpandButton.vue"), "utf8");
  const taskDrawer = readFileSync(join(uiRoot, "src/components/TaskDrawer.vue"), "utf8");
  const newInput = readFileSync(join(uiRoot, "src/components/NewInputPanel.vue"), "utf8");
  const inputsView = readFileSync(join(uiRoot, "src/views/InputsView.vue"), "utf8");
  const settings = readFileSync(join(uiRoot, "src/views/SettingsView.vue"), "utf8");

  it("keeps viewer chrome in the shared stylesheet and teleports via the dialog primitives", () => {
    expect(viewer).not.toMatch(/<style/);
    expect(expand).not.toMatch(/<style/);
    expect(viewer).toContain('from "./ui/dialog/root.vue"');
    expect(viewer).toContain("<DialogOverlay");
    expect(css).toMatch(/\.shot-viewer\.drawer-wrap\.drawer\s*\{/);
    expect(css).toMatch(/\.shot-viewer-overlay\.overlay\s*\{[^}]*z-index:\s*140/);
  });

  it("is used by every screenshot surface, including both TaskDrawer groups", () => {
    expect(taskDrawer).toContain("pendingScreenshots");
    expect(taskDrawer).toContain("openPendingViewer");
    expect(taskDrawer).toContain("pmScreenshots");
    expect(taskDrawer).toContain("openPmViewer");
    expect(taskDrawer).toContain("ScreenshotViewer");
    expect(taskDrawer).toContain("ScreenshotExpandButton");
    expect(newInput).toContain("inputScreenshots");
    expect(newInput).toContain("ScreenshotViewer");
    expect(inputsView).toContain("activeInput.attachments");
    expect(inputsView).toContain("ScreenshotViewer");
    expect(inputsView).toContain("Open in new tab");
    expect(settings).toContain("bugReportScreenshots");
    expect(settings).toContain("ScreenshotViewer");
  });

  it("does not add an expand control to agent avatar surfaces", () => {
    for (const file of [
      "src/components/CTOPanel.vue",
      "src/components/FloatingHeads.vue",
      "src/components/DebuggerChat.vue",
      "src/components/TaskDebuggerChat.vue",
      "src/components/RepoGuideChat.vue",
    ]) {
      const src = readFileSync(join(uiRoot, file), "utf8");
      expect(src).not.toContain("ScreenshotViewer");
      expect(src).not.toContain("ScreenshotExpandButton");
    }
  });
});
