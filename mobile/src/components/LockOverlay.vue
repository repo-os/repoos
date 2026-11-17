<script setup lang="ts">
import { Lock } from "lucide-vue-next";

defineProps<{ open: boolean; cancelable?: boolean }>();
const emit = defineEmits<{ retry: []; cancel: [] }>();
</script>

<template>
  <div v-if="open" class="lock-overlay">
    <div class="lock-card">
      <Lock class="lock-icon" :size="48" stroke-width="1.5" />
      <div class="lock-title">RepoOS Hub is locked</div>
      <div class="lock-sub">Authenticate with your device to continue.</div>
      <div class="lock-actions">
        <button type="button" class="btn-primary" @click="emit('retry')">Try again</button>
        <button
          v-if="cancelable"
          type="button"
          class="btn-ghost"
          data-testid="hub-lock-cancel"
          @click="emit('cancel')"
        >
          Cancel
        </button>
      </div>
    </div>
  </div>
</template>
