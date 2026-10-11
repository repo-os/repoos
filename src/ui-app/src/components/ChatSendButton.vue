<script setup lang="ts">
/**
 * The one submit control for every AI chat surface (#0757).
 *
 * It is a compact, square-ish paperplane icon button carrying the shared
 * `.ai-chat-send` fill — no text label. Before this, the surfaces were split
 * between a paperplane glyph (PM, Ross) and text labels ("Send" in the CTO and
 * Playground, "Diagnose" in both Debuggers), so the same action looked like a
 * different widget depending on where you were. Rendering this component keeps
 * the icon, size and wording identical everywhere by construction rather than
 * by six copies agreeing.
 *
 * The classes are deliberately the shared ones from style.css (`.ai-chat-send`
 * for the fill, the base `.ai-chat-compose button` for the 31px square), so no
 * surface adds its own variant. Callers pass `disabled` and an optional
 * `aria-label`; the label defaults to the one wording every chat shares.
 */
const props = withDefaults(
  defineProps<{
    /** True while the message cannot be sent (empty draft, busy, or disabled). */
    disabled?: boolean;
    /** Accessible name; the plain "Send message" unless a chat needs more. */
    label?: string;
  }>(),
  { disabled: false, label: "Send message" },
);
</script>

<template>
  <button
    type="submit"
    class="ai-chat-send"
    :disabled="props.disabled"
    :aria-label="props.label"
    :title="props.label"
  >
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
