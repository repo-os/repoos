/**
 * Shared screenshot dropzone (#0877).
 *
 * Installed PWAs (Safari "Add to Dock", Chrome standalone) ignored the
 * programmatic `input.click()` that the New task, New input and PM-chat upload
 * controls used. The shared dropzone now makes the real file input the control:
 * it covers the zone, so a pointer click lands on it natively, and it is the
 * tab stop, so Enter/Space are native too. These tests hold that wiring in
 * place — jsdom cannot reproduce the PWA's activation policy itself.
 */
import { describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import ShotDropzone from "../src/components/ShotDropzone.vue";

const SRC = resolve(__dirname, "../src");
const readSource = (rel: string) => readFileSync(join(SRC, rel), "utf8");

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
  it("makes the native file input the click and keyboard target", () => {
    const { label, input } = setup();
    expect(label.tagName).toBe("LABEL");
    expect(label.contains(input)).toBe(true);
    expect(input.classList.contains("shot-input")).toBe(true);
    // The input is the tab stop, not a hidden control forwarded from the zone:
    // a real click/focus on it is what opens the picker natively.
    expect(input.hasAttribute("tabindex")).toBe(false);
    expect(input.disabled).toBe(false);
    // The zone itself no longer carries button/keydown wiring that could shadow
    // the native input.
    expect(label.hasAttribute("tabindex")).toBe(false);
    expect(label.hasAttribute("role")).toBe(false);
    expect(input.multiple).toBe(true);
    expect(input.getAttribute("accept")).toContain("image/png");
    expect(label.textContent).toContain("Click to add screenshots");
  });

  it("receives a pointer click on the input natively", () => {
    const { input, clicks } = setup();
    const event = new MouseEvent("click", { bubbles: true, cancelable: true });
    input.dispatchEvent(event);
    expect(clicks).toHaveBeenCalledTimes(1);
    // Nothing cancels the native activation that opens the picker.
    expect(event.defaultPrevented).toBe(false);
  });

  it("never forwards activation through a programmatic input.click()", () => {
    // The PWA bug was a synthetic click in a handler; keep every screenshot
    // upload site on native activation (one class, not one patch).
    const uploadSites = [
      "components/ShotDropzone.vue",
      "components/TaskDrawer.vue",
      "components/NewInputPanel.vue",
      "components/PmChatSurface.vue",
    ];
    for (const file of uploadSites) {
      const source = readSource(file).replace(/\/\*[\s\S]*?\*\//g, "");
      expect(source, `${file} must not trigger the file picker with .click()`).not.toMatch(
        /(?:shotInput|fileInput|input)(?:\.value)?\??\.click\(\)/,
      );
    }
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
