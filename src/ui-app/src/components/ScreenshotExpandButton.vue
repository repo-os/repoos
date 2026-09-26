<script setup lang="ts">
import { Maximize2 } from "lucide-vue-next";

defineProps<{ name: string }>();
defineEmits<{ click: [] }>();
</script>

<template>
  <button
    type="button"
    class="shot-expand"
    :aria-label="`See larger: ${name}`"
    title="See larger"
    @click.stop="$emit('click')"
  >
    <Maximize2 class="shot-expand-icon" aria-hidden="true" />
  </button>
</template>
