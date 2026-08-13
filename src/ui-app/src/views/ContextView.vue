<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { storeToRefs } from "pinia";
import { useRoute } from "vue-router";
import { useDocsStore } from "../stores/docs";
import { useUiStore } from "../stores/ui";
import { renderMarkdown } from "../lib/markdown";
import Button from "../components/ui/button.vue";
import Card from "../components/ui/card.vue";
import NewDocPanel from "../components/NewDocPanel.vue";
import { RotateCcw, ChevronDown, ChevronRight, File } from "lucide-vue-next";

interface TreeNode {
  name: string;
  path?: string;
  isFile: boolean;
  children?: TreeNode[];
}

interface TreeNodeBuilder {
  name: string;
  isFile: boolean;
  path?: string;
  children: Record<string, TreeNodeBuilder>;
}

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

const tab = ref<"docs" | "skills">("docs");
const expandedNodes = ref<Set<string>>(new Set());
const refreshing = ref(false);

/** Markdown files get the same rendered presentation as the tasks panel. */
const isMarkdown = (path: string | null): boolean => !!path && /\.md$/i.test(path);

const docHtml = computed(() => renderMarkdown(docContent.value));
const skillHtml = computed(() => renderMarkdown(skillContent.value));

/** Build a tree structure from flat doc paths. */
function buildDocTree(items: { path: string; title: string }[]): TreeNode[] {
  const root: Record<string, TreeNodeBuilder> = {};

  for (const item of items) {
    const parts = item.path.split("/");
    let current = root;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isLast = i === parts.length - 1;

      if (!current[part]) {
        current[part] = {
          name: part,
          isFile: isLast,
          path: isLast ? item.path : undefined,
          children: {},
        };
      }

      if (!isLast) {
        current = current[part].children;
      }
    }
  }

  const buildTree = (obj: Record<string, TreeNodeBuilder>): TreeNode[] => {
    return Object.values(obj).sort((a, b) => {
      if (a.isFile === b.isFile) return a.name.localeCompare(b.name);
      return a.isFile ? 1 : -1;
    }).map((node) => {
      const result: TreeNode = {
        name: node.name,
        isFile: node.isFile,
        path: node.path,
      };
      const childArray = buildTree(node.children);
      if (childArray.length > 0) {
        result.children = childArray;
      }
      return result;
    });
  };

  return buildTree(root);
}

const docTree = computed(() => buildDocTree(docList.value));

function toggleNode(path: string): void {
  if (expandedNodes.value.has(path)) {
    expandedNodes.value.delete(path);
  } else {
    expandedNodes.value.add(path);
  }
}

function getNodePath(node: TreeNode): string {
  return node.path || node.name;
}

async function refreshDocs(): Promise<void> {
  refreshing.value = true;
  try {
    await docs.loadDocs();
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
      <Button variant="accent" class="new-btn" @click="ui.openNewDoc()">
        <svg viewBox="0 0 24 24" fill="none">
          <path
            d="M12 5v14M5 12h14"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
          />
        </svg>
        New doc
      </Button>
    </div>

    <div class="ctx-tabs">
      <button class="ctx-tab" :class="{ on: tab === 'docs' }" @click="tab = 'docs'">Docs</button>
      <button class="ctx-tab" :class="{ on: tab === 'skills' }" @click="tab = 'skills'">Skills</button>
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
            <template v-for="node in docTree" :key="getNodePath(node)">
              <div v-if="node.isFile" class="tree-item tree-file" @click="docs.loadDoc(node.path!)">
                <div class="tree-file-row" :class="{ sel: selDoc === node.path }">
                  <File class="size-4" />
                  <span>{{ node.name }}</span>
                </div>
              </div>
              <div v-else class="tree-item tree-dir">
                <div class="tree-dir-row" @click="toggleNode(node.name)">
                  <ChevronDown v-if="expandedNodes.has(node.name)" class="size-4 chevron" />
                  <ChevronRight v-else class="size-4 chevron" />
                  <span class="dir-name">{{ node.name }}</span>
                </div>
                <template v-if="expandedNodes.has(node.name)">
                  <div class="tree-children">
                    <div
                      v-for="child in node.children"
                      :key="getNodePath(child)"
                      class="tree-item"
                      :class="child.isFile ? 'tree-file' : 'tree-dir'"
                    >
                      <div v-if="child.isFile" class="tree-file-row" :class="{ sel: selDoc === child.path }" @click="docs.loadDoc(child.path!)">
                        <File class="size-4" />
                        <span>{{ child.name }}</span>
                      </div>
                      <div v-else>
                        <div class="tree-dir-row" @click="toggleNode(child.name)">
                          <ChevronDown v-if="expandedNodes.has(child.name)" class="size-4 chevron" />
                          <ChevronRight v-else class="size-4 chevron" />
                          <span class="dir-name">{{ child.name }}</span>
                        </div>
                        <template v-if="expandedNodes.has(child.name)">
                          <div class="tree-children">
                            <div
                              v-for="grandchild in child.children"
                              :key="getNodePath(grandchild)"
                              class="tree-item tree-file"
                              @click="docs.loadDoc(grandchild.path!)"
                            >
                              <div class="tree-file-row" :class="{ sel: selDoc === grandchild.path }">
                                <File class="size-4" />
                                <span>{{ grandchild.name }}</span>
                              </div>
                            </div>
                          </div>
                        </template>
                      </div>
                    </div>
                  </div>
                </template>
              </div>
            </template>
          </div>
        </template>

        <template v-else>
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
      </Card>

      <Card class="doc-view">
        <template v-if="tab === 'docs'">
          <div v-if="docContent">
            <div class="doc-title">{{ docTitle }}</div>
            <div class="doc-path">{{ selDoc }}</div>
            <div v-if="isMarkdown(selDoc)" class="md-rendered" v-html="docHtml"></div>
            <template v-else>{{ docContent }}</template>
          </div>
          <div v-else style="color: var(--txt-faint)">Select a document.</div>
        </template>

        <template v-else>
          <div v-if="skillContent">
            <div class="doc-title">{{ skillName }}</div>
            <div class="doc-path">{{ selSkill }}</div>
            <div v-if="skillDesc" class="skill-desc-line">{{ skillDesc }}</div>
            <div v-if="isMarkdown(selSkill)" class="md-rendered" v-html="skillHtml"></div>
            <template v-else>{{ skillContent }}</template>
          </div>
          <div v-else style="color: var(--txt-faint)">Select a skill.</div>
        </template>
      </Card>
    </div>

    <NewDocPanel />
  </div>
</template>

<style scoped>
.ctx-refresh-btn {
  margin-left: auto;
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

.tree-dir-row,
.tree-file-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  cursor: pointer;
  border-radius: 4px;
  font-size: 13px;
  transition: background-color 150ms ease;
}

.tree-dir-row:hover,
.tree-file-row:hover {
  background-color: var(--bg-overlay);
}

.tree-file-row {
  padding-left: 28px;
}

.tree-file-row.sel {
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

.tree-children {
  margin-left: 8px;
  border-left: 1px solid var(--border-secondary);
  padding-left: 8px;
}
</style>
