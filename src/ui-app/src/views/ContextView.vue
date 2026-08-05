<script setup lang="ts">
import { storeToRefs } from "pinia";
import { useDocsStore } from "../stores/docs";
import Card from "../components/ui/card.vue";

const docs = useDocsStore();
const { docs: docList, selDoc, docContent, docTitle } = storeToRefs(docs);
</script>

<template>
  <div>
    <div class="page-title">Repo Context</div>
    <div class="page-desc">AI-readable docs · ADRs · agent instructions</div>
    <div class="repo-grid">
      <Card class="doc-list">
        <div v-if="!docList.length" style="padding: 20px; font-size: 12px; color: var(--txt-faint)">
          No docs found.
        </div>
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
      </Card>
      <Card class="doc-view">
        <div v-if="docContent">
          <div class="doc-title">{{ docTitle }}</div>
          <div class="doc-path">{{ selDoc }}</div>
          {{ docContent }}
        </div>
        <div v-else style="color: var(--txt-faint)">Select a document.</div>
      </Card>
    </div>
  </div>
</template>
