<script setup lang="ts">
import { computed, ref } from "vue";
import { storeToRefs } from "pinia";
import { useDocsStore } from "../stores/docs";
import { renderMarkdown } from "../lib/markdown";
import Card from "../components/ui/card.vue";

const docs = useDocsStore();
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

/** Markdown files get the same rendered presentation as the tasks panel. */
const isMarkdown = (path: string | null): boolean => !!path && /\.md$/i.test(path);

const docHtml = computed(() => renderMarkdown(docContent.value));
const skillHtml = computed(() => renderMarkdown(skillContent.value));
</script>

<template>
  <div class="ctx-page">
    <div class="page-title">Repo Context</div>
    <div class="page-desc">AI-readable docs · ADRs · skills</div>

    <div class="ctx-tabs">
      <button class="ctx-tab" :class="{ on: tab === 'docs' }" @click="tab = 'docs'">Docs</button>
      <button class="ctx-tab" :class="{ on: tab === 'skills' }" @click="tab = 'skills'">Skills</button>
    </div>

    <div class="repo-grid">
      <Card class="doc-list">
        <template v-if="tab === 'docs'">
          <div v-if="!docList.length" class="ctx-empty">No docs found.</div>
          <div
            v-for="d in docList"
            :key="d.path"
            class="doc-row"
            :class="{ sel: selDoc === d.path }"
            @click="docs.loadDoc(d.path)"
          >
            <svg viewBox="0 0 24 24" fill="none">
              <path
                d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z"
                stroke="currentColor"
                stroke-width="1.8"
              />
              <path d="M14 2v6h6" stroke="currentColor" stroke-width="1.8" />
            </svg>
            {{ d.path }}
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
  </div>
</template>
