<script setup lang="ts">
import { computed, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { ArrowLeft, LoaderCircle, Pause, Play } from "lucide-vue-next";
import { renderMarkdown } from "../lib/markdown";
import { useRepoStore } from "../stores/repo";
import { useUiStore } from "../stores/ui";
import Button from "./ui/button.vue";

const route = useRoute();
const router = useRouter();
const repo = useRepoStore();
const ui = useUiStore();
const busy = ref(false);
const error = ref("");
const task = computed(() => {
  const id = typeof route.query.task === "string" ? route.query.task.replace(/^#/, "") : "";
  return ui.active?.id === id ? ui.active : null;
});
const descriptionHtml = computed(() => (task.value?.body ? renderMarkdown(task.value.body) : ""));
const dateLabel = (value: string | null | undefined) =>
  value ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(value)) : "—";

async function returnToQueue(): Promise<void> {
  const query = { ...route.query };
  delete query.task;
  delete query.tab;
  await router.replace({ path: "/work", query });
}

async function runAction(action: "start" | "pause" | "ready"): Promise<void> {
  if (!task.value || busy.value) return;
  busy.value = true;
  error.value = "";
  try {
    if (action === "start") await repo.startWork(task.value);
    else if (action === "pause") await repo.pauseWork(task.value);
    else await repo.setStatus(task.value, "ready");
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : "The task could not be updated.";
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <main class="mobile-task-detail" data-testid="mobile-task-detail">
    <header class="mobile-detail-nav">
      <Button variant="outline" class="mobile-detail-back" @click="returnToQueue">
        <ArrowLeft aria-hidden="true" /> <span>Work queue</span>
      </Button>
      <span v-if="task" class="mobile-detail-id">#{{ task.id }}</span>
    </header>

    <div v-if="!task" class="mobile-detail-state" role="status">
      <LoaderCircle
        v-if="ui.activeDetailLoading"
        class="mobile-detail-spinner"
        aria-hidden="true"
      />
      <h1>{{ ui.activeDetailLoading ? "Loading task…" : "Task unavailable" }}</h1>
      <p v-if="!ui.activeDetailLoading">
        This task could not be loaded. Return to the queue and try again.
      </p>
      <Button v-if="!ui.activeDetailLoading" variant="outline" @click="returnToQueue"
        >Return to Work</Button
      >
    </div>

    <template v-else>
      <section class="mobile-detail-heading">
        <div class="mobile-detail-status-line">
          <span class="mobile-detail-status" :data-status="task.status">{{ task.status }}</span>
          <span v-if="task.needsInput" class="mobile-detail-needs-input">Needs your input</span>
        </div>
        <h1>{{ task.title }}</h1>
        <p class="mobile-detail-subtitle">Task details · {{ task.type }} · {{ task.priority }}</p>
      </section>

      <section class="mobile-detail-actions" aria-label="Available task actions">
        <Button
          v-if="task.status === 'ready' && task.assignee !== 'human'"
          variant="accent"
          :disabled="busy"
          @click="runAction('start')"
          ><Play aria-hidden="true" /> Start work</Button
        >
        <Button
          v-else-if="task.status === 'active'"
          variant="outline"
          :disabled="busy"
          @click="runAction('pause')"
        >
          <Pause aria-hidden="true" /> Pause work
        </Button>
        <Button
          v-else-if="['draft', 'inbox'].includes(task.status)"
          variant="outline"
          :disabled="busy"
          @click="runAction('ready')"
        >
          Move to ready
        </Button>
        <span v-if="busy" class="mobile-detail-saving" role="status">Saving…</span>
      </section>
      <p v-if="error" class="mobile-detail-error" role="alert">{{ error }}</p>

      <section class="mobile-detail-metadata" aria-label="Task metadata">
        <div>
          <span>Priority</span><strong>{{ task.priority }}</strong>
        </div>
        <div>
          <span>Area</span><strong>{{ task.area || "Unassigned" }}</strong>
        </div>
        <div>
          <span>Assigned to</span><strong>{{ task.assignedTo || task.assignee }}</strong>
        </div>
        <div>
          <span>Created</span><strong>{{ dateLabel(task.created_at) }}</strong>
        </div>
        <div>
          <span>Updated</span><strong>{{ dateLabel(task.updated_at) }}</strong>
        </div>
        <div v-if="task.story">
          <span>Story</span><strong>{{ task.story }}</strong>
        </div>
      </section>

      <section class="mobile-detail-description">
        <h2>Description</h2>
        <div
          v-if="descriptionHtml"
          class="mobile-detail-markdown markdown-body"
          v-html="descriptionHtml"
        ></div>
        <p v-else class="mobile-detail-empty">No description provided.</p>
      </section>
      <div class="mobile-detail-bottom-space" aria-hidden="true"></div>
    </template>
  </main>
</template>

<style scoped>
.mobile-task-detail {
  min-width: 0;
  overflow-x: hidden;
  overflow-y: auto;
  padding: 0 0 calc(var(--page-bottom-inset) + 10px);
  color: var(--txt);
  overscroll-behavior: contain;
  overflow-wrap: anywhere;
}
.mobile-detail-nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 48px;
}
.mobile-detail-back {
  min-height: 44px;
  padding-inline: 12px;
}
.mobile-detail-back :deep(svg) {
  width: 17px;
  height: 17px;
}
.mobile-detail-id {
  color: var(--txt-faint);
  font: 600 12px/1 var(--font-mono, monospace);
}
.mobile-detail-heading {
  padding: 20px 0 18px;
  border-bottom: 1px solid var(--border);
}
.mobile-detail-status-line {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}
.mobile-detail-status,
.mobile-detail-needs-input {
  display: inline-flex;
  align-items: center;
  min-height: 28px;
  padding: 4px 10px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--panel);
  color: var(--txt-dim);
  font-size: 12px;
  font-weight: 700;
  text-transform: capitalize;
}
.mobile-detail-status[data-status="active"] {
  color: var(--cyan);
}
.mobile-detail-status[data-status="review"] {
  color: var(--purple);
}
.mobile-detail-needs-input {
  color: var(--orange);
}
.mobile-detail-heading h1 {
  margin: 13px 0 0;
  font-size: clamp(24px, 7vw, 32px);
  line-height: 1.13;
  letter-spacing: -0.035em;
  overflow-wrap: anywhere;
}
.mobile-detail-subtitle {
  margin: 9px 0 0;
  color: var(--txt-faint);
  font-size: 13px;
  text-transform: capitalize;
}
.mobile-detail-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  padding: 16px 0;
  border-bottom: 1px solid var(--border);
}
.mobile-detail-actions :deep(button) {
  min-height: 46px;
}
.mobile-detail-saving {
  color: var(--txt-faint);
  font-size: 12px;
}
.mobile-detail-error {
  margin: 12px 0 0;
  padding: 11px 12px;
  border: 1px solid var(--red-border-tint);
  border-radius: 10px;
  background: var(--red-tint);
  color: var(--red);
  font-size: 13px;
  line-height: 1.45;
  overflow-wrap: anywhere;
}
.mobile-detail-metadata {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1px;
  margin: 14px 0 0;
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--border);
}
.mobile-detail-metadata > div {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
  padding: 12px;
  background: var(--panel);
}
.mobile-detail-metadata span {
  color: var(--txt-faint);
  font-size: 11px;
}
.mobile-detail-metadata strong {
  color: var(--txt);
  font-size: 13px;
  font-weight: 650;
  overflow-wrap: anywhere;
}
.mobile-detail-description {
  padding-top: 22px;
}
.mobile-detail-description h2 {
  margin: 0 0 12px;
  font-size: 16px;
  letter-spacing: -0.015em;
}
.mobile-detail-markdown {
  min-width: 0;
  color: var(--txt-dim);
  font-size: 14px;
  line-height: 1.65;
  overflow-wrap: anywhere;
}
.mobile-detail-markdown :deep(pre),
.mobile-detail-markdown :deep(table) {
  max-width: 100%;
  overflow-x: auto;
}
.mobile-detail-markdown :deep(img) {
  max-width: 100%;
  height: auto;
}
.mobile-detail-empty,
.mobile-detail-state p {
  color: var(--txt-faint);
  font-size: 13px;
  line-height: 1.5;
}
.mobile-detail-state {
  display: grid;
  justify-items: start;
  gap: 8px;
  padding: 30px 0;
}
.mobile-detail-state h1 {
  margin: 0;
  font-size: 22px;
}
.mobile-detail-state p {
  margin: 0 0 8px;
}
.mobile-detail-spinner {
  width: 20px;
  height: 20px;
  animation: mobile-spin 1s linear infinite;
}
.mobile-detail-bottom-space {
  height: 14px;
}
@keyframes mobile-spin {
  to {
    transform: rotate(360deg);
  }
}
@media (prefers-reduced-motion: reduce) {
  .mobile-detail-spinner {
    animation-duration: 2.4s;
  }
}
</style>
