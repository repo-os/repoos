<script setup lang="ts">
import { computed, ref, nextTick, watch } from "vue";
import { Search, X, Star } from "lucide-vue-next";
import type { SelectSearchOption } from "./SelectSearchGroup.vue";
import Dialog from "./ui/dialog/root.vue";
import DialogClose from "./ui/dialog/close.vue";
import DialogContent from "./ui/dialog/content.vue";
import DialogDescription from "./ui/dialog/description.vue";
import DialogOverlay from "./ui/dialog/overlay.vue";
import DialogTitle from "./ui/dialog/title.vue";
import { useFavorites } from "../composables/useFavorites";

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
const favoritesExpanded = ref(true);

const { isFavorite, toggleFavorite, getFavoritesForCli, hasFavorites: hasAnyFavorites } = useFavorites();

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

const hasFavoritesForCurrentCli = computed(() => getFavoritesForCli(props.cli).length > 0);

const favoriteItems = computed(() => {
  const favorites = getFavoritesForCli(props.cli);
  return favorites
    .map((fav) => props.modelOptions.find((m) => m.value === fav.model))
    .filter((m) => m !== undefined) as SelectSearchOption[];
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

function toggleFavoriteForModel(cli: string, model: string, e: Event): void {
  e.stopPropagation();
  toggleFavorite(cli, model);
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
        <div class="am-cli-btn-wrapper" v-for="c in cliOptions" :key="c">
          <button
            type="button"
            class="am-cli-star"
            :class="{ active: isFavorite(c, model) }"
            @click="(e) => toggleFavoriteForModel(c, model, e)"
            title="Add to favorites"
          >
            <Star class="size-3.5" :fill="isFavorite(c, model) ? 'currentColor' : 'none'" />
          </button>
          <button
            type="button"
            class="am-cli-btn"
            :class="{ active: c === cli }"
            @click="selectCli(c)"
          >
            {{ c }}
          </button>
        </div>
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
        <!-- Favorites section -->
        <div v-if="hasFavoritesForCurrentCli && !modelQuery" class="am-favorites-section">
          <button
            type="button"
            class="am-favorites-header"
            @click="favoritesExpanded = !favoritesExpanded"
          >
            <span class="am-favorites-title">Favorites</span>
            <span class="am-favorites-count">{{ favoriteItems.length }}</span>
            <span class="am-favorites-toggle" :class="{ expanded: favoritesExpanded }">
              ▼
            </span>
          </button>
          <div v-if="favoritesExpanded" class="am-favorites-list">
            <div
              v-for="m in favoriteItems"
              :key="m.value"
              class="am-model-item am-favorite-item"
              :class="{ active: m.value === model, disabled: m.disabled }"
              :aria-disabled="m.disabled"
              role="option"
              :aria-selected="m.value === model"
              @click="!m.disabled && selectModel(m.value)"
            >
              <span class="am-model-label">{{ m.label }}</span>
              <span v-if="m.disabled" class="am-model-disabled-hint">— unavailable</span>
              <div class="am-model-actions">
                <span v-if="m.value === model" class="am-model-check">✓</span>
                <button
                  type="button"
                  class="am-star-btn"
                  @click="toggleFavoriteForModel(cli, m.value, $event)"
                  title="Remove from favorites"
                >
                  <Star class="size-3.5" fill="currentColor" />
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- All models section -->
        <div v-if="filteredModels.length > 0" class="am-all-models-section">
          <div v-if="hasFavoritesForCurrentCli && !modelQuery" class="am-all-models-header">
            All Models
          </div>
          <div
            v-for="m in filteredModels"
            :key="m.value"
            class="am-model-item"
            :class="{ active: m.value === model, disabled: m.disabled }"
            :aria-disabled="m.disabled"
            role="option"
            :aria-selected="m.value === model"
            @click="!m.disabled && selectModel(m.value)"
          >
            <span class="am-model-label">{{ m.label }}</span>
            <span v-if="m.disabled" class="am-model-disabled-hint">— unavailable</span>
            <div class="am-model-actions">
              <span v-if="m.value === model" class="am-model-check">✓</span>
              <button
                type="button"
                class="am-star-btn"
                :class="{ active: isFavorite(cli, m.value) }"
                @click="toggleFavoriteForModel(cli, m.value, $event)"
                title="Add to favorites"
              >
                <Star class="size-3.5" :fill="isFavorite(cli, m.value) ? 'currentColor' : 'none'" />
              </button>
            </div>
          </div>
        </div>

        <div v-if="!filteredModels.length" class="am-model-empty">
          No models match "{{ modelQuery }}"
        </div>
        <div v-if="!hasAnyFavorites && !modelQuery" class="am-no-favorites-hint">
          No favorites yet — click the star icon to save your favorite agent + model combinations
        </div>
      </div>
    </DialogContent>
  </Dialog>
</template>
