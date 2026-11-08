/**
 * Global tooltip touch affordances (#1058).
 * @vitest-environment jsdom
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { installTooltips } from "../src/lib/tooltip";

function touch(
  type: "pointerdown" | "pointerup" | "pointermove",
  el: Element,
  over: Partial<PointerEventInit> = {},
): void {
  el.dispatchEvent(
    new PointerEvent(type, {
      bubbles: true,
      cancelable: true,
      pointerId: 1,
      pointerType: "touch",
      clientX: 20,
      clientY: 20,
      ...over,
    }),
  );
}

describe("installTooltips touch (#1058)", () => {
  beforeAll(() => {
    installTooltips();
  });

  beforeEach(() => {
    vi.useFakeTimers();
    const keep = document.querySelector(".app-tooltip");
    document.body.replaceChildren();
    if (keep) document.body.appendChild(keep);
    for (const [id, tip] of [
      ["tip-btn", "Active 2m ago"],
      ["elsewhere", ""],
    ] as const) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.id = id;
      if (tip) btn.setAttribute("data-tip", tip);
      btn.textContent = id === "tip-btn" ? "hint" : "other";
      document.body.appendChild(btn);
    }
  });

  afterEach(() => {
    vi.useRealTimers();
    document.dispatchEvent(new Event("scroll", { bubbles: true }));
  });

  it("opens on long-press without an immediate pointerdown dismiss", () => {
    const btn = document.getElementById("tip-btn")!;
    touch("pointerdown", btn);
    expect(document.querySelector(".app-tooltip.show")).toBeNull();
    vi.advanceTimersByTime(500);
    expect(document.querySelector(".app-tooltip.show")?.textContent).toBe("Active 2m ago");
  });

  it("opens on a short tap when the press ends before the long-press threshold", () => {
    const btn = document.getElementById("tip-btn")!;
    touch("pointerdown", btn);
    vi.advanceTimersByTime(100);
    touch("pointerup", btn);
    expect(document.querySelector(".app-tooltip.show")?.textContent).toBe("Active 2m ago");
  });

  it("dismisses a touch-pinned tip when the user taps elsewhere", () => {
    const btn = document.getElementById("tip-btn")!;
    const other = document.getElementById("elsewhere")!;
    touch("pointerdown", btn);
    vi.advanceTimersByTime(500);
    expect(document.querySelector(".app-tooltip.show")).not.toBeNull();
    touch("pointerdown", other);
    expect(document.querySelector(".app-tooltip.show")).toBeNull();
  });
});
