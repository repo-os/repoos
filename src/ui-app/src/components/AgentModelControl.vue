<script setup lang="ts">
import { computed, ref } from "vue";
import { Settings2 } from "lucide-vue-next";
import { labelForModel } from "../stores/config";
import type { SelectSearchOption } from "./SelectSearchGroup.vue";
import AgentModelModal from "./AgentModelModal.vue";

const props = defineProps<{
  cliOptions: string[];
  modelOptions: SelectSearchOption[];
  cli: string;
  model: string;
  /**
   * Stable id of the agent/task/panel whose cli/model this edits. Scopes the
   * browser-local per-CLI model memory so contexts don't bleed into each other
   * (#0360). Required so no consumer can accidentally share one.
   */
  memoryKey: string;
  disabled?: boolean;
  /**
   * Label shown while nothing is chosen yet (#0856). Defaults to
   * "Agent + Model" so existing consumers keep their wording; a creation
   * flow can pass a clearly-empty "Select…" prompt instead.
   */
  placeholder?: string;
}>();

const emit = defineEmits<{
  "update:cli": [value: string];
  "update:model": [value: string];
}>();

const modalOpen = ref(false);

const label = computed(() => {
  if (!props.cli && !props.model) return props.placeholder ?? "Agent + Model";
  const cli = props.cli || "Agent";
  const model = props.model ? labelForModel(props.model, props.cli) : "Model";
  return `${cli} + ${model}`;
});
</script>

<template>
  <button type="button" class="am-control" :disabled="disabled" @click="modalOpen = true">
    <Settings2 class="size-3.5 am-control-icon" />
    <span class="am-control-label">{{ label }}</span>
  </button>
  <AgentModelModal
    :open="modalOpen"
    :cli-options="cliOptions"
    :model-options="modelOptions"
    :cli="cli"
    :model="model"
    :memory-key="memoryKey"
    :disabled="disabled"
    @update:open="(v) => (modalOpen = v)"
    @update:cli="(v) => emit('update:cli', v)"
    @update:model="(v) => emit('update:model', v)"
  />
</template>
