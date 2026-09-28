/**
 * Overlay layer isolation (#0575).
 *
 * While any modal dialog is open, Radix sets `pointer-events: none` on
 * `<body>` (its `disableOutsidePointerEvents` behaviour — forced on for every
 * modal `DialogContent`, see `node_modules/radix-vue`). Two things then go
 * wrong for layers that are teleported to `<body>` by hand:
 *
 *  1. **Click-through.** A layer that does not say `pointer-events: auto`
 *     inherits `none` from `<body>`, is no longer a hit-test target, and the
 *     click lands on whatever sits behind it — the side panel, its title, a
 *     board card. `style.css` gives every `[data-overlay-layer]` element
 *     `pointer-events: auto` so a marked layer always stays on top of the
 *     hit-test.
 *
 *  2. **Wrong-layer dismissal.** Radix only treats a pointer event as
 *     "inside" when it lands in another `[data-dismissable-layer]` (its own
 *     registry, DOM-ordered). A hand-rolled `<Teleport>` overlay is not in
 *     that registry, so a click on its button looked like a click *outside*
 *     the panel behind it and dismissed that panel.
 *
 * The marker fixes both: mark every floating layer root — the content and the
 * scrim of the shared dialog primitives, and the root of each hand-rolled
 * teleported overlay — with `data-overlay-layer`. The value is the layer's id
 * (shared by a dialog's content and its scrim, so the panel's own scrim is
 * still *its* dismiss target); hand-rolled overlays use the literal
 * `data-overlay-layer="floating"`, which never collides with a dialog id.
 */

import { inject, type InjectionKey } from "vue";

/** Attribute marking an element as the root of a floating overlay layer. */
export const OVERLAY_LAYER_ATTR = "data-overlay-layer";

/** Injected by `ui/dialog/root.vue`, consumed by its content and scrim. */
export const OVERLAY_LAYER_KEY: InjectionKey<string> = Symbol("repoos-overlay-layer");

let layerSeq = 0;

/** A fresh, non-empty id for one dialog layer (content + scrim share it). */
export function newOverlayLayerId(): string {
  layerSeq += 1;
  return `overlay-${layerSeq}`;
}

/** The layer root containing `node`, or `null` when the click was not in one. */
export function overlayLayerOf(node: EventTarget | null): Element | null {
  if (!(node instanceof Element)) return null;
  return node.closest(`[${OVERLAY_LAYER_ATTR}]`);
}

/**
 * True when an *outside* interaction actually landed inside some other
 * floating layer — in which case it belongs to that layer, not to us, and the
 * dismissal it would trigger must be suppressed.
 *
 * A layer's own scrim carries the same id as its content, so clicking the
 * panel's own dimmed backdrop still dismisses it.
 */
export function landedInAnotherLayer(target: EventTarget | null, ownLayerId: string): boolean {
  const layer = overlayLayerOf(target);
  return layer !== null && layer.getAttribute(OVERLAY_LAYER_ATTR) !== ownLayerId;
}

/** The calling dialog's layer id; `""` only if it has no shared root. */
export function useOverlayLayerId(): string {
  return inject(OVERLAY_LAYER_KEY, "");
}
