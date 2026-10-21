/**
 * Shared screenshot dropzone (#0877).
 *
 * Installed PWAs (Safari "Add to Dock", Chrome standalone) ignored the
 * programmatic `input.click()` that the New task, New input and PM-chat upload
 * controls used. The control now relies on native `<label>` activation — the
 * same wiring as the upload controls that already worked — and keeps the input
 * rendered (never `display: none`, #0642). These tests hold that wiring in
 * place, since jsdom cannot reproduce the PWA's activation policy itself.
 */
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { mount } from "@vue/test-utils";
import ShotDropzone from "../src/components/ShotDropzone.vue";

const COMPONENTS = resolve(__dirname, "../src/components");

/** True when the file input at `type="file"` is wrapped by an open `<label>`. */
function fileInputIsLabelled(source: string): boolean {
  const input = source.indexOf('type="file"');
  const open = source.lastIndexOf("<label", input);
  const close = source.lastIndexOf("</label>", input);
  return input !== -1 && open > close;
}

function setup() {
  const wrapper = mount(ShotDropzone, {
    slots: { default: "Click to add screenshots" },
  });
  const label = wrapper.element as HTMLLabelElement;
  const input = label.querySelector<HTMLInputElement>("input[type=file]");
  if (!input) throw new Error("ShotDropzone must render a file input");
  const clicks = vi.fn();
  input.addEventListener("click", clicks);
  return { wrapper, label, input, clicks };
}

describe("ShotDropzone (#0877)", () => {
  it("nests the file input in its label, so a click is native activation", () => {
    const { label, input } = setup();
    expect(label.tagName).toBe("LABEL");
    expect(label.contains(input)).toBe(true);
    // The zone is the keyboard target; the invisible input is not a tab stop.
    expect(label.getAttribute("tabindex")).toBe("0");
    expect(label.getAttribute("role")).toBe("button");
    expect(input.getAttribute("tabindex")).toBe("-1");
    expect(input.multiple).toBe(true);
    expect(input.getAttribute("accept")).toContain("image/png");
    expect(label.textContent).toContain("Click to add screenshots");
  });

  it("forwards a click on the zone to the file input", () => {
    const { label, clicks } = setup();
    label.click();
    expect(clicks).toHaveBeenCalledTimes(1);
  });

  it("opens the picker with Enter and Space without scrolling the page", async () => {
    const { wrapper, clicks } = setup();
    const enter = new KeyboardEvent("keydown", {
      key: "Enter",
      bubbles: true,
      cancelable: true,
    });
    const space = new KeyboardEvent("keydown", {
      key: " ",
      bubbles: true,
      cancelable: true,
    });
    wrapper.element.dispatchEvent(enter);
    wrapper.element.dispatchEvent(space);
    expect(clicks).toHaveBeenCalledTimes(2);
    expect(enter.defaultPrevented).toBe(true);
    expect(space.defaultPrevented).toBe(true);
  });

  it("emits picked files and resets so the same file can be picked again", async () => {
    const { wrapper, input } = setup();
    const files = [new File(["png"], "shot.png", { type: "image/png" })];
    Object.defineProperty(input, "files", { value: files, configurable: true });
    await wrapper.find("input").trigger("change");
    expect(wrapper.emitted("files")?.[0]?.[0]).toEqual(files);
    expect(input.value).toBe("");
  });

  it("does not emit when the picker is cancelled", async () => {
    const { wrapper } = setup();
    await wrapper.find("input").trigger("change");
    expect(wrapper.emitted("files")).toBeUndefined();
  });
});

/**
 * The call-site audit from #0877: a fix for one panel is not a fix for the
 * class. Every screenshot control must reach the picker without a synthetic
 * `.click()` from a pointer handler.
 */
describe("screenshot picker call sites (#0877)", () => {
  const shared = ["TaskDrawer.vue", "NewInputPanel.vue"];

  it("routes the task, input and drawer dropzones through the shared component", () => {
    for (const file of shared) {
      const source = readFileSync(join(COMPONENTS, file), "utf8");
      expect(source, `${file} must render <ShotDropzone>`).toContain("<ShotDropzone");
      expect(source, `${file} must not hand-roll .shot-dropzone`).not.toContain(
        'class="shot-dropzone"',
      );
    }
  });

  it("keeps every hidden file input inside a label", () => {
    // PmChatSurface (PM chat attach) and SettingsImportExport (settings import)
    // hide their input; ShotDropzone hides the shared one. All are label-backed.
    for (const file of ["ShotDropzone.vue", "PmChatSurface.vue", "SettingsImportExport.vue"]) {
      const source = readFileSync(join(COMPONENTS, file), "utf8");
      expect(source, `${file} must render a file input`).toContain('type="file"');
      expect(
        fileInputIsLabelled(source),
        `${file}: the hidden file input must sit inside its <label>`,
      ).toBe(true);
    }
  });

  it("never opens a file input from a pointer handler", () => {
    for (const file of ["TaskDrawer.vue", "NewInputPanel.vue", "PmChatSurface.vue"]) {
      const source = readFileSync(join(COMPONENTS, file), "utf8");
      expect(source, `${file} still wires @click to input.click()`).not.toMatch(
        /@click="[^"]*\.click\(\)"/,
      );
    }
  });
});
