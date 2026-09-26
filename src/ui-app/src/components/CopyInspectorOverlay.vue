<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, shallowRef } from "vue";
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
const affordanceStyle = ref<{ left: string; top: string }>({ left: "0px", top: "0px" });
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

const popupStyle = computed(() => {
  const pad = 12;
  const w = 320;
  const x = Math.min(Math.max(pad, popupPos.value.x - w / 2), window.innerWidth - w - pad);
  const y = Math.max(pad, Math.min(popupPos.value.y, window.innerHeight - 160));
  return { left: `${x}px`, top: `${y}px`, width: `${w}px` };
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
const pinnedAffordancePos = ref<{ left: string; top: string } | null>(null);
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
    pinnedAffordancePos.value = { left: `${e.clientX + 10}px`, top: `${e.clientY + 10}px` };
  }
  affordanceStyle.value = pinnedAffordancePos.value;
}

function onPointerMove(e: PointerEvent): void {
  lastMove = e;
  if (moveRaf) return;
  moveRaf = requestAnimationFrame(() => {
    moveRaf = 0;
    if (lastMove) updateAffordance(lastMove);
  });
}

function openFromAffordance(e: PointerEvent): void {
  if (!hoverTarget.value) return;
  e.preventDefault();
  e.stopPropagation();
  popup.value = hoverTarget.value;
  popupPos.value = { x: e.clientX, y: e.clientY + 12 };
  popupMsg.value = "";
  hideAffordance();
}

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
  if (e.key === "Escape") closePopup();
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
  window.addEventListener("keydown", onKeydown);
});

onUnmounted(() => {
  window.removeEventListener("pointermove", onPointerMove);
  window.removeEventListener("pointerdown", onPointerDownOutside, true);
  window.removeEventListener("keydown", onKeydown);
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
        :style="affordanceStyle"
        title="Open the source location for the outlined element"
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
        role="dialog"
        aria-label="Copy inspector"
        :style="popupStyle"
      >
        <p class="stage-pane-text copy-inspector-path mono">
          {{ formatInspectorPath(popup) }}
        </p>
        <div class="copy-inspector-actions btn-row">
          <Button variant="default" size="sm" @click="copyPath">Copy path</Button>
          <Button
            variant="outline"
            size="sm"
            :disabled="!editorConfigured || opening"
            :title="editorConfigured ? undefined : EDITOR_HINT"
            @click="openInEditor"
          >
            Open in editor
          </Button>
          <Button variant="ghost" size="sm" @click="closePopup">Close</Button>
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
  border: 2px dashed #f97316;
  border-radius: 4px;
  background: rgba(249, 115, 22, 0.14);
}

.copy-inspector-affordance-icon {
  flex: none;
  color: #fb923c;
}

.copy-inspector-pane {
  position: fixed;
  z-index: 201;
  pointer-events: auto;
  padding: 12px 14px 10px;
  max-width: calc(100vw - 24px);
}

.copy-inspector-path {
  word-break: break-all;
  margin: 0 0 10px;
}

.copy-inspector-actions {
  margin: 0;
  flex-wrap: wrap;
  gap: 8px;
}

.copy-inspector-msg {
  margin: 8px 0 0;
  font-size: 12px;
  color: var(--txt-dim);
}
</style>
