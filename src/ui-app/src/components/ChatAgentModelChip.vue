<script setup lang="ts">
/**
 * The inline "coding agent + model" chip for an agent-chat header (#0669).
 *
 * A chat header shows only the agent's name, its chip and the close button, so
 * the chip has to stay compact: it shows the CURRENT cli + model, truncates
 * when the pair is long, and is capped at roughly half the header width. It
 * opens the same `AgentModelModal` the task panel's PM/Engineer/Reviewer
 * pickers use (through the shared `AgentModelControl`), so choosing an agent +
 * model here is identical to choosing one there — the host owns persistence
 * (the Agents page's own path).
 *
 * Wrapped in a span because `AgentModelControl` renders a fragment (button +
 * modal), so a `class` passed from here would not fall through onto the button.
 */
import type { SelectSearchOption } from "./SelectSearchGroup.vue";
import AgentModelControl from "./AgentModelControl.vue";

defineProps<{
  cliOptions: string[];
  modelOptions: SelectSearchOption[];
  cli: string;
  model: string;
  /** Stable id scoping the browser-local per-CLI model memory (#0360). */
  memoryKey: string;
  disabled?: boolean;
}>();

const emit = defineEmits<{
  "update:cli": [value: string];
  "update:model": [value: string];
}>();
</script>

<template>
  <span class="chat-agent-chip">
    <AgentModelControl
      :cli-options="cliOptions"
      :model-options="modelOptions"
      :cli="cli"
      :model="model"
      :memory-key="memoryKey"
      :disabled="disabled"
      @update:cli="(v) => emit('update:cli', v)"
      @update:model="(v) => emit('update:model', v)"
    />
  </span>
</template>
