<script setup lang="ts">
import { computed, ref } from "vue";
import type { Task } from "../types";
import Input from "./ui/input.vue";

const props = withDefaults(
  defineProps<{
    modelValue: string[];
    tasks: Task[];
    excludeId?: string;
    id: string;
    label?: string;
  }>(),
  { excludeId: "", label: "Depends on" },
);
const emit = defineEmits<{ "update:modelValue": [value: string[]] }>();
const query = ref("");

const candidates = computed(() => {
  const search = query.value.trim().toLocaleLowerCase();
  return props.tasks
    .filter((task) => task.id !== props.excludeId)
    .filter(
      (task) =>
        !search || task.id.includes(search) || task.title.toLocaleLowerCase().includes(search),
    )
    .slice(0, 8);
});
const selectedTasks = computed(() =>
  props.modelValue.map(
    (id) => props.tasks.find((task) => task.id === id) ?? { id, title: "Task not found" },
  ),
);

function toggle(id: string): void {
  const current = props.modelValue;
  emit(
    "update:modelValue",
    current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
  );
}
</script>

<template>
  <div class="task-dependency-picker">
    <label :for="id">{{ label }}</label>
    <!-- #1282: what is set reads first, as chips; the candidate list below is the only long part. -->
    <ul v-if="selectedTasks.length" class="dependency-selected" aria-label="Selected prerequisites">
      <li v-for="task in selectedTasks" :key="task.id" class="dependency-chip">
        <span class="dependency-chip-id">#{{ task.id }}</span>
        <span class="dependency-chip-title">{{ task.title }}</span>
        <button
          type="button"
          class="dependency-chip-remove"
          :aria-label="`Remove dependency ${task.id}`"
          @click="toggle(task.id)"
        >
          <span aria-hidden="true">×</span>
        </button>
      </li>
    </ul>
    <p v-else class="dependency-none">None</p>
    <Input :id="id" v-model="query" type="search" placeholder="Find a task by title or ID" />
    <ul v-if="candidates.length" class="dependency-options" :aria-label="`${label} options`">
      <li v-for="task in candidates" :key="task.id">
        <button
          type="button"
          class="dependency-option"
          :aria-pressed="modelValue.includes(task.id)"
          @click="toggle(task.id)"
        >
          <span class="dependency-check" aria-hidden="true">{{
            modelValue.includes(task.id) ? "✓" : ""
          }}</span>
          <span class="dependency-copy"
            ><strong>#{{ task.id }}</strong> {{ task.title }}</span
          >
          <span class="dependency-status">{{ task.status }}</span>
        </button>
      </li>
    </ul>
    <p v-else class="dependency-empty">No matching tasks.</p>
  </div>
</template>

<style scoped>
.task-dependency-picker {
  display: grid;
  gap: 7px;
  min-width: 0;
}

.dependency-options,
.dependency-selected {
  display: grid;
  gap: 4px;
  list-style: none;
  margin: 0;
  padding: 0;
}

.dependency-options {
  width: 100%;
  min-width: 0;
  max-width: 100%;
  box-sizing: border-box;
  max-height: 190px;
  overflow-x: hidden;
  overflow-y: auto;
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 4px;
}

.dependency-options li {
  width: 100%;
  min-width: 0;
}

.dependency-option {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-width: 0;
  max-width: 100%;
  box-sizing: border-box;
  overflow: hidden;
  padding: 7px 8px;
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
}

.dependency-option:hover,
.dependency-option[aria-pressed="true"] {
  background: var(--muted);
}

.dependency-option:focus-visible,
.dependency-selected button:focus-visible {
  outline: 2px solid var(--ring);
  outline-offset: 1px;
}

.dependency-check {
  display: grid;
  flex: 0 0 16px;
  width: 16px;
  height: 16px;
  place-items: center;
  border: 1px solid var(--border);
  border-radius: 4px;
  font-size: 11px;
}

.dependency-copy {
  flex: 1 1 0%;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
}

.dependency-status {
  flex: 0 0 auto;
  margin-left: auto;
  color: var(--foreground);
  font-size: 10px;
}

.dependency-empty {
  margin: 0;
  color: var(--foreground);
  font-size: 12px;
}

.dependency-selected {
  flex-wrap: wrap;
  display: flex;
  gap: 6px;
}

.dependency-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 100%;
  min-width: 0;
  padding: 3px 4px 3px 8px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--chip-bg);
  color: var(--foreground);
  font-size: 11px;
}

.dependency-chip-id {
  flex: 0 0 auto;
  font-family: var(--mono, ui-monospace, monospace);
  color: var(--txt-dim);
}

.dependency-chip-title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dependency-chip-remove {
  display: grid;
  flex: 0 0 auto;
  width: 20px;
  height: 20px;
  place-items: center;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--foreground);
  font-size: 13px;
  line-height: 1;
  cursor: pointer;
}

.dependency-chip-remove:hover {
  background: var(--muted);
}

.dependency-chip-remove:focus-visible {
  outline: 2px solid var(--ring);
  outline-offset: 1px;
}

.dependency-none {
  margin: 0;
  color: var(--txt-dim);
  font-size: 12px;
}

@media (pointer: coarse) {
  .dependency-chip-remove {
    width: 44px;
    height: 44px;
  }
}
</style>
