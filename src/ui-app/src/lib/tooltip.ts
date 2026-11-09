/**
 * Global tooltip: replaces the browser's native `title` bubble with one styled
 * popup. A single body-level, position:fixed element, so it is never clipped by
 * a card's `overflow: hidden` or trapped in a drawer's stacking context.
 *
 * Delegated — any element with a `title` (or `data-tip`) gets it, no per-site
 * wiring. On first hover the `title` is moved to `data-tip` so the native bubble
 * can't also appear; a later Vue update that re-sets `title` wins over the stale
 * `data-tip`, so dynamic titles stay correct.
 */
const SHOW_DELAY_MS = 350;
const GAP = 8;
const MARGIN = 8;
const TOUCH_LONG_PRESS_MS = 500;

export function installTooltips(): void {
  if (typeof document === "undefined") return;
  const tip = document.createElement("div");
  tip.className = "app-tooltip";
  tip.setAttribute("role", "tooltip");
  document.body.appendChild(tip);

  let target: HTMLElement | null = null;
  let timer: number | undefined;
  let touchTimer: number | undefined;
  let touchTarget: HTMLElement | null = null;
  let touchStartedAt = 0;

  const hide = () => {
    window.clearTimeout(timer);
    target = null;
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

  const enter = (e: Event) => {
    const el = (e.target as Element | null)?.closest?.<HTMLElement>("[title], [data-tip]");
    if (!el || el === target || el.closest(".app-tooltip")) return;
    hide();
    target = el;
    // Strip the native title right away so its bubble never races ours.
    const text = textFor(el);
    if (!text) return;
    timer = window.setTimeout(() => show(el), e.type === "focusin" ? 0 : SHOW_DELAY_MS);
  };

  const touchStart = (event: PointerEvent) => {
    if (event.pointerType !== "touch") return;
    const el = (event.target as Element | null)?.closest?.<HTMLElement>("[title], [data-tip]");
    if (!el || el.closest(".app-tooltip")) return;
    hide();
    target = el;
    window.clearTimeout(touchTimer);
    touchTarget = el;
    touchStartedAt = Date.now();
    touchTimer = window.setTimeout(() => show(el), TOUCH_LONG_PRESS_MS);
  };

  const touchEnd = (event: PointerEvent) => {
    if (event.pointerType !== "touch" || !touchTarget) return;
    window.clearTimeout(touchTimer);
    const el = touchTarget;
    touchTarget = null;
    // A tap opens the same popup; a long press already opened it above.
    if (Date.now() - touchStartedAt < TOUCH_LONG_PRESS_MS) {
      hide();
      target = el;
      show(el);
    }
  };

  const leave = (e: Event) => {
    if (target && !target.contains((e as MouseEvent).relatedTarget as Node | null)) hide();
  };

  document.addEventListener("mouseover", enter);
  document.addEventListener("focusin", enter);
  document.addEventListener("mouseout", leave);
  document.addEventListener("focusout", hide);
  document.addEventListener(
    "pointerdown",
    (event) => {
      const pointer = event as PointerEvent;
      if (pointer.pointerType === "touch") {
        touchStart(pointer);
        return;
      }
      if (!target || !(event.target instanceof Node) || !target.contains(event.target)) hide();
    },
    true,
  );
  document.addEventListener("pointerup", touchEnd, true);
  document.addEventListener(
    "pointercancel",
    (event) => {
      if ((event as PointerEvent).pointerType !== "touch") return;
      window.clearTimeout(touchTimer);
      touchTarget = null;
    },
    true,
  );
  document.addEventListener("scroll", hide, true);
  window.addEventListener("blur", hide);
}
