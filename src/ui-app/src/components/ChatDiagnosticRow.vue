<script setup lang="ts">
import { computed } from "vue";
import { fmtTime } from "../lib/time";
const props = defineProps<{ text: string; at?: string; firstAt?: string; count?: number }>();
const summary = computed(() => {
  const first = props.text.split("\n").find((line) => line.trim()) ?? "Agent diagnostic";
  if (/apply_patch verification failed/.test(first))
    return "Patch could not be applied: expected source lines were not found";
  return first.replace(/^\d{4}-\d{2}-\d{2}T\S+\s+(?:ERROR|WARN|INFO|DEBUG)\s+\S+:\s*/, "");
});
</script>
<template>
  <details class="agent-diagnostic agent-diagnostic-neutral" data-testid="chat-diagnostic-row">
    <summary>
      <span class="agent-diagnostic-label">Agent output</span>
      <span class="agent-diagnostic-summary">{{ summary }}</span>
      <span v-if="count && count > 1" class="agent-diagnostic-count">×{{ count }}</span>
      <time v-if="firstAt || at" class="agent-tool-time">{{ fmtTime(firstAt || at) }}</time>
      <span v-if="count && count > 1 && at && at !== firstAt" class="agent-tool-time"
        >→ {{ fmtTime(at) }}</span
      >
    </summary>
    <pre class="agent-tool-out">{{
      count && count > 1 ? `${count} identical entries:\n${text}` : text
    }}</pre>
  </details>
</template>
