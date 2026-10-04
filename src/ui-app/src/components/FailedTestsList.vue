<script setup lang="ts">
import { computed } from "vue";
import { api, JSON_OPTS } from "../api";
import { useConfigStore } from "../stores/config";
import { useRepoStore } from "../stores/repo";

/**
 * A run's failing tests (`file > suite > test`), file first, each with an
 * "Open" link that launches the test file in the configured editor. Shared by
 * the Checks Runs tab and the release failure panel. The link only shows when
 * it can work: the dev API is available and an editor command is configured
 * (same gate as the task drawer's "Open in editor").
 */
const props = defineProps<{ tests: string[] }>();

const config = useConfigStore();
const repo = useRepoStore();

const editorConfigured = computed(() => {
  const inspector = (
    config.data?.dev as { inspector?: { enabled?: boolean; editorCommand?: string } } | undefined
  )?.inspector;
  if (inspector?.enabled === false) return false;
  const cmd = inspector?.editorCommand;
  return repo.health?.copyInspectorAvailable === true && typeof cmd === "string" && !!cmd.trim();
});

const rows = computed(() =>
  props.tests.map((t) => {
    const [file, ...rest] = t.split(" > ");
    return { full: t, file, name: rest.join(" > ") };
  }),
);

async function open(test: string): Promise<void> {
  try {
    await api("/api/dev/open-test-in-editor", JSON_OPTS("POST", { test }));
  } catch (err) {
    repo.pushToast(err instanceof Error ? err.message : "Could not open editor", "error");
  }
}
</script>

<template>
  <ul class="ft-list" data-test-id="failed-tests">
    <li v-for="r in rows" :key="r.full" class="ft-row">
      <div class="ft-text">
        <span class="ft-file mono">{{ r.file }}</span>
        <span v-if="r.name" class="ft-name">{{ r.name }}</span>
      </div>
      <button
        v-if="editorConfigured"
        type="button"
        class="ft-open"
        :aria-label="`Open ${r.file} in your editor`"
        @click="open(r.full)"
      >
        Open ↗
      </button>
    </li>
  </ul>
</template>

<style scoped>
.ft-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.ft-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}
.ft-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.ft-file {
  font-size: 12px;
  color: var(--txt);
  overflow-wrap: anywhere;
}
.ft-name {
  font-size: 11.5px;
  color: var(--txt-dim);
  overflow-wrap: anywhere;
}
.mono {
  font-family: var(--mono);
}
.ft-open {
  flex: none;
  background: none;
  border: none;
  padding: 0;
  font: inherit;
  font-size: 12px;
  color: var(--cyan);
  cursor: pointer;
  white-space: nowrap;
}
.ft-open:hover {
  text-decoration: underline;
}
</style>
