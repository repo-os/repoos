<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { storeToRefs } from "pinia";
import { useRepoStore, statusColor } from "../stores/repo";
import { useDocsStore } from "../stores/docs";
import { useConfigStore } from "../stores/config";
import { useUiStore } from "../stores/ui";
import { searchAll, type SearchResult } from "../search";

interface Group {
  kind: SearchResult["kind"] | "recent";
  label: string;
  items: { r: SearchResult | { kind: "recent"; title: string; subtitle: string }; idx: number }[];
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
const recentSearches = ref<string[]>([]);
const docsWithContent = ref<Map<string, string>>(new Map());

const searchSource = computed(() => ({
  tasks: tasks.value,
  docs: docList.value.map(d => ({
    ...d,
    content: docsWithContent.value.get(d.path),
  })),
  fields: visibleFields.value,
}));

const results = computed(() =>
  searchAll(query.value, searchSource.value),
);

const showRecent = computed(() => query.value.trim().length === 0);

const displayItems = computed(() => {
  if (showRecent.value) {
    return recentSearches.value.map(s => ({
      kind: "recent" as const,
      title: s,
      subtitle: "Recent search",
    }));
  }
  return results.value;
});

const groups = computed<Group[]>(() => {
  const out: Group[] = [];
  const byKind = new Map<string, Group>();
  const labelOf: Record<string, string> = {
    task: "Tasks",
    doc: "Context docs",
    setting: "Settings",
    recent: "Recent",
  };
  displayItems.value.forEach((r, idx) => {
    const kind = "kind" in r ? r.kind : "unknown";
    let g = byKind.get(kind);
    if (!g) {
      g = { kind: kind as any, label: labelOf[kind] || kind, items: [] };
      byKind.set(kind, g);
      out.push(g);
    }
    g.items.push({ r: r as SearchResult, idx });
  });
  return out;
});

watch(query, () => {
  open.value = query.value.trim().length > 0 || recentSearches.value.length > 0;
  highlight.value = 0;
});

async function loadDocContents(): Promise<void> {
  // Client-side doc-content fetch: optimized for small to medium doc sets (currently ~30 docs).
  // Pros: instant search without server latency, works offline, simple implementation.
  // Cons: scales poorly beyond ~500 docs; for large repos, use server-side search indexing
  // (full-text index + API endpoint) to avoid loading all content at once.
  for (const d of docList.value) {
    if (!docsWithContent.value.has(d.path)) {
      try {
        const r = await fetch(d.path);
        if (r.ok) {
          const text = await r.text();
          docsWithContent.value.set(d.path, text);
        } else {
          console.warn(`Failed to load doc ${d.path}: HTTP ${r.status}`);
        }
      } catch (e) {
        console.warn(`Failed to load doc ${d.path}:`, e instanceof Error ? e.message : String(e));
      }
    }
  }
}

function addRecentSearch(q: string): void {
  const trimmed = q.trim();
  if (!trimmed) return;
  recentSearches.value = [trimmed, ...recentSearches.value.filter(s => s !== trimmed)].slice(0, 5);
}

function openResult(r: SearchResult): void {
  if (r.kind === "task") {
    addRecentSearch(query.value);
    void ui.openTask(r.task);
  } else if (r.kind === "doc") {
    addRecentSearch(query.value);
    void docs.loadDoc(r.path);
    void router.push({ name: "repo" });
  } else if (r.kind === "setting") {
    addRecentSearch(query.value);
    void router.push({ name: "settings", query: { focus: r.key } });
  }
  open.value = false;
  inputEl.value?.blur();
}

function openRecentSearch(q: string): void {
  query.value = q;
  open.value = true;
  inputEl.value?.focus();
}

function handleRowClick(item: any): void {
  if (item.kind === "recent") {
    openRecentSearch(item.title);
  } else {
    openResult(item);
  }
}

function onKey(e: KeyboardEvent): void {
  const n = displayItems.value.length;
  if (e.key === "ArrowDown" && n) {
    e.preventDefault();
    highlight.value = (highlight.value + 1) % n;
  } else if (e.key === "ArrowUp" && n) {
    e.preventDefault();
    highlight.value = (highlight.value - 1 + n) % n;
  } else if (e.key === "Enter" && n) {
    const item = displayItems.value[highlight.value];
    if (item) {
      if ("kind" in item && item.kind === "recent") {
        openRecentSearch(item.title);
      } else {
        openResult(item as SearchResult);
      }
    }
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

onMounted(() => {
  window.addEventListener("keydown", onGlobalKey);
  loadDocContents();
});
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
        @focus="open = query.trim().length > 0 || recentSearches.length > 0"
        @keydown="onKey"
        @blur="open = false"
      />
      <kbd>⌘K</kbd>
    </div>

    <div v-if="open" class="search-drop">
      <template v-if="displayItems.length">
        <div v-for="g in groups" :key="g.kind" class="search-group">
          <div class="search-group-label">{{ g.label }}</div>
          <div
            v-for="item in g.items"
            :key="(g.kind === 'recent' ? 'recent-' : g.kind + '-') + item.r.title"
            class="search-row"
            :class="{ hi: item.idx === highlight }"
            @mousedown.prevent
            @click="handleRowClick(item.r as any)"
          >
            <div class="search-row-content">
              <template v-if="(g.kind as string) === 'task'">
                <span class="cdot" :style="{ backgroundColor: statusColor((item.r as any).task.status) }"></span>
              </template>
              <div class="search-row-text">
                <div class="search-row-title">{{ item.r.title }}</div>
                <div class="search-row-sub">{{ item.r.subtitle }}</div>
                <div v-if="(item.r as any).snippet" class="search-row-snippet">
                  <template v-if="(item.r as any).snippet && typeof (item.r as any).snippet === 'object' && 'html' in (item.r as any).snippet">
                    <span v-html="(item.r as any).snippet.html"></span>
                  </template>
                  <template v-else>
                    {{ (item.r as any).snippet }}
                  </template>
                </div>
              </div>
            </div>
          </div>
        </div>
      </template>
      <div v-else class="search-empty">No results</div>
    </div>
  </div>
</template>
