<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { storeToRefs } from "pinia";
import { useRepoStore, statusColor } from "../stores/repo";
import { useDocsStore } from "../stores/docs";
import { useConfigStore } from "../stores/config";
import { useUiStore } from "../stores/ui";
import { searchAll, searchSettings, type SearchResult } from "../search";
import type { SettingsTabId } from "../settings-location";
import { useRecentSearches, type RecentSearchScope } from "../composables/use-recent-searches";

export type SearchScope = RecentSearchScope;

const props = withDefaults(
  defineProps<{
    open: boolean;
    scope: SearchScope;
    /** Element to focus when the overlay closes (Escape or backdrop). */
    returnFocusEl?: HTMLElement | null;
  }>(),
  {
    returnFocusEl: null,
  },
);

const emit = defineEmits<{
  "update:open": [value: boolean];
}>();

const router = useRouter();
const repo = useRepoStore();
const docs = useDocsStore();
const config = useConfigStore();
const ui = useUiStore();
const { tasks } = storeToRefs(repo);
const { docs: docList } = storeToRefs(docs);
const { searchableFields, schema: configSchema } = storeToRefs(config);
const { recentSearches, addRecentSearch } = useRecentSearches(props.scope);

const query = ref("");
const highlight = ref(0);
const inputEl = ref<HTMLInputElement | null>(null);
const overlayEl = ref<HTMLElement | null>(null);
const docsWithContent = ref<Map<string, string>>(new Map());

const settingLocation = computed(() => ({
  inspectorAvailable: repo.health?.copyInspectorAvailable === true,
}));

const searchSource = computed(() => ({
  tasks: tasks.value,
  docs: docList.value.map((d) => ({
    ...d,
    content: docsWithContent.value.get(d.path),
  })),
  fields: searchableFields.value,
  settingLocation: settingLocation.value,
}));

const settingsSearchFields = computed(() =>
  props.scope === "settings" ? configSchema.value : searchableFields.value,
);

const results = computed(() => {
  if (props.scope === "settings") {
    return searchSettings(query.value, {
      fields: settingsSearchFields.value,
      location: settingLocation.value,
    });
  }
  return searchAll(query.value, searchSource.value);
});

const showRecent = computed(() => query.value.trim().length === 0);

const settingsRecentQueries = computed(() =>
  recentSearches.value.filter(
    (s) =>
      searchSettings(s, {
        fields: settingsSearchFields.value,
        location: settingLocation.value,
      }).length > 0,
  ),
);

const displayItems = computed(() => {
  if (showRecent.value) {
    const recents = props.scope === "settings" ? settingsRecentQueries.value : recentSearches.value;
    if (recents.length) {
      return recents.map((s) => ({
        kind: "recent" as const,
        title: s,
        subtitle: "Recent search",
      }));
    }
    if (props.scope === "settings") {
      return [
        {
          kind: "hint" as const,
          title: "Search settings by name or config key",
          subtitle: "↑↓ to browse · Enter to open · Esc to close",
        },
      ];
    }
    return [
      {
        kind: "hint" as const,
        title: "Search tasks, docs, and settings",
        subtitle: "↑↓ to browse · Enter to open · Esc to close",
      },
    ];
  }
  return results.value;
});

interface Group {
  kind: SearchResult["kind"] | "recent" | "hint";
  label: string;
  items: {
    r: SearchResult | { kind: "recent" | "hint"; title: string; subtitle: string };
    idx: number;
  }[];
}

const groups = computed<Group[]>(() => {
  if (props.scope === "settings" && !showRecent.value) {
    return [
      {
        kind: "setting",
        label: "",
        items: displayItems.value.map((r, idx) => ({ r: r as SearchResult, idx })),
      },
    ];
  }
  const out: Group[] = [];
  const byKind = new Map<string, Group>();
  const labelOf: Record<string, string> = {
    task: "Tasks",
    doc: "Context docs",
    setting: "Settings",
    recent: "Recent",
    hint: "",
  };
  displayItems.value.forEach((r, idx) => {
    const kind = "kind" in r ? r.kind : "unknown";
    let g = byKind.get(kind);
    if (!g) {
      g = { kind: kind as Group["kind"], label: labelOf[kind] || kind, items: [] };
      byKind.set(kind, g);
      out.push(g);
    }
    g.items.push({ r: r as SearchResult, idx });
  });
  return out;
});

const emptyMessage = computed(() => {
  if (showRecent.value || displayItems.value.length) return "";
  if (props.scope === "settings") {
    return `No settings match “${query.value.trim()}”`;
  }
  return "No results";
});

const placeholder = computed(() =>
  props.scope === "settings" ? "Search settings by name or key…" : "Search tasks, docs, settings…",
);

const ariaLabel = computed(() =>
  props.scope === "settings" ? "Search settings" : "Search tasks, docs, and settings",
);

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) {
      overlayClosing = false;
      query.value = "";
      highlight.value = 0;
      setTimeout(() => inputEl.value?.focus(), 0);
    }
  },
);

watch(query, () => {
  highlight.value = 0;
});

async function navigateToSetting(
  tab: SettingsTabId,
  key: string,
  tomlOnly: boolean,
): Promise<void> {
  const query = tomlOnly ? { tab: "toml" as const, focus: key } : { tab, focus: key };
  const cur = router.currentRoute.value;
  const curTab = typeof cur.query.tab === "string" ? cur.query.tab : "general";
  const curFocus = (cur.query.focus ?? cur.query.setting) as string | undefined;
  if (cur.name === "settings" && curFocus === key && curTab === query.tab) {
    await router.replace({ name: "settings", query: { tab: query.tab } });
  }
  await router.push({ name: "settings", query });
}

let overlayClosing = false;

function closeOverlay(): void {
  overlayClosing = true;
  emit("update:open", false);
  query.value = "";
  const el = props.returnFocusEl;
  if (el) {
    setTimeout(() => el.focus(), 0);
  }
  setTimeout(() => {
    overlayClosing = false;
  }, 0);
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
    void navigateToSetting(r.tab, r.key, r.tomlOnly);
  }
  closeOverlay();
}

function openRecentSearch(q: string): void {
  query.value = q;
  inputEl.value?.focus();
}

function handleRowClick(item: { kind: string; title: string }): void {
  if (item.kind === "recent") {
    openRecentSearch(item.title);
  } else if (item.kind === "hint") {
    inputEl.value?.focus();
  } else {
    openResult(item as SearchResult);
  }
}

function focusablesInOverlay(): HTMLElement[] {
  const root = overlayEl.value;
  if (!root) return [];
  return Array.from(
    root.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), [href], select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((el) => !el.hasAttribute("disabled") && el.tabIndex !== -1);
}

function trapTab(e: KeyboardEvent): void {
  const els = focusablesInOverlay();
  if (els.length === 0) return;
  e.preventDefault();
  const active = document.activeElement as HTMLElement | null;
  const idx = active ? els.indexOf(active) : -1;
  if (e.shiftKey) {
    const next = idx <= 0 ? els.length - 1 : idx - 1;
    els[next].focus();
  } else {
    const next = idx === -1 || idx >= els.length - 1 ? 0 : idx + 1;
    els[next].focus();
  }
}

function onKey(e: KeyboardEvent): void {
  if (e.key === "Tab") {
    trapTab(e);
    return;
  }
  const n = displayItems.value.length;
  if (e.key === "ArrowDown" && n) {
    e.preventDefault();
    highlight.value = (highlight.value + 1) % n;
  } else if (e.key === "ArrowUp" && n) {
    e.preventDefault();
    highlight.value = (highlight.value - 1 + n) % n;
  } else if (e.key === "Enter" && n && !overlayClosing) {
    const target = e.target as HTMLElement;
    if (target.classList.contains("search-overlay-close")) return;
    const item = displayItems.value[highlight.value];
    if (item) handleRowClick(item as { kind: string; title: string });
  } else if (e.key === "Escape") {
    e.preventDefault();
    closeOverlay();
  }
}

function handleBackdropClick(e: MouseEvent): void {
  if (e.target === e.currentTarget) {
    closeOverlay();
  }
}

async function loadDocContents(): Promise<void> {
  if (props.scope === "settings") return;
  for (const d of docList.value) {
    if (!docsWithContent.value.has(d.path)) {
      try {
        const r = await fetch(d.path);
        if (r.ok) {
          const text = await r.text();
          docsWithContent.value.set(d.path, text);
        }
      } catch {
        /* doc search degrades to title/path only */
      }
    }
  }
}

watch(
  docList,
  () => {
    void loadDocContents();
  },
  { immediate: true },
);
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="search-overlay-backdrop"
      role="presentation"
      @click="handleBackdropClick"
    >
      <div
        ref="overlayEl"
        class="search-overlay"
        role="dialog"
        aria-modal="true"
        :aria-label="ariaLabel"
        @click.stop
        @keydown="onKey"
      >
        <div class="search-overlay-header">
          <svg class="search-ico" width="20" height="20" viewBox="0 0 24 24" fill="none">
            <circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="2" />
            <path
              d="M20 20l-3.5-3.5"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
            />
          </svg>
          <input
            ref="inputEl"
            v-model="query"
            type="text"
            autocomplete="off"
            spellcheck="false"
            :placeholder="placeholder"
            :aria-label="ariaLabel"
            class="search-overlay-input"
          />
          <button
            class="search-overlay-close"
            type="button"
            @click="closeOverlay"
            @keydown.enter.prevent.stop
            aria-label="Close search"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path
                d="M18 6L6 18M6 6l12 12"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
              />
            </svg>
          </button>
        </div>

        <div class="search-overlay-body">
          <template v-if="displayItems.length">
            <div v-for="g in groups" :key="g.kind" class="search-group">
              <div v-if="g.label" class="search-group-label">{{ g.label }}</div>
              <div
                v-for="item in g.items"
                :key="(g.kind === 'recent' ? 'recent-' : g.kind + '-') + item.r.title"
                class="search-row"
                :class="{
                  hi: item.idx === highlight,
                  'search-row-hint': (item.r as { kind?: string }).kind === 'hint',
                }"
                @mousedown.prevent
                @click="handleRowClick(item.r as { kind: string; title: string })"
              >
                <div class="search-row-content">
                  <template v-if="(g.kind as string) === 'task'">
                    <span
                      class="cdot"
                      :style="{ backgroundColor: statusColor((item.r as any).task.status) }"
                    ></span>
                  </template>
                  <div class="search-row-text">
                    <div class="search-row-title">{{ item.r.title }}</div>
                    <div class="search-row-sub">{{ item.r.subtitle }}</div>
                    <div v-if="(item.r as any).snippet" class="search-row-snippet">
                      <template
                        v-if="
                          (item.r as any).snippet &&
                          typeof (item.r as any).snippet === 'object' &&
                          'html' in (item.r as any).snippet
                        "
                      >
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
          <div v-else-if="emptyMessage" class="search-empty">{{ emptyMessage }}</div>
        </div>
      </div>
    </div>
  </Teleport>
</template>
