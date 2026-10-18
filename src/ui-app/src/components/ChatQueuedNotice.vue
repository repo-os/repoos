<script setup lang="ts">
/**
 * The shared "message queued" notice for every AI chat (#0821).
 *
 * A message sent while an agent is busy is accepted and read when the current
 * turn ends. This is the one place that wording lives, so PM, Debugger, CTO,
 * Ross and the task drawer's composers all say the same thing — and the queued
 * state is never a silent no-op the human has to guess at.
 */
withDefaults(
  defineProps<{
    /** True while a queued message is waiting for the current turn to end. */
    active?: boolean;
  }>(),
  { active: false },
);
</script>

<template>
  <p v-if="active" class="chat-queued-note" role="status" data-test-id="chat-queued-note">
    Queued — will be read when the current turn ends.
  </p>
</template>
