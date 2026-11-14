<script setup lang="ts">
import { X } from "lucide-vue-next";

defineProps<{
  title: string;
  open: boolean;
}>();

const emit = defineEmits<{
  close: [];
}>();
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="sheet-root" data-overlay-layer="floating">
      <button
        type="button"
        class="sheet-scrim"
        aria-label="Close"
        data-overlay-layer="floating"
        @click="emit('close')"
      />
      <div class="sheet-panel" role="dialog" :aria-label="title">
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
