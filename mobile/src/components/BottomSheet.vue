<script setup lang="ts">
import { ref } from "vue";
import { X } from "lucide-vue-next";
import { useModalFocus } from "../modal-focus";

const props = defineProps<{
  title: string;
  open: boolean;
}>();

const emit = defineEmits<{
  close: [];
}>();

const panelEl = ref<HTMLElement | null>(null);
// A sheet is modal: focus moves into it on open and comes back on close, so a
// keyboard user never tabs into the page hidden behind the scrim.
const { onKeydown } = useModalFocus({
  active: () => props.open,
  panel: panelEl,
  onEscape: () => emit("close"),
});
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
