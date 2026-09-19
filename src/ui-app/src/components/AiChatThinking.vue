<script setup lang="ts">
/**
 * The shared "the model is working" indicator for every AI chat (#0444).
 *
 * It renders nothing at all when the model is idle. Chats must convey state
 * visually and never print a text status line — the old "— agent stopped —"
 * entry in the agent log was replaced by exactly this: something pulsing while
 * the model works, and nothing once it stops.
 *
 * Styling lives in style.css under `.ai-chat-thinking` so every chat pulses
 * identically.
 */
withDefaults(defineProps<{ active: boolean; label?: string }>(), {
  label: "Assistant is working",
});
</script>

<template>
  <div
    v-if="active"
    class="ai-chat-thinking"
    data-testid="ai-chat-thinking"
    role="status"
    :aria-label="label"
  >
    <span></span><span></span><span></span>
  </div>
</template>
