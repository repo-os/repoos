<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { storeToRefs } from "pinia";
import { useRepoStore, statusColor } from "../stores/repo";
import { useDocsStore } from "../stores/docs";
import { useConfigStore } from "../stores/config";
import { useUiStore } from "../stores/ui";
import { searchAll, searchSettings, searchContext, type SearchResult } from "../search";
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
const { docs: docList, skills: skillList } = storeToRefs(docs);
const { searchableFields } = storeToRefs(config);
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

const contextSearchSource = computed(() => ({
  docs: docList.value.map((d) => ({
    ...d,
    content: docsWithContent.value.get(d.path),
  })),
  skills: skillList.value.map((s) => ({
    ...s,
    content: docsWithContent.value.get(s.path),
  })),
}));

const contextSearchOutput = computed(() => searchContext(query.value, contextSearchSource.value));

const results = computed(() => {
  if (props.scope === "settings") {
    return searchSettings(query.value, {
      fields: searchableFields.value,
      location: settingLocation.value,
    });
  }
  if (props.scope === "context") {
    return contextSearchOutput.value.results;
  }
  return searchAll(query.value, searchSource.value);
});

const showRecent = computed(() => query.value.trim().length === 0);

const contextTruncated = computed(
  () =>
    props.scope === "context" &&
    !showRecent.value &&
    contextSearchOutput.value.totalMatches > contextSearchOutput.value.results.length,
);

const contextTruncatedCount = computed(() =>
  Math.max(0, contextSearchOutput.value.totalMatches - contextSearchOutput.value.results.length),
);

const displayItems = computed(() => {
  if (showRecent.value) {
    if (recentSearches.value.length) {
      return recentSearches.value.map((s) => ({
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
    if (props.scope === "context") {
      return [
        {
          kind: "hint" as const,
          title: "Search context docs and installed skills",
          subtitle: "↑↓ to browse · Enter to open · Esc to close",
        },
      ];
    }
    return [];
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
  if ((props.scope === "settings" || props.scope === "context") && !showRecent.value) {
    return [
      {
        kind: props.scope === "settings" ? "setting" : "doc",
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
  if (props.scope === "context") {
    return `No context docs or skills match “${query.value.trim()}”`;
  }
  return "No results";
});

const placeholder = computed(() => {
  if (props.scope === "settings") return "Search settings by name or key…";
  if (props.scope === "context") return "Search docs and skills…";
  return "Search tasks, docs, settings…";
});

const ariaLabel = computed(() => {
  if (props.scope === "settings") return "Search settings";
  if (props.scope === "context") return "Search context docs and skills";
  return "Search tasks, docs, and settings";
});

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) {
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

function closeOverlay(): void {
  emit("update:open", false);
  query.value = "";
  const el = props.returnFocusEl;
  if (el) {
    setTimeout(() => el.focus(), 0);
  }
}

function openResult(r: SearchResult): void {
  if (r.kind === "task") {
    addRecentSearch(query.value);
    void ui.openTask(r.task);
  } else if (r.kind === "doc") {
    addRecentSearch(query.value);
    if (props.scope === "context") {
      void router.push({ name: "repo", query: { doc: r.path } });
    } else {
      void docs.loadDoc(r.path);
      void router.push({ name: "repo" });
    }
  } else if (r.kind === "skill") {
    addRecentSearch(query.value);
    void router.push({ name: "repo", query: { tab: "skills" } });
    void docs.loadSkill(r.path);
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
  } else if (e.key === "Enter" && n) {
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
  const paths =
    props.scope === "context"
      ? [...docList.value.map((d) => d.path), ...skillList.value.map((s) => s.path)]
      : docList.value.map((d) => d.path);
  for (const path of paths) {
    if (!docsWithContent.value.has(path)) {
      try {
        const r = await fetch(path);
        if (r.ok) {
          const text = await r.text();
          docsWithContent.value.set(path, text);
        }
      } catch {
        /* search degrades to title/path only */
      }
    }
  }
}

watch(
  [docList, skillList],
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
          <div v-if="contextTruncated" class="search-truncated">
            and {{ contextTruncatedCount }} more — narrow your search
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>
