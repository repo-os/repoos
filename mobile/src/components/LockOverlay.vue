<script setup lang="ts">
import { Lock } from "lucide-vue-next";

defineProps<{ open: boolean }>();
</script>

<template>
  <div v-if="open" class="lock-overlay">
    <div class="lock-card">
      <Lock class="lock-icon" :size="48" stroke-width="1.5" />
      <div class="lock-title">RepoOS Hub is locked</div>
      <div class="lock-sub">Authenticate with your device to continue.</div>
    </div>
  </div>
</template>