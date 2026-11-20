<script setup lang="ts">
import { nextTick, ref, watch } from "vue";
import { X } from "lucide-vue-next";

const props = defineProps<{
  title: string;
  open: boolean;
}>();

const emit = defineEmits<{
  close: [];
}>();

const FOCUSABLE = "button:not([disabled]), input:not([disabled]), select, textarea, [href]";
const panelEl = ref<HTMLElement | null>(null);
/** The control that had focus before the sheet opened, so closing returns to it. */
let returnFocusTo: HTMLElement | null = null;

// A sheet is modal: focus moves into it on open and comes back on close, so a
// keyboard user never tabs into the page hidden behind the scrim.
watch(
  () => props.open,
  async (open) => {
    if (open) {
      returnFocusTo = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      await nextTick();
      panelEl.value?.focus();
    } else {
      returnFocusTo?.focus();
      returnFocusTo = null;
    }
  },
);

function onKeydown(ev: KeyboardEvent) {
  if (ev.key === "Escape") {
    ev.preventDefault();
    emit("close");
    return;
  }
  if (ev.key !== "Tab" || !panelEl.value) return;
  // Tab cycles inside the panel only; the scrim is not part of the tab order.
  const items = Array.from(panelEl.value.querySelectorAll<HTMLElement>(FOCUSABLE));
  const first = items[0];
  const last = items[items.length - 1];
  const active = document.activeElement;
  if (!first || !last) {
    ev.preventDefault();
    return;
  }
  if (ev.shiftKey && (active === first || active === panelEl.value)) {
    ev.preventDefault();
    last.focus();
  } else if (!ev.shiftKey && active === last) {
    ev.preventDefault();
    first.focus();
  }
}
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="sheet-root" data-overlay-layer="floating" @keydown="onKeydown">
      <button
        type="button"
        class="sheet-scrim"
        aria-label="Close"
        tabindex="-1"
        data-overlay-layer="floating"
        @click="emit('close')"
      />
      <div ref="panelEl" class="sheet-panel" role="dialog" tabindex="-1" :aria-label="title">
        <header class="sheet-head">
          <h2 class="sheet-title">{{ title }}</h2>
          <button type="button" class="icon-touch" aria-label="Close" @click="emit('close')">
            <X :size="22" stroke-width="2" />
          </button>
        </header>
        <div class="sheet-body">
          <slot />
        </div>
      </div>
    </div>
  </Teleport>
</template>
