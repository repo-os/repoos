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
  disabled?: boolean;
}>();

const emit = defineEmits<{
  "update:cli": [value: string];
  "update:model": [value: string];
}>();

const modalOpen = ref(false);

const cliLabel = computed(() => props.cli || "Agent");
const modelLabel = computed(() => (props.model ? labelForModel(props.model) : "Model"));
</script>

<template>
  <button type="button" class="am-control" :disabled="disabled" @click="modalOpen = true">
    <Settings2 class="size-3.5 am-control-icon" />
    <span class="am-control-label">{{ cliLabel }} + {{ modelLabel }}</span>
  </button>
  <AgentModelModal
    :open="modalOpen"
    :cli-options="cliOptions"
    :model-options="modelOptions"
    :cli="cli"
    :model="model"
    :disabled="disabled"
    @update:open="(v) => (modalOpen = v)"
    @update:cli="(v) => emit('update:cli', v)"
    @update:model="(v) => emit('update:model', v)"
  />
</template>
