<script setup lang="ts">
import { ref, watch } from "vue";
import { Search, X } from "lucide-vue-next";

/** The desktop board's search box (#1259). The URL owns the value; the draft
 *  keeps typing responsive while a route update is still committing. */
const props = defineProps<{ modelValue: string }>();
const emit = defineEmits<{ "update:modelValue": [value: string] }>();

const draft = ref(props.modelValue);

// Adopt a value that arrived from the URL (Back, a shared link) and not from
// this box, so the draft never lags behind the route.
watch(
  () => props.modelValue,
  (value) => {
    if (value !== draft.value) draft.value = value;
  },
);

function update(value: string): void {
  draft.value = value;
  emit("update:modelValue", value);
}
</script>

<template>
  <div class="board-queue-search">
    <div class="board-search-row">
      <Search class="board-search-icon" aria-hidden="true" />
      <input
        :value="draft"
        class="board-search-input"
        type="search"
        inputmode="search"
        autocomplete="off"
        autocapitalize="off"
        spellcheck="false"
        placeholder="Search id, title or area"
        aria-label="Search tasks"
        data-testid="board-queue-search"
        @input="update(($event.target as HTMLInputElement).value)"
      />
      <button
        v-if="draft"
        class="board-search-clear"
        type="button"
        aria-label="Clear search"
        data-testid="board-queue-search-clear"
        @click="update('')"
      >
        <X aria-hidden="true" />
      </button>
    </div>
  </div>
</template>

<style scoped>
/* Half the old 420px width (#1278). It grows to 210px when the header row has
   room and gives width back before the row wraps, so the row's intrinsic width
   is the 150px base, not the maximum. */
.board-queue-search {
  flex: 1 1 150px;
  width: 150px;
  min-width: 150px;
  max-width: 210px;
}
.board-search-row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 36px;
  padding: 0 4px 0 10px;
  border: 1px solid var(--border);
  border-radius: 9px;
  background: var(--bg);
}
.board-search-row:focus-within {
  border-color: var(--cyan);
}
.board-search-icon {
  width: 15px;
  height: 15px;
  flex: 0 0 auto;
  color: var(--txt-faint);
}
.board-search-input {
  min-width: 0;
  flex: 1;
  height: 34px;
  border: 0;
  background: transparent;
  color: var(--txt);
  font: inherit;
  font-size: 13px;
}
.board-search-input::placeholder {
  color: var(--txt-faint);
}
.board-search-input:focus {
  outline: none;
}
.board-search-input::-webkit-search-cancel-button {
  display: none;
}
.board-search-clear {
  display: inline-grid;
  width: 28px;
  height: 28px;
  flex: 0 0 auto;
  place-items: center;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: var(--txt-faint);
  cursor: pointer;
}
.board-search-clear:hover {
  color: var(--txt);
}
.board-search-clear :deep(svg) {
  width: 14px;
  height: 14px;
}
</style>
