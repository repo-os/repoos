<script setup lang="ts">
import { computed } from "vue";
import { AlertCircle } from "lucide-vue-next";
import { fmtTime } from "../lib/time";
const props = defineProps<{ text: string; at?: string }>();
const failed = computed(() => /\bERROR\b|\berror[: ]|\bfailed\b|Abort trap/i.test(props.text));
const summary = computed(() => {
  const first = props.text.split("\n").find((line) => line.trim()) ?? "Agent diagnostic";
  if (/apply_patch verification failed/.test(first))
    return "Patch could not be applied: expected source lines were not found";
  return first.replace(/^\d{4}-\d{2}-\d{2}T\S+\s+(?:ERROR|WARN|INFO|DEBUG)\s+\S+:\s*/, "");
});
</script>
<template>
  <details class="agent-diagnostic" data-testid="chat-diagnostic-row">
    <summary>
      <AlertCircle class="size-3.5" aria-hidden="true" />
      <span class="agent-diagnostic-label" :class="{ error: failed }">{{
        failed ? "Error" : "Diagnostic"
      }}</span>
      <span class="agent-diagnostic-summary">{{ summary }}</span>
      <time v-if="at" class="agent-tool-time">{{ fmtTime(at) }}</time>
    </summary>
    <pre class="agent-tool-out">{{ text }}</pre>
  </details>
</template>
