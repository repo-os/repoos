<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, shallowRef } from "vue";
import { Teleport } from "vue";
import { api, JSON_OPTS } from "../api";
import Button from "./ui/button.vue";
import {
  findCopyInspectorTarget,
  formatInspectorPath,
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

function updateAffordance(e: PointerEvent): void {
  if (!active.value || popup.value) {
    affordanceVisible.value = false;
    hoverTarget.value = null;
    return;
  }
  if (!e.altKey) {
    affordanceVisible.value = false;
    hoverTarget.value = null;
    return;
  }
  const hitEl =
    e.target instanceof Element ? e.target : document.elementFromPoint(e.clientX, e.clientY);
  if (paneRef.value?.contains(hitEl instanceof Node ? hitEl : null)) {
    return;
  }
  if (hitEl instanceof Element && isInteractiveElement(hitEl)) {
    affordanceVisible.value = false;
    hoverTarget.value = null;
    return;
  }
  const node = textUnderPoint(e.clientX, e.clientY);
  const target = findCopyInspectorTarget(node);
  if (!target) {
    affordanceVisible.value = false;
    hoverTarget.value = null;
    return;
  }
  const text = (node?.textContent ?? "").replace(/\s+/g, " ").trim();
  if (!text) {
    affordanceVisible.value = false;
    hoverTarget.value = null;
    return;
  }
  hoverTarget.value = target;
  affordanceVisible.value = true;
  affordanceStyle.value = { left: `${e.clientX + 10}px`, top: `${e.clientY + 10}px` };
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
  affordanceVisible.value = false;
  hoverTarget.value = null;
}

function closePopup(): void {
  popup.value = null;
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

onMounted(() => {
  window.addEventListener("pointermove", onPointerMove, { passive: true });
  window.addEventListener("keydown", onKeydown);
});

onUnmounted(() => {
  window.removeEventListener("pointermove", onPointerMove);
  window.removeEventListener("keydown", onKeydown);
  if (moveRaf) cancelAnimationFrame(moveRaf);
});
</script>

<template>
  <div v-if="active" class="copy-inspector-root" aria-hidden="true">
    <Teleport to="body">
      <button
        v-if="affordanceVisible && !popup"
        type="button"
        class="copy-inspector-affordance"
        :style="affordanceStyle"
        title="Locate source (Alt+click)"
        @pointerdown.stop.prevent="openFromAffordance"
      >
        ⌖
      </button>
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
            @click="openInEditor"
          >
            Open in editor
          </Button>
          <Button variant="ghost" size="sm" @click="closePopup">Close</Button>
        </div>
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
  width: 26px;
  height: 26px;
  border-radius: 6px;
  border: 1px solid var(--border);
  background: var(--panel-solid);
  color: var(--accent);
  font-size: 14px;
  line-height: 1;
  cursor: crosshair;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.35);
  pointer-events: auto;
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
