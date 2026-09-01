<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from "vue";
import { storeToRefs } from "pinia";
import { useRoute } from "vue-router";
import { useDocsStore } from "../stores/docs";
import { useUiStore } from "../stores/ui";
import { renderMarkdown } from "../lib/markdown";
import { renderMermaidDiagrams } from "../lib/mermaid";
import { buildDocTree, flattenDocTree } from "../lib/docTree";
import Button from "../components/ui/button.vue";
import Card from "../components/ui/card.vue";
import NewDocPanel from "../components/NewDocPanel.vue";
import NewSkillPanel from "../components/NewSkillPanel.vue";
import { RotateCcw, ChevronDown, ChevronRight, File } from "lucide-vue-next";

const docs = useDocsStore();
const ui = useUiStore();
const {
  docs: docList,
  selDoc,
  docContent,
  docTitle,
  skills,
  selSkill,
  skillContent,
  skillName,
  skillDesc,
} = storeToRefs(docs);

type ContextTab = "docs" | "skills" | "discover";
const tab = ref<ContextTab>("docs");
const skillQuery = ref("");
const starterCatalog = [
  ["frontend-design", "Frontend", "Distinctive production UI implementation", "Anthropic"],
  ["code-review", "Quality", "Review changes before sign-off", "RepoOS"],
  ["test-and-verify", "Quality", "Targeted and end-to-end validation", "RepoOS catalog"],
  ["debug-and-reproduce", "Quality", "Reproduce failures before fixing them", "RepoOS catalog"],
  ["dependency-upgrade", "Maintenance", "Safe package and runtime upgrades", "RepoOS catalog"],
  ["api-contracts", "Backend", "Versioned API and schema changes", "RepoOS catalog"],
  ["database-migrations", "Backend", "Safe schema and data migrations", "RepoOS catalog"],
  ["security-review", "Security", "Auth, secrets, and trust boundaries", "RepoOS catalog"],
  ["ui-accessibility", "Frontend", "Keyboard, screen-reader, and motion checks", "RepoOS catalog"],
  ["performance-investigation", "Quality", "Measure and improve slow paths", "RepoOS catalog"],
  ["ci-and-release", "Delivery", "CI, packaging, and release procedures", "RepoOS catalog"],
  ["observability", "Operations", "Logs, metrics, and tracing conventions", "RepoOS catalog"],
] as const;
type CatalogSkill = (typeof starterCatalog)[number];
const selectedCatalogSkill = ref<CatalogSkill | null>(null);
const visibleCatalog = computed(() => {
  const q = skillQuery.value.trim().toLowerCase();
  return !q ? starterCatalog : starterCatalog.filter((skill) => skill.join(" ").toLowerCase().includes(q));
});
const installedNames = computed(() => new Set(skills.value.map((skill) => skill.name)));

function selectCatalogSkill(skill: CatalogSkill): void {
  selectedCatalogSkill.value = skill;
}

function openInstalledSkill(name: string): void {
  const installed = skills.value.find((skill) => skill.name === name);
  if (!installed) return;
  tab.value = "skills";
  void docs.loadSkill(installed.path);
}
const expandedNodes = ref<Set<string>>(new Set());
const refreshing = ref(false);
const refreshError = ref("");
const markdownRoot = ref<HTMLElement | null>(null);

/** Markdown files get the same rendered presentation as the tasks panel. */
const isMarkdown = (path: string | null): boolean => !!path && /\.md$/i.test(path);

const docHtml = computed(() => renderMarkdown(docContent.value));
const skillHtml = computed(() => renderMarkdown(skillContent.value));

async function renderCurrentDiagrams(): Promise<void> {
  await nextTick();
  if (markdownRoot.value) await renderMermaidDiagrams(markdownRoot.value);
}

watch([docContent, skillContent, tab], () => void renderCurrentDiagrams(), { flush: "post" });
onMounted(() => void renderCurrentDiagrams());

/** The doc list shaped as a tree, then flattened to the rows to render. */
const flatDocTree = computed(() =>
  flattenDocTree(buildDocTree(docList.value), expandedNodes.value),
);

function toggleNode(key: string): void {
  if (expandedNodes.value.has(key)) {
    expandedNodes.value.delete(key);
  } else {
    expandedNodes.value.add(key);
  }
}

/** Indent rows by nesting depth (dirs and files share a base of 8px). */
function rowStyle(depth: number): { paddingLeft: string } {
  return { paddingLeft: `${8 + depth * 16}px` };
}

async function refreshDocs(): Promise<void> {
  refreshing.value = true;
  refreshError.value = "";
  try {
    const ok = await docs.loadDocs();
    if (!ok) {
      refreshError.value = "Could not refresh docs.";
    } else if (selDoc.value && !docList.value.some((d) => d.path === selDoc.value)) {
      // The selected doc vanished on refresh — fall back rather than showing stale content.
      if (docList.value.length) {
        void docs.loadDoc(docList.value[0].path);
      } else {
        selDoc.value = null;
        docContent.value = "";
      }
    }
  } finally {
    refreshing.value = false;
  }
}

// Preselect a doc from the URL (?doc=docs/foo.md) — e.g. the Agents page's
// "Model pricing & use cases" link opens /repo?doc=docs/opencode-models.md.
const route = useRoute();
watch(
  docList,
  (list) => {
    const target = typeof route.query.doc === "string" ? route.query.doc : null;
    if (target && list.some((d) => d.path === target) && selDoc.value !== target) {
      void docs.loadDoc(target);
    }
  },
  { immediate: true },
);
</script>

<template>
  <div class="ctx-page">
    <div
      style="
        display: flex;
        align-items: flex-end;
        justify-content: space-between;
        margin-bottom: 20px;
      "
    >
      <div>
        <div class="page-title">Repo Context</div>
        <div class="page-desc" style="margin: 3px 0 0">AI-readable docs · ADRs · skills</div>
      </div>
      <Button
        variant="accent"
        class="new-btn"
        @click="tab === 'docs' ? ui.openNewDoc() : ui.openNewSkill()"
      >
        <svg viewBox="0 0 24 24" fill="none">
          <path
            d="M12 5v14M5 12h14"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
          />
        </svg>
        {{ tab === "docs" ? "New doc" : "New skill" }}
      </Button>
    </div>

    <div class="ctx-tabs">
      <button class="ctx-tab" :class="{ on: tab === 'docs' }" @click="tab = 'docs'">Docs</button>
      <button class="ctx-tab" :class="{ on: tab === 'skills' }" @click="tab = 'skills'">
        Skills
      </button>
      <button class="ctx-tab" :class="{ on: tab === 'discover' }" @click="tab = 'discover'">
        Discover
      </button>
      <Button
        v-if="tab === 'docs'"
        variant="ghost"
        size="sm"
        class="ctx-refresh-btn"
        :disabled="refreshing"
        title="Refresh documentation"
        @click="refreshDocs"
      >
        <RotateCcw class="size-4" :class="{ refreshing: refreshing }" />
      </Button>
    </div>

    <div class="repo-grid">
      <Card class="doc-list">
        <template v-if="tab === 'docs'">
          <div v-if="!docList.length" class="ctx-empty">No docs found.</div>
          <div v-else class="doc-tree">
            <div v-if="refreshError" class="ctx-refresh-error">{{ refreshError }}</div>
            <template v-for="node in flatDocTree" :key="node.key">
              <div
                v-if="node.isFile"
                class="tree-item tree-file"
                :class="{ sel: selDoc === node.path }"
                :style="rowStyle(node.depth)"
                @click="docs.loadDoc(node.path!)"
              >
                <File class="size-4" />
                <span>{{ node.name }}</span>
              </div>
              <div
                v-else
                class="tree-item tree-dir"
                :style="rowStyle(node.depth)"
                @click="toggleNode(node.key)"
              >
                <ChevronDown v-if="expandedNodes.has(node.key)" class="size-4 chevron" />
                <ChevronRight v-else class="size-4 chevron" />
                <span class="dir-name">{{ node.name }}</span>
              </div>
            </template>
          </div>
        </template>

        <template v-else-if="tab === 'skills'">
          <div v-if="!skills.length" class="ctx-empty">
            No skills yet — add a <code>skills/&lt;name&gt;/SKILL.md</code>.
          </div>
          <div
            v-for="s in skills"
            :key="s.path"
            class="skill-row"
            :class="{ sel: selSkill === s.path }"
            @click="docs.loadSkill(s.path)"
          >
            <span class="skill-name">
              <svg viewBox="0 0 24 24" fill="none">
                <path
                  d="M13 2L4.5 13.5H11L9.5 22 19.5 10H13L13 2z"
                  stroke="currentColor"
                  stroke-width="1.8"
                  stroke-linejoin="round"
                />
              </svg>
              {{ s.name }}
            </span>
            <span v-if="s.description" class="skill-desc">{{ s.description }}</span>
          </div>
        </template>
        <template v-else>
          <div class="ctx-discover-head">
            <strong>Curated starter skills</strong>
            <span>Recommendations, not a popularity ranking.</span>
            <input v-model="skillQuery" class="ctx-skill-search" placeholder="Search skills" />
          </div>
          <button
            v-for="skill in visibleCatalog"
            :key="skill[0]"
            type="button"
            class="skill-row ctx-catalog-skill"
            :class="{ sel: selectedCatalogSkill?.[0] === skill[0] }"
            @click="selectCatalogSkill(skill)"
          >
            <span class="skill-name">{{ skill[0] }}</span>
            <span class="skill-desc">{{ skill[2] }}</span>
            <span class="ctx-skill-meta">{{ skill[1] }} · {{ skill[3] }}</span>
            <span v-if="installedNames.has(skill[0])" class="ctx-installed">Installed</span>
          </button>
        </template>
      </Card>

      <Card class="doc-view">
        <template v-if="tab === 'docs'">
          <div v-if="docContent">
            <div class="doc-title">{{ docTitle }}</div>
            <div class="doc-path">{{ selDoc }}</div>
            <div
              ref="markdownRoot"
              v-if="isMarkdown(selDoc)"
              class="md-rendered"
              v-html="docHtml"
            ></div>
            <template v-else>{{ docContent }}</template>
          </div>
          <div v-else style="color: var(--txt-faint)">Select a document.</div>
        </template>

        <template v-else-if="tab === 'skills'">
          <div v-if="skillContent">
            <div class="doc-title">{{ skillName }}</div>
            <div class="doc-path">{{ selSkill }}</div>
            <div v-if="skillDesc" class="skill-desc-line">{{ skillDesc }}</div>
            <div
              ref="markdownRoot"
              v-if="isMarkdown(selSkill)"
              class="md-rendered"
              v-html="skillHtml"
            ></div>
            <template v-else>{{ skillContent }}</template>
          </div>
          <div v-else style="color: var(--txt-faint)">Select a skill.</div>
        </template>
        <template v-else>
          <template v-if="selectedCatalogSkill">
            <div class="doc-title">{{ selectedCatalogSkill[0] }}</div>
            <div class="skill-desc-line">{{ selectedCatalogSkill[2] }}</div>
            <div class="ctx-detail-meta">{{ selectedCatalogSkill[1] }} · {{ selectedCatalogSkill[3] }}</div>
            <div v-if="installedNames.has(selectedCatalogSkill[0])" class="ctx-detail-copy">
              This skill is installed in this repository and can be assigned to an agent on the Agents page.
            </div>
            <div v-else class="ctx-detail-copy">
              This is a curated recommendation, not a remotely installable package yet. Create a project-owned skill when you choose its source and procedure.
            </div>
            <div class="ctx-detail-actions">
              <Button
                v-if="installedNames.has(selectedCatalogSkill[0])"
                variant="accent"
                @click="openInstalledSkill(selectedCatalogSkill[0])"
              >Open installed skill</Button>
              <Button v-else variant="outline" @click="ui.openNewSkill()">Create project skill</Button>
            </div>
          </template>
          <template v-else>
            <div class="doc-title">Discover skills</div>
            <div class="skill-desc-line">Select a skill to see whether it is installed and what action is available. The catalog is curated, not a popularity ranking.</div>
          </template>
        </template>
      </Card>
    </div>

    <NewDocPanel />
    <NewSkillPanel />
  </div>
</template>

<style scoped>
.ctx-refresh-btn {
  margin-left: auto;
}

.ctx-discover-head { display: grid; gap: 5px; padding: 12px; color: var(--txt-muted); font-size: 12px; }
.ctx-discover-head strong { color: var(--txt); font-size: 13px; }
.ctx-skill-search { width: 100%; margin-top: 5px; padding: 7px 9px; border: 1px solid var(--border); border-radius: 6px; background: var(--bg); color: var(--txt); }
.ctx-skill-meta { color: var(--txt-faint); font-size: 11px; }
.ctx-installed { color: var(--green); font-size: 11px; font-weight: 700; }
.ctx-catalog-skill { width: 100%; text-align: left; border: 0; background: transparent; color: inherit; font: inherit; }
.ctx-detail-meta { color: var(--txt-muted); font-size: 12px; margin-top: 10px; }
.ctx-detail-copy { color: var(--txt-muted); line-height: 1.55; margin-top: 18px; max-width: 54ch; }
.ctx-detail-actions { display: flex; gap: 8px; margin-top: 20px; }

.ctx-refresh-btn :deep(svg) {
  transition: transform 200ms ease;
}

.ctx-refresh-btn :deep(svg.refreshing) {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.doc-tree {
  padding: 8px 0;
}

.tree-item {
  user-select: none;
}

.tree-dir,
.tree-file {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  cursor: pointer;
  border-radius: 4px;
  font-size: 13px;
  transition: background-color 150ms ease;
}

.tree-dir:hover,
.tree-file:hover {
  background-color: var(--bg-overlay);
}

.tree-file.sel {
  background-color: var(--bg-accent-soft);
  font-weight: 500;
}

.dir-name {
  font-weight: 500;
  color: var(--txt-primary);
}

.chevron {
  flex-shrink: 0;
  color: var(--txt-secondary);
  transition: transform 150ms ease;
}

.ctx-refresh-error {
  margin: 4px 8px 8px;
  padding: 8px 12px;
  border-radius: 8px;
  background: var(--red-tint);
  border: 1px solid var(--red-border-tint);
  color: var(--txt);
  font-size: 12px;
}
</style>
