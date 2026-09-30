<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, shallowRef, watch } from "vue";
import { Teleport } from "vue";
import { api, JSON_OPTS } from "../api";
import Button from "./ui/button.vue";
import {
  findCopyInspectorElement,
  findCopyInspectorTarget,
  formatInspectorPath,
  formatInspectorShortPath,
  type CopyInspectorTarget,
} from "../lib/copy-inspector-target";
import { useRepoStore } from "../stores/repo";
import { useConfigStore } from "../stores/config";

declare const __REPOOS_COPY_INSPECTOR__: boolean;

const repo = useRepoStore();
const config = useConfigStore();

const buildHasInspector =
  typeof __REPOOS_COPY_INSPECTOR__ !== "undefined" && __REPOOS_COPY_INSPECTOR__;

const active = computed(() => {
  if (!buildHasInspector) return false;
  if (repo.health?.copyInspectorAvailable !== true) return false;
  const inspector = config.data?.dev as { inspector?: { enabled?: boolean } } | undefined;
  const nested = inspector?.inspector;
  if (nested && nested.enabled === false) return false;
  return nested?.enabled !== false;
});

const affordanceVisible = ref(false);
/** Pointer-anchored spot for the pill; clamped into the viewport at render time. */
const affordancePoint = ref<{ x: number; y: number }>({ x: 0, y: 0 });
const affordanceSize = ref({ w: 200, h: 28 });
const hoverTarget = shallowRef<CopyInspectorTarget | null>(null);
const popup = shallowRef<CopyInspectorTarget | null>(null);
const popupPos = ref({ x: 0, y: 0 });
const popupMsg = ref("");
const opening = ref(false);
const paneRef = ref<HTMLElement | null>(null);

const editorConfigured = computed(() => {
  const cmd = (config.data?.dev as { inspector?: { editorCommand?: string } } | undefined)
    ?.inspector?.editorCommand;
  return typeof cmd === "string" && cmd.trim().length > 0;
});

const EDITOR_HINT =
  "Open in editor is off until an editor command is set: Settings → Advanced → “Copy inspector: editor command” (e.g. zed {file}:{line}).";

const VIEWPORT_PAD = 12;

/** Measured popup size (estimates until the first render is measured). */
const popupSize = ref({ w: 480, h: 140 });

async function measurePopup(): Promise<void> {
  await nextTick();
  const el = paneRef.value;
  if (el && el.offsetWidth) popupSize.value = { w: el.offsetWidth, h: el.offsetHeight };
}

async function measureAffordance(): Promise<void> {
  await nextTick();
  const el = affordanceRef.value;
  if (el && el.offsetWidth) affordanceSize.value = { w: el.offsetWidth, h: el.offsetHeight };
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(Math.max(v, min), Math.max(min, max));
}

const affordanceStyle = computed(() => {
  const { w, h } = affordanceSize.value;
  const { x, y } = affordancePoint.value;
  // Default: down-right of the pointer. Flip to the left / above when that
  // would leave the viewport, then clamp as a last resort.
  const left = x + w > window.innerWidth - VIEWPORT_PAD ? x - 20 - w : x;
  const top = y + h > window.innerHeight - VIEWPORT_PAD ? y - 20 - h : y;
  return {
    left: `${clamp(left, VIEWPORT_PAD, window.innerWidth - w - VIEWPORT_PAD)}px`,
    top: `${clamp(top, VIEWPORT_PAD, window.innerHeight - h - VIEWPORT_PAD)}px`,
  };
});

const popupStyle = computed(() => {
  const { w, h } = popupSize.value;
  const x = clamp(popupPos.value.x - w / 2, VIEWPORT_PAD, window.innerWidth - w - VIEWPORT_PAD);
  // Below the pointer by default; flip above it when that would run off the
  // bottom, then clamp so it never leaves the viewport.
  let y = popupPos.value.y;
  if (y + h > window.innerHeight - VIEWPORT_PAD) y = popupPos.value.y - 24 - h;
  y = clamp(y, VIEWPORT_PAD, window.innerHeight - h - VIEWPORT_PAD);
  return { left: `${x}px`, top: `${y}px` };
});

function isInteractiveElement(el: Element | null): boolean {
  if (!el) return false;
  return !!el.closest(
    "input, textarea, select, button, a, label, [contenteditable=''], [contenteditable='true']",
  );
}

function textUnderPoint(x: number, y: number): Node | null {
  const docWithCaret = document as Document & {
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
  };
  if (typeof docWithCaret.caretRangeFromPoint === "function") {
    const range = docWithCaret.caretRangeFromPoint(x, y);
    return range?.startContainer ?? null;
  }
  return document.elementFromPoint(x, y);
}

let moveRaf = 0;
let lastMove: PointerEvent | null = null;

const affordanceRef = ref<HTMLElement | null>(null);
const pinnedAffordancePos = ref<{ x: number; y: number } | null>(null);
/** Outline of the exact element the pill / popup refers to. */
const highlightStyle = ref<Record<string, string> | null>(null);

function highlightFor(el: Element | null): Record<string, string> | null {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return {
    left: `${r.left}px`,
    top: `${r.top}px`,
    width: `${r.width}px`,
    height: `${r.height}px`,
  };
}

function hideAffordance(): void {
  affordanceVisible.value = false;
  hoverTarget.value = null;
  pinnedAffordancePos.value = null;
  // The popup keeps its element outlined until it closes.
  if (!popup.value) highlightStyle.value = null;
}

function updateAffordance(e: PointerEvent): void {
  if (!active.value || popup.value) {
    hideAffordance();
    return;
  }
  const hitEl =
    e.target instanceof Element ? e.target : document.elementFromPoint(e.clientX, e.clientY);
  // Over the pill itself: keep it, even if Alt was released on the way there.
  if (affordanceRef.value?.contains(hitEl instanceof Node ? hitEl : null)) {
    return;
  }
  if (!e.altKey) {
    hideAffordance();
    return;
  }
  if (paneRef.value?.contains(hitEl instanceof Node ? hitEl : null)) {
    return;
  }
  if (hitEl instanceof Element && isInteractiveElement(hitEl)) {
    hideAffordance();
    return;
  }
  const node = textUnderPoint(e.clientX, e.clientY);
  const target = findCopyInspectorTarget(node);
  if (!target) {
    hideAffordance();
    return;
  }
  const text = (node?.textContent ?? "").replace(/\s+/g, " ").trim();
  if (!text) {
    hideAffordance();
    return;
  }
  const sameTarget =
    hoverTarget.value?.file === target.file && hoverTarget.value?.line === target.line;
  hoverTarget.value = target;
  highlightStyle.value = highlightFor(findCopyInspectorElement(node));
  affordanceVisible.value = true;
  if (!sameTarget || !pinnedAffordancePos.value) {
    pinnedAffordancePos.value = { x: e.clientX + 10, y: e.clientY + 10 };
  }
  affordancePoint.value = pinnedAffordancePos.value;
  void measureAffordance();
}

function onPointerMove(e: PointerEvent): void {
  lastMove = e;
  if (moveRaf) return;
  moveRaf = requestAnimationFrame(() => {
    moveRaf = 0;
    if (lastMove) updateAffordance(lastMove);
  });
}

function openPopupAt(x: number, y: number): void {
  if (!hoverTarget.value) return;
  popup.value = hoverTarget.value;
  popupPos.value = { x, y: y + 12 };
  popupMsg.value = "";
  hideAffordance();
}

function openFromAffordance(e: PointerEvent): void {
  if (!hoverTarget.value) return;
  e.preventDefault();
  e.stopPropagation();
  openPopupAt(e.clientX, e.clientY);
}

function isEditableFocus(): boolean {
  const el = document.activeElement;
  if (!(el instanceof HTMLElement)) return false;
  return (
    el.isContentEditable ||
    el.tagName === "INPUT" ||
    el.tagName === "TEXTAREA" ||
    el.tagName === "SELECT"
  );
}

watch([popup, popupMsg], () => {
  if (popup.value) void measurePopup();
});

function closePopup(): void {
  popup.value = null;
  highlightStyle.value = null;
  popupMsg.value = "";
}

async function copyPath(): Promise<void> {
  if (!popup.value) return;
  const path = formatInspectorPath(popup.value);
  try {
    await navigator.clipboard.writeText(path);
    popupMsg.value = "Copied";
  } catch {
    popupMsg.value = "Copy failed";
  }
}

async function openInEditor(): Promise<void> {
  if (!popup.value || !editorConfigured.value) return;
  opening.value = true;
  popupMsg.value = "";
  try {
    await api("/api/dev/copy-inspector/open", JSON_OPTS("POST", popup.value));
    popupMsg.value = "Opened in editor";
  } catch (err) {
    popupMsg.value = err instanceof Error ? err.message : "Could not open editor";
  } finally {
    opening.value = false;
  }
}

function onKeydown(e: KeyboardEvent): void {
  if (e.key === "Escape") {
    closePopup();
    return;
  }
  // Popup shortcuts: Enter = Open in editor, C = Copy path. Plain keys only
  // (Cmd/Ctrl+C must keep copying selected text), never while typing, and a
  // keyboard-focused popup button keeps its own native Enter.
  if (popup.value) {
    if (e.ctrlKey || e.metaKey || e.altKey || isEditableFocus()) return;
    const focused = document.activeElement;
    const onPaneButton = focused instanceof HTMLElement && !!paneRef.value?.contains(focused);
    if (e.key === "Enter" && !onPaneButton) {
      e.preventDefault();
      e.stopPropagation();
      void openInEditor();
    } else if (e.key === "c" || e.key === "C") {
      e.preventDefault();
      e.stopPropagation();
      void copyPath();
    }
    return;
  }
  // Enter does what clicking the visible pill does — for when the pill is
  // off the outlined element and awkward to hit. Never steals Enter from a
  // text field the user is typing in.
  if (e.key === "Enter" && affordanceVisible.value && hoverTarget.value && !popup.value) {
    if (isEditableFocus()) return;
    e.preventDefault();
    e.stopPropagation();
    const x = lastMove?.clientX ?? window.innerWidth / 2;
    const y = lastMove?.clientY ?? window.innerHeight / 2;
    openPopupAt(x, y);
  }
}

function onPointerDownOutside(e: PointerEvent): void {
  if (!popup.value) return;
  const hit = e.target instanceof Node ? e.target : null;
  if (hit && paneRef.value?.contains(hit)) return;
  closePopup();
}

onMounted(() => {
  window.addEventListener("pointermove", onPointerMove, { passive: true });
  window.addEventListener("pointerdown", onPointerDownOutside, true);
  window.addEventListener("keydown", onKeydown, true);
});

onUnmounted(() => {
  window.removeEventListener("pointermove", onPointerMove);
  window.removeEventListener("pointerdown", onPointerDownOutside, true);
  window.removeEventListener("keydown", onKeydown, true);
  if (moveRaf) cancelAnimationFrame(moveRaf);
});
</script>

<template>
  <div v-if="active" class="copy-inspector-root" aria-hidden="true">
    <Teleport to="body">
      <button
        v-if="affordanceVisible && !popup"
        ref="affordanceRef"
        type="button"
        class="copy-inspector-affordance"
        data-overlay-layer="floating"
        :style="affordanceStyle"
        title="Open the source location for the outlined element (click or press Enter)"
        @pointerdown.stop.prevent="openFromAffordance"
      >
        <svg
          class="copy-inspector-affordance-icon"
          viewBox="0 0 16 16"
          width="14"
          height="14"
          fill="none"
          stroke="currentColor"
          stroke-width="1.6"
          stroke-linecap="round"
          aria-hidden="true"
        >
          <circle cx="8" cy="8" r="4.5" />
          <path d="M8 1v3M8 12v3M1 8h3M12 8h3" />
        </svg>
        <span>{{ hoverTarget ? formatInspectorShortPath(hoverTarget) : "Locate source" }}</span>
        <kbd class="copy-inspector-kbd" aria-hidden="true">↵</kbd>
      </button>
      <div
        v-if="highlightStyle && (affordanceVisible || popup)"
        class="copy-inspector-highlight"
        :style="highlightStyle"
      />
      <div
        v-if="popup"
        ref="paneRef"
        class="copy-inspector-pane stage-pane"
        data-overlay-layer="floating"
        role="dialog"
        aria-label="Copy inspector"
        :style="popupStyle"
      >
        <p class="stage-pane-text copy-inspector-path mono">
          {{ formatInspectorPath(popup) }}
        </p>
        <div class="copy-inspector-actions btn-row">
          <Button variant="default" size="sm" @click="copyPath">
            Copy path <kbd class="copy-inspector-key" aria-hidden="true">C</kbd>
          </Button>
          <Button
            variant="outline"
            size="sm"
            :disabled="!editorConfigured || opening"
            :title="editorConfigured ? undefined : EDITOR_HINT"
            @click="openInEditor"
          >
            Open in editor <kbd class="copy-inspector-key" aria-hidden="true">↵</kbd>
          </Button>
          <Button variant="ghost" size="sm" @click="closePopup">
            Close <kbd class="copy-inspector-key" aria-hidden="true">Esc</kbd>
          </Button>
        </div>
        <p v-if="!editorConfigured" class="copy-inspector-msg">{{ EDITOR_HINT }}</p>
        <p v-if="popupMsg" class="copy-inspector-msg">{{ popupMsg }}</p>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.copy-inspector-root {
  display: contents;
}

.copy-inspector-affordance {
  position: fixed;
  z-index: 200;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 28px;
  padding: 0 10px 0 8px;
  border-radius: 999px;
  /* hardcode-ok: fixed dark code-pane palette — deliberately dark in every theme */
  border: 1px solid rgba(255, 255, 255, 0.55);
  background: #111827;
  color: #ffffff;
  font-size: 12px;
  font-weight: 600;
  line-height: 1;
  white-space: nowrap;
  cursor: crosshair;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.35);
  pointer-events: auto;
}

/* Fixed high-contrast colors on purpose: theme accents are pale in some themes
   (light mint) and made the pill and outline unreadable. */
.copy-inspector-highlight {
  position: fixed;
  z-index: 199;
  pointer-events: none;
  /* hardcode-ok: fixed dark code-pane palette — deliberately dark in every theme */
  border: 2px dashed #f97316;
  border-radius: 4px;
  background: rgba(249, 115, 22, 0.14);
}

.copy-inspector-key {
  margin-left: 6px;
  padding: 0 5px;
  border: 1px solid currentColor;
  border-radius: 4px;
  font: inherit;
  font-size: 11px;
  opacity: 0.6;
}

.copy-inspector-kbd {
  flex: none;
  padding: 1px 5px;
  border-radius: 4px;
  /* hardcode-ok: fixed dark code-pane palette — deliberately dark in every theme */
  border: 1px solid rgba(255, 255, 255, 0.45);
  font: inherit;
  font-size: 11px;
  color: #e5e7eb;
}

.copy-inspector-affordance-icon {
  flex: none;
  /* hardcode-ok: fixed dark code-pane palette — deliberately dark in every theme */
  color: #fb923c;
}

.copy-inspector-pane {
  position: fixed;
  z-index: 201;
  pointer-events: auto;
  box-sizing: border-box;
  width: max-content;
  max-width: calc(100vw - 24px);
  padding: 12px 14px 10px;
  /* .stage-pane centers itself with translateX(-50%) and animates it; that
     shifts the box away from the left/top we clamp to, so opt out. */
  transform: none;
  animation: none;
}

.copy-inspector-path {
  word-break: break-all;
  margin: 0 0 10px;
}

.copy-inspector-actions {
  margin: 0;
  flex-wrap: nowrap;
  gap: 8px;
}

.copy-inspector-actions :deep(button) {
  white-space: nowrap;
}

@media (max-width: 520px) {
  .copy-inspector-actions {
    flex-wrap: wrap;
  }
}

.copy-inspector-msg {
  margin: 8px 0 0;
  font-size: 12px;
  color: var(--txt-dim);
}
</style>
