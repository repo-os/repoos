/**
 * Global tooltip touch affordances (#1058).
 * @vitest-environment jsdom
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { installTooltips } from "../src/lib/tooltip";

function touch(
  type: "pointerdown" | "pointerup" | "pointermove" | "pointercancel",
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
    for (const [id, tip, touchTap] of [
      ["tip-btn", "Active 2m ago", true],
      ["plain-tip-btn", "Save settings", false],
      ["elsewhere", "", false],
    ] as const) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.id = id;
      if (tip) btn.setAttribute("data-tip", tip);
      if (touchTap) btn.setAttribute("data-tip-touch", "tap");
      btn.textContent = id === "tip-btn" ? "hint" : id === "plain-tip-btn" ? "open" : "other";
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

  it("does not fire a click after long-press release", () => {
    const btn = document.getElementById("tip-btn")!;
    const click = vi.fn();
    btn.addEventListener("click", click);
    touch("pointerdown", btn);
    vi.advanceTimersByTime(500);
    expect(document.querySelector(".app-tooltip.show")?.textContent).toBe("Active 2m ago");
    touch("pointerup", btn);
    btn.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    expect(click).not.toHaveBeenCalled();
  });

  it("opens on a short tap when the press ends before the long-press threshold", () => {
    const btn = document.getElementById("tip-btn")!;
    touch("pointerdown", btn);
    vi.advanceTimersByTime(100);
    touch("pointerup", btn);
    expect(document.querySelector(".app-tooltip.show")?.textContent).toBe("Active 2m ago");
  });

  it("does not fire a click on the trigger after a short tap opens the tooltip", () => {
    const btn = document.getElementById("tip-btn")!;
    const click = vi.fn();
    btn.addEventListener("click", click);
    const card = document.createElement("article");
    card.setAttribute("role", "button");
    const outerClick = vi.fn();
    card.addEventListener("click", outerClick);
    card.appendChild(btn);
    document.body.appendChild(card);

    touch("pointerdown", btn);
    vi.advanceTimersByTime(100);
    touch("pointerup", btn);
    expect(document.querySelector(".app-tooltip.show")?.textContent).toBe("Active 2m ago");
    btn.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    expect(click).not.toHaveBeenCalled();
    expect(outerClick).not.toHaveBeenCalled();
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

  it("starts the new host gesture while dismissing a different pinned tip", () => {
    const first = document.getElementById("tip-btn")!;
    const second = document.getElementById("plain-tip-btn")!;
    second.setAttribute("data-tip-touch", "tap");
    const card = document.createElement("article");
    card.setAttribute("role", "button");
    const cardClick = vi.fn();
    card.addEventListener("click", cardClick);
    card.appendChild(second);
    document.body.appendChild(card);

    touch("pointerdown", first);
    vi.advanceTimersByTime(500);
    expect(document.querySelector(".app-tooltip.show")?.textContent).toBe("Active 2m ago");

    touch("pointerdown", second);
    vi.advanceTimersByTime(100);
    touch("pointerup", second);
    expect(document.querySelector(".app-tooltip.show")?.textContent).toBe("Save settings");
    second.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    expect(cardClick).not.toHaveBeenCalled();
  });

  it("lets a second tap dismiss a pinned clickable hint and activate its card", () => {
    const btn = document.getElementById("tip-btn")!;
    const card = document.createElement("article");
    card.setAttribute("role", "button");
    const cardClick = vi.fn();
    card.addEventListener("click", cardClick);
    card.appendChild(btn);
    document.body.appendChild(card);

    touch("pointerdown", btn);
    vi.advanceTimersByTime(100);
    touch("pointerup", btn);
    expect(document.querySelector(".app-tooltip.show")).not.toBeNull();

    touch("pointerdown", btn);
    expect(document.querySelector(".app-tooltip.show")).toBeNull();
    btn.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    expect(cardClick).toHaveBeenCalledOnce();
  });

  it("does not open on short tap without data-tip-touch and still allows click", () => {
    const btn = document.getElementById("plain-tip-btn")!;
    const click = vi.fn();
    btn.addEventListener("click", click);
    touch("pointerdown", btn);
    vi.advanceTimersByTime(100);
    touch("pointerup", btn);
    expect(document.querySelector(".app-tooltip.show")).toBeNull();
    btn.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    expect(click).toHaveBeenCalled();
  });

  it("does not open the tooltip when the touch is cancelled before long-press", () => {
    const btn = document.getElementById("tip-btn")!;
    touch("pointerdown", btn);
    vi.advanceTimersByTime(200);
    touch("pointercancel", btn);
    vi.advanceTimersByTime(400);
    expect(document.querySelector(".app-tooltip.show")).toBeNull();
    touch("pointerup", btn);
    expect(document.querySelector(".app-tooltip.show")).toBeNull();
  });
});
