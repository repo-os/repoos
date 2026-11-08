<script setup lang="ts">
import { computed } from "vue";
import { useRepoStore } from "../stores/repo";
import { clientBoardTasks, clientColumns } from "../lib/client-board";

const repo = useRepoStore();
const columns = computed(() => clientBoardTasks(repo.tasks));
</script>

<template>
  <main class="client-page">
    <div class="client-board" aria-label="Project board">
      <div class="client-bar">RepoOS / project board</div>
      <div class="client-content">
        <header>
          <h1>{{ repo.repoName || "Project" }}</h1>
          <p>Work planned and in progress for this project.</p>
        </header>
        <p v-if="repo.loading" class="client-message" role="status">Loading project work…</p>
        <div v-else class="client-columns">
          <section v-for="column in clientColumns" :key="column.id" :aria-labelledby="column.id">
            <h2 :id="column.id" :class="column.id">{{ column.label }}</h2>
            <article
              v-for="task in columns[column.id]"
              :key="task.id"
              class="client-card"
              :class="column.id"
            >
              <span class="client-id">#{{ task.id }}</span>
              <h3>{{ task.title }}</h3>
              <p>{{ task.line }}</p>
            </article>
            <p v-if="!columns[column.id].length" class="client-empty">No work here yet.</p>
          </section>
        </div>
      </div>
    </div>
  </main>
</template>

<style scoped>
.client-page {
  min-height: 100vh;
  padding: 36px;
  background: var(--bg);
  color: var(--txt);
}
.client-board {
  overflow: hidden;
  border: 1px solid var(--border-bright);
  border-radius: 13px;
  background: var(--bg-2);
}
.client-bar {
  padding: 14px 24px;
  border-bottom: 1px solid var(--border);
  color: var(--txt-dim);
  font: 12px var(--font-mono);
}
.client-content {
  padding: 28px;
}
h1 {
  margin: 0;
  font-size: 24px;
}
header p {
  margin: 7px 0 0;
  color: var(--txt-dim);
  font-size: 14px;
}
.client-columns {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
  margin-top: 32px;
}
h2 {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 14px;
  color: var(--txt-dim);
  font: 600 12px var(--font-mono);
}
h2::before {
  content: "";
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--violet);
}
h2.building::before {
  background: var(--cyan);
}
h2.reviewed::before {
  background: var(--green);
}
.client-card {
  margin-bottom: 10px;
  padding: 16px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--panel-solid);
  overflow-wrap: anywhere;
}
.client-card.building {
  border-color: var(--border-bright);
  background: var(--cyan-dim);
}
.client-id {
  color: var(--txt-dim);
  font: 11px var(--font-mono);
}
h3 {
  margin: 10px 0;
  font-size: 14px;
  line-height: 1.5;
  font-weight: 600;
}
.client-card p,
.client-empty,
.client-message {
  margin: 0;
  color: var(--txt-dim);
  font-size: 12px;
  line-height: 1.5;
}
.client-message {
  margin-top: 32px;
}
@media (max-width: 700px) {
  .client-page {
    padding: 16px;
  }
  .client-content {
    padding: 20px;
  }
  .client-columns {
    grid-template-columns: 1fr;
    gap: 24px;
  }
}
</style>
