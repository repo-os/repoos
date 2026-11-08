/**
 * Global tooltip: replaces the browser's native `title` bubble with one styled
 * popup. A single body-level, position:fixed element, so it is never clipped by
 * a card's `overflow: hidden` or trapped in a drawer's stacking context.
 *
 * Delegated — any element with a `title` (or `data-tip`) gets it, no per-site
 * wiring. On first hover the `title` is moved to `data-tip` so the native bubble
 * can't also appear; a later Vue update that re-sets `title` wins over the stale
 * `data-tip`, so dynamic titles stay correct.
 *
 * Touch: long-press on any `data-tip` target shows the tooltip and keeps it
 * open until the user taps elsewhere. A short tap does the same only when the
 * host opts in with `data-tip-touch="tap"` (#1058 card recency — avoids stealing
 * clicks from buttons and links that merely carry a hint). Mouse hover/focus is
 * unchanged.
 */
const SHOW_DELAY_MS = 350;
/** Long-press threshold — matches common touch “show hint” timing. */
const LONG_PRESS_MS = 500;
const GAP = 8;
const MARGIN = 8;
const LONG_PRESS_MOVE_PX = 12;
/** After a touch opens or dismisses a tooltip, block the follow-up click (drawer/open). */
const CLICK_SUPPRESS_MS = 450;

let installed = false;

function tipHost(node: EventTarget | null): HTMLElement | null {
  return (node as Element | null)?.closest?.<HTMLElement>("[title], [data-tip]") ?? null;
}

/** Short touch release opens and pins the tooltip — only on explicit hosts (#1058). */
function touchTapPins(el: HTMLElement): boolean {
  return el.getAttribute("data-tip-touch") === "tap";
}

let tipEl: HTMLDivElement | null = null;

export function installTooltips(): void {
  if (typeof document === "undefined") return;
  if (!tipEl?.isConnected) {
    tipEl = document.querySelector<HTMLDivElement>(".app-tooltip");
    if (!tipEl) {
      tipEl = document.createElement("div");
      tipEl.className = "app-tooltip";
      tipEl.setAttribute("role", "tooltip");
      document.body.appendChild(tipEl);
    }
  }
  if (installed) return;
  installed = true;

  const tip = tipEl;

  let target: HTMLElement | null = null;
  let hoverTimer: number | undefined;
  let touchPinned = false;
  let longPressTimer: number | undefined;
  let longPressEl: HTMLElement | null = null;
  let longPressOrigin: { x: number; y: number } | null = null;
  let activeTouchId: number | null = null;
  const suppressClickUntil = new WeakMap<HTMLElement, number>();

  const armClickSuppression = (el: HTMLElement) => {
    suppressClickUntil.set(el, Date.now() + CLICK_SUPPRESS_MS);
  };

  const clearLongPress = () => {
    window.clearTimeout(longPressTimer);
    longPressTimer = undefined;
    longPressEl = null;
    longPressOrigin = null;
  };

  const hide = () => {
    window.clearTimeout(hoverTimer);
    clearLongPress();
    target = null;
    touchPinned = false;
    activeTouchId = null;
    tip.classList.remove("show");
  };

  const textFor = (el: HTMLElement): string => {
    const title = el.getAttribute("title");
    if (title !== null) {
      el.removeAttribute("title");
      if (title.trim()) el.setAttribute("data-tip", title);
      else el.removeAttribute("data-tip");
    }
    return el.getAttribute("data-tip") ?? "";
  };

  const place = (el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    const t = tip.getBoundingClientRect();
    const left = Math.min(
      Math.max(MARGIN, r.left + r.width / 2 - t.width / 2),
      window.innerWidth - t.width - MARGIN,
    );
    const above = r.top - t.height - GAP;
    const top = above >= MARGIN ? above : r.bottom + GAP;
    tip.style.left = `${left}px`;
    tip.style.top = `${top}px`;
  };

  const show = (el: HTMLElement) => {
    const text = textFor(el);
    if (!text || !el.isConnected) return;
    tip.textContent = text;
    tip.classList.add("show");
    place(el);
  };

  const openFor = (el: HTMLElement, pinned: boolean) => {
    hide();
    target = el;
    touchPinned = pinned;
    show(el);
    if (pinned) armClickSuppression(el);
  };

  const enter = (e: Event) => {
    const el = tipHost(e.target);
    if (!el || el === target || el.closest(".app-tooltip")) return;
    if (touchPinned) return;
    hide();
    target = el;
    const text = textFor(el);
    if (!text) return;
    hoverTimer = window.setTimeout(() => show(el), e.type === "focusin" ? 0 : SHOW_DELAY_MS);
  };

  const leave = (e: Event) => {
    if (touchPinned) return;
    if (target && !target.contains((e as MouseEvent).relatedTarget as Node | null)) hide();
  };

  const onPointerDown = (e: PointerEvent) => {
    const el = tipHost(e.target);

    if (touchPinned && target) {
      if (el === target && e.pointerType === "touch") {
        armClickSuppression(target);
        hide();
        e.preventDefault();
        return;
      }
      if (target.contains(e.target as Node) || tip.contains(e.target as Node)) return;
      hide();
      return;
    }

    if (e.pointerType === "touch" && el && textFor(el)) {
      clearLongPress();
      longPressEl = el;
      longPressOrigin = { x: e.clientX, y: e.clientY };
      activeTouchId = e.pointerId;
      longPressTimer = window.setTimeout(() => {
        openFor(el, true);
        clearLongPress();
      }, LONG_PRESS_MS);
      return;
    }

    if (e.pointerType !== "touch") {
      if (!el || el !== target) hide();
    }
  };

  const onPointerUp = (e: PointerEvent) => {
    if (activeTouchId !== null && e.pointerId !== activeTouchId) return;
    const pending = longPressEl;
    const hadLongPressTimer = longPressTimer !== undefined;
    clearLongPress();
    activeTouchId = null;

    if (
      e.pointerType === "touch" &&
      pending &&
      hadLongPressTimer &&
      !touchPinned &&
      touchTapPins(pending)
    ) {
      const upEl = tipHost(e.target);
      if (upEl === pending && textFor(pending)) {
        openFor(pending, true);
        e.preventDefault();
      }
    } else if (
      e.pointerType === "touch" &&
      touchPinned &&
      target &&
      (target === tipHost(e.target) || target.contains(e.target as Node))
    ) {
      // Long-press opened the tip while the finger was still down — block the release click.
      armClickSuppression(target);
      e.preventDefault();
    }
  };

  const onPointerMove = (e: PointerEvent) => {
    if (activeTouchId === null || e.pointerId !== activeTouchId || !longPressOrigin) return;
    const dx = e.clientX - longPressOrigin.x;
    const dy = e.clientY - longPressOrigin.y;
    if (dx * dx + dy * dy > LONG_PRESS_MOVE_PX * LONG_PRESS_MOVE_PX) {
      clearLongPress();
      activeTouchId = null;
    }
  };

  const onPointerCancel = (e: PointerEvent) => {
    if (activeTouchId !== null && e.pointerId !== activeTouchId) return;
    clearLongPress();
    activeTouchId = null;
  };

  document.addEventListener("mouseover", enter);
  document.addEventListener("focusin", enter);
  document.addEventListener("mouseout", leave);
  document.addEventListener("focusout", () => {
    if (!touchPinned) hide();
  });
  const onClickCapture = (e: MouseEvent) => {
    for (const node of e.composedPath()) {
      if (!(node instanceof HTMLElement)) continue;
      const host = tipHost(node);
      if (!host) continue;
      if ((suppressClickUntil.get(host) ?? 0) > Date.now()) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        return;
      }
    }
  };

  document.addEventListener("pointerdown", onPointerDown, true);
  document.addEventListener("pointerup", onPointerUp);
  document.addEventListener("pointercancel", onPointerCancel);
  document.addEventListener("pointermove", onPointerMove, { passive: true });
  document.addEventListener("click", onClickCapture, true);
  document.addEventListener("scroll", hide, true);
  window.addEventListener("blur", hide);
}
