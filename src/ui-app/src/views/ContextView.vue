<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from "vue";
import { storeToRefs } from "pinia";
import { useRoute } from "vue-router";
import { useDocsStore } from "../stores/docs";
import { useUiStore } from "../stores/ui";
import { renderMarkdown } from "../lib/markdown";
import { renderMermaidDiagrams } from "../lib/mermaid";
import { buildDocTree, flattenDocTree } from "../lib/docTree";
import { api, JSON_OPTS } from "../api";
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
interface RegistrySkill {
  id: string;
  slug: string;
  name: string;
  source: string;
  installs: number;
  url: string;
  isDuplicate?: boolean;
}
interface RegistryDetail {
  id: string;
  slug: string;
  source: string;
  installs: number;
  hash: string | null;
  files: Array<{ path: string; contents: string }> | null;
}
const registrySkills = ref<RegistrySkill[]>([]);
const registryLoading = ref(false);
const registryError = ref("");
const selectedCatalogSkill = ref<RegistryDetail | null>(null);
const selectedAudit = ref<{
  audits: Array<{ provider: string; status: string; summary: string }>;
} | null>(null);
const filesReviewed = ref(false);
const installing = ref(false);
const installedNames = computed(() => new Set(skills.value.map((skill) => skill.name)));

async function loadRegistry(): Promise<void> {
  registryLoading.value = true;
  registryError.value = "";
  try {
    const path =
      skillQuery.value.trim().length >= 2
        ? `/api/skill-registry/search?q=${encodeURIComponent(skillQuery.value.trim())}`
        : "/api/skill-registry/curated";
    registrySkills.value = (await api<{ skills: RegistrySkill[] }>(path)).skills;
  } catch (error) {
    registryError.value = error instanceof Error ? error.message : "Skills.sh is unavailable";
  } finally {
    registryLoading.value = false;
  }
}

async function selectCatalogSkill(skill: RegistrySkill): Promise<void> {
  try {
    const data = await api<{ detail: RegistryDetail; audit: typeof selectedAudit.value }>(
      `/api/skill-registry/detail?id=${encodeURIComponent(skill.id)}`,
    );
    selectedCatalogSkill.value = data.detail;
    selectedAudit.value = data.audit;
    filesReviewed.value = false;
  } catch (error) {
    registryError.value = error instanceof Error ? error.message : "Could not load skill details";
  }
}

async function installSelectedSkill(): Promise<void> {
  if (!selectedCatalogSkill.value || installing.value) return;
  installing.value = true;
  registryError.value = "";
  try {
    await api(
      "/api/skill-registry/install",
      JSON_OPTS("POST", { id: selectedCatalogSkill.value.id }),
    );
    await docs.loadSkills();
  } catch (error) {
    registryError.value = error instanceof Error ? error.message : "Could not install skill";
  } finally {
    installing.value = false;
  }
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
watch(tab, (next) => {
  if (next === "discover" && !registrySkills.value.length) void loadRegistry();
});
let registrySearchTimer: ReturnType<typeof setTimeout> | undefined;
watch(skillQuery, () => {
  clearTimeout(registrySearchTimer);
  registrySearchTimer = setTimeout(() => void loadRegistry(), 250);
});

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
            <strong>Skills.sh curated catalog</strong>
            <span>Inspect files and audits before installing into this project.</span>
            <input v-model="skillQuery" class="ctx-skill-search" placeholder="Search skills" />
          </div>
          <div v-if="registryError" class="ctx-refresh-error">{{ registryError }}</div>
          <div v-else-if="registryLoading" class="ctx-empty">Loading Skills.sh…</div>
          <button
            v-for="skill in registrySkills"
            :key="skill.id"
            type="button"
            class="skill-row ctx-catalog-skill"
            :class="{ sel: selectedCatalogSkill?.id === skill.id }"
            @click="selectCatalogSkill(skill)"
          >
            <span class="skill-name">{{ skill.name }}</span>
            <span class="ctx-skill-meta"
              >{{ skill.source }} · {{ skill.installs.toLocaleString() }} installs</span
            >
            <span v-if="installedNames.has(skill.slug)" class="ctx-installed">Installed</span>
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
            <div class="doc-title">{{ selectedCatalogSkill.slug }}</div>
            <div class="ctx-detail-meta">
              {{ selectedCatalogSkill.source }} ·
              {{ selectedCatalogSkill.installs.toLocaleString() }} installs ·
              {{ selectedCatalogSkill.hash ?? "unhashed" }}
            </div>
            <div class="ctx-detail-copy">
              {{ selectedCatalogSkill.files?.length ?? 0 }} files will be copied into
              <code>skills/{{ selectedCatalogSkill.slug }}/</code> and locked in
              <code>skills.lock.json</code>.
            </div>
            <div v-if="selectedAudit?.audits?.length" class="ctx-detail-copy">
              <strong>Security audits</strong><br /><span
                v-for="audit in selectedAudit.audits"
                :key="audit.provider"
                >{{ audit.provider }}: {{ audit.status }} — {{ audit.summary }}<br
              /></span>
            </div>
            <details class="ctx-detail-copy">
              <summary>Review files before installing</summary>
              <pre
                v-for="file in selectedCatalogSkill.files"
                :key="file.path"
              ><strong>{{ file.path }}</strong>\n{{ file.contents }}</pre>
            </details>
            <label v-if="!installedNames.has(selectedCatalogSkill.slug)" class="ctx-review-check">
              <input v-model="filesReviewed" type="checkbox" />
              I reviewed these files and want to add this skill to the project.
            </label>
            <div class="ctx-detail-actions">
              <Button
                v-if="installedNames.has(selectedCatalogSkill.slug)"
                variant="accent"
                @click="openInstalledSkill(selectedCatalogSkill.slug)"
                >Open installed skill</Button
              >
              <Button
                v-else
                variant="accent"
                :disabled="installing || !filesReviewed"
                @click="installSelectedSkill"
                >{{ installing ? "Installing…" : "Install to project" }}</Button
              >
            </div>
          </template>
          <template v-else>
            <div class="doc-title">Discover skills</div>
            <div class="skill-desc-line">
              Select a skill to inspect its exact files, content hash, publisher, and security audit
              before installing it.
            </div>
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

.ctx-discover-head {
  display: grid;
  gap: 5px;
  padding: 12px;
  color: var(--txt-muted);
  font-size: 12px;
}
.ctx-discover-head strong {
  color: var(--txt);
  font-size: 13px;
}
.ctx-skill-search {
  width: 100%;
  margin-top: 5px;
  padding: 7px 9px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg);
  color: var(--txt);
}
.ctx-skill-meta {
  color: var(--txt-faint);
  font-size: 11px;
}
.ctx-installed {
  color: var(--green);
  font-size: 11px;
  font-weight: 700;
}
.ctx-catalog-skill {
  width: 100%;
  text-align: left;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
}
.ctx-detail-meta {
  color: var(--txt-muted);
  font-size: 12px;
  margin-top: 10px;
}
.ctx-detail-copy {
  color: var(--txt-muted);
  line-height: 1.55;
  margin-top: 18px;
  max-width: 54ch;
}
.ctx-detail-actions {
  display: flex;
  gap: 8px;
  margin-top: 20px;
}

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
