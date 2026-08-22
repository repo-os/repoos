<script setup lang="ts">
import { computed, ref, nextTick, watch } from "vue";
import { Search, X } from "lucide-vue-next";
import type { SelectSearchOption } from "./SelectSearchGroup.vue";
import Dialog from "./ui/dialog/root.vue";
import DialogClose from "./ui/dialog/close.vue";
import DialogContent from "./ui/dialog/content.vue";
import DialogDescription from "./ui/dialog/description.vue";
import DialogOverlay from "./ui/dialog/overlay.vue";
import DialogTitle from "./ui/dialog/title.vue";

const props = defineProps<{
  open: boolean;
  cliOptions: string[];
  modelOptions: SelectSearchOption[];
  cli: string;
  model: string;
  disabled?: boolean;
}>();

const emit = defineEmits<{
  "update:open": [value: boolean];
  "update:cli": [value: string];
  "update:model": [value: string];
}>();

const modelQuery = ref("");
const modelSearchEl = ref<HTMLInputElement | null>(null);
const modelListEl = ref<HTMLElement | null>(null);

const currentModelLabel = computed(() => {
  return props.modelOptions.find((m) => m.value === props.model)?.label ?? props.model;
});

const filteredModels = computed(() => {
  const q = modelQuery.value.trim().toLowerCase();
  if (!q) return props.modelOptions;
  return props.modelOptions.filter(
    (m) => m.value === "default" || m.label.toLowerCase().includes(q),
  );
});

function selectCli(cli: string): void {
  if (cli === props.cli) return;
  emit("update:cli", cli);
  // The old model is very unlikely to be valid for the new CLI (and would
  // otherwise linger in the list via modelsFor's "saved" fallback) — reset
  // to default rather than carry over a value that doesn't belong to it.
  emit("update:model", "default");
}

function selectModel(model: string): void {
  emit("update:model", model);
  emit("update:open", false);
}

function onClose(): void {
  emit("update:open", false);
}

watch(
  () => props.open,
  (v) => {
    if (v) {
      modelQuery.value = "";
      nextTick(() => {
        const list = modelListEl.value;
        if (list) list.scrollTop = 0;
        modelSearchEl.value?.focus();
      });
    }
  },
);
</script>

<template>
  <Dialog :open="open" @update:open="(v) => emit('update:open', v)">
    <DialogOverlay />
    <DialogContent class="am-modal">
      <div class="am-modal-head">
        <div class="am-modal-head-text">
          <DialogTitle>Coding Agent + Model</DialogTitle>
          <div class="am-modal-current">{{ cli }} · {{ currentModelLabel }}</div>
        </div>
        <DialogDescription class="sr-only">
          Choose a coding agent and model
        </DialogDescription>
        <DialogClose class="close-x">
          <X class="size-[15px]" />
        </DialogClose>
      </div>

      <div class="am-cli-picker">
        <button
          v-for="c in cliOptions"
          :key="c"
          type="button"
          class="am-cli-btn"
          :class="{ active: c === cli }"
          @click="selectCli(c)"
        >
          {{ c }}
        </button>
      </div>

      <div class="am-model-search">
        <div class="am-model-search-wrap">
          <Search
            class="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-[var(--txt-faint)]"
          />
          <input
            ref="modelSearchEl"
            v-model="modelQuery"
            type="text"
            role="combobox"
            aria-label="Search models"
            placeholder="Search models…"
            class="am-model-search-input"
          />
        </div>
      </div>

      <div ref="modelListEl" class="am-model-list" role="listbox" aria-label="Models">
        <button
          v-for="m in filteredModels"
          :key="m.value"
          type="button"
          class="am-model-item"
          :class="{ active: m.value === model, disabled: m.disabled }"
          :disabled="m.disabled"
          role="option"
          :aria-selected="m.value === model"
          @click="selectModel(m.value)"
        >
          <span class="am-model-label">{{ m.label }}</span>
          <span v-if="m.disabled" class="am-model-disabled-hint">— unavailable</span>
          <span v-if="m.value === model" class="am-model-check">✓</span>
        </button>
        <div v-if="!filteredModels.length" class="am-model-empty">
          No models match "{{ modelQuery }}"
        </div>
      </div>
    </DialogContent>
  </Dialog>
</template>
