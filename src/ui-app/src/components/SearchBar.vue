<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { storeToRefs } from "pinia";
import { useRepoStore } from "../stores/repo";
import { useDocsStore } from "../stores/docs";
import { useConfigStore } from "../stores/config";
import { useUiStore } from "../stores/ui";
import { searchAll, type SearchResult } from "../search";

interface Group {
  kind: SearchResult["kind"];
  label: string;
  items: { r: SearchResult; idx: number }[];
}

const router = useRouter();
const repo = useRepoStore();
const docs = useDocsStore();
const config = useConfigStore();
const ui = useUiStore();
const { tasks } = storeToRefs(repo);
const { docs: docList } = storeToRefs(docs);
const { visibleFields } = storeToRefs(config);

const query = ref("");
const open = ref(false);
const highlight = ref(0);
const inputEl = ref<HTMLInputElement | null>(null);

const results = computed(() =>
  searchAll(query.value, { tasks: tasks.value, docs: docList.value, fields: visibleFields.value }),
);

const groups = computed<Group[]>(() => {
  const out: Group[] = [];
  const byKind = new Map<SearchResult["kind"], Group>();
  const labelOf: Record<SearchResult["kind"], string> = {
    task: "Tasks",
    doc: "Context docs",
    setting: "Settings",
  };
  results.value.forEach((r, idx) => {
    let g = byKind.get(r.kind);
    if (!g) {
      g = { kind: r.kind, label: labelOf[r.kind], items: [] };
      byKind.set(r.kind, g);
      out.push(g);
    }
    g.items.push({ r, idx });
  });
  return out;
});

watch(query, () => {
  open.value = query.value.trim().length > 0;
  highlight.value = 0;
});

function openResult(r: SearchResult): void {
  if (r.kind === "task") {
    void ui.openTask(r.task);
  } else if (r.kind === "doc") {
    void docs.loadDoc(r.path);
    void router.push({ name: "repo" });
  } else {
    void router.push({ name: "settings", query: { focus: r.key } });
  }
  open.value = false;
  inputEl.value?.blur();
}

function onKey(e: KeyboardEvent): void {
  const n = results.value.length;
  if (e.key === "ArrowDown" && n) {
    e.preventDefault();
    highlight.value = (highlight.value + 1) % n;
  } else if (e.key === "ArrowUp" && n) {
    e.preventDefault();
    highlight.value = (highlight.value - 1 + n) % n;
  } else if (e.key === "Enter" && n) {
    const r = results.value[highlight.value];
    if (r) openResult(r);
  } else if (e.key === "Escape") {
    open.value = false;
  }
}

function onGlobalKey(e: KeyboardEvent): void {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
    e.preventDefault();
    inputEl.value?.focus();
    inputEl.value?.select();
  }
}

onMounted(() => window.addEventListener("keydown", onGlobalKey));
onBeforeUnmount(() => window.removeEventListener("keydown", onGlobalKey));
</script>

<template>
  <div class="search-wrap" :class="{ open }">
    <div class="search-input">
      <svg class="search-ico" width="13" height="13" viewBox="0 0 24 24" fill="none">
        <circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="2" />
        <path d="M20 20l-3.5-3.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
      </svg>
      <input
        ref="inputEl"
        v-model="query"
        type="text"
        autocomplete="off"
        spellcheck="false"
        placeholder="Search tasks, docs, settings…"
        @focus="open = query.trim().length > 0"
        @keydown="onKey"
        @blur="open = false"
      />
      <kbd>⌘K</kbd>
    </div>

    <div v-if="open" class="search-drop">
      <template v-if="results.length">
        <div v-for="g in groups" :key="g.kind" class="search-group">
          <div class="search-group-label">{{ g.label }}</div>
          <div
            v-for="item in g.items"
            :key="g.kind + item.r.subtitle"
            class="search-row"
            :class="{ hi: item.idx === highlight }"
            @mousedown.prevent
            @click="openResult(item.r)"
          >
            <div class="search-row-title">{{ item.r.title }}</div>
            <div class="search-row-sub">{{ item.r.subtitle }}</div>
          </div>
        </div>
      </template>
      <div v-else class="search-empty">No results</div>
    </div>
  </div>
</template>
