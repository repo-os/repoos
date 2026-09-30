<script setup lang="ts">
import { copyToClipboard } from "../lib/clipboard";
import { useRepoStore } from "../stores/repo";

const props = defineProps<{
  label: string;
  path: string;
  ariaLabel: string;
}>();

const repo = useRepoStore();

async function copyLink(event: MouseEvent): Promise<void> {
  event.stopPropagation();
  const link = new URL(props.path, window.location.origin).href;
  if (await copyToClipboard(link)) {
    repo.pushToast("Link copied to clipboard", "success");
  } else {
    repo.pushToast("Could not copy link to clipboard", "error");
  }
}
</script>

<template>
  <button
    type="button"
    class="copyable-number"
    :aria-label="ariaLabel"
    title="Copy link"
    @click="copyLink"
  >
    {{ label }}
  </button>
</template>

<style scoped>
.copyable-number {
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  padding: 2px 7px;
  border: 1px solid var(--border-bright);
  border-radius: 6px;
  background: color-mix(in srgb, var(--accent) 12%, var(--chip-bg));
  color: var(--txt);
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.04em;
  line-height: 1;
  white-space: nowrap;
  cursor: copy;
  transition:
    border-color 120ms ease,
    background 120ms ease,
    color 120ms ease;
}
.copyable-number:hover,
.copyable-number:focus-visible {
  border-color: var(--accent);
  background: color-mix(in srgb, var(--accent) 22%, var(--chip-bg));
  /* `--accent` is a translucent tint — as a text color it rendered at
     contrast 1.00 (the glyph color WAS the background). The readable
     counterpart is --accent-foreground (#0596). */
  color: var(--accent-foreground);
}
.copyable-number:focus-visible {
  outline: 2px solid var(--border-focus);
  outline-offset: 2px;
}
</style>
