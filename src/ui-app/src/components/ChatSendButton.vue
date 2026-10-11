<script setup lang="ts">
/**
 * The one submit control for every AI chat surface (#0757).
 *
 * It is a compact, square-ish paperplane icon button carrying the shared
 * `.ai-chat-send` fill — no text label. Before this, the surfaces were split
 * between a paperplane glyph (PM, Ross) and text labels ("Send" in the CTO and
 * Playground, "Diagnose" in both Debuggers), so the same action looked like a
 * different widget depending on where you were. Rendering this component keeps
 * the icon, size, wording and accessible name identical everywhere by
 * construction rather than by seven copies agreeing.
 *
 * There is deliberately no `label` prop: the accessible name is the same
 * "Send message" on every surface, so the control cannot drift back to
 * per-chat wording. The classes are the shared ones from style.css
 * (`.ai-chat-send` for the fill, the base `.ai-chat-compose button` for the
 * 31px square), so no surface adds its own variant. No native `title` tooltip
 * either — the accessible name carries the wording, per the repo's UI
 * conventions (styled tooltips for visible explanations, never a native one).
 */
withDefaults(
  defineProps<{
    /** True while the message cannot be sent (empty draft, busy, or disabled). */
    disabled?: boolean;
  }>(),
  { disabled: false },
);
</script>

<template>
  <button type="submit" class="ai-chat-send" :disabled="disabled" aria-label="Send message">
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path
        d="m3 9 13-6-5.5 14-2-5.5L3 9Z"
        stroke="currentColor"
        stroke-width="1.7"
        stroke-linejoin="round"
      />
      <path d="m8.5 11.5 3-3" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" />
    </svg>
  </button>
</template>
