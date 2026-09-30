<script setup lang="ts">
import { ref } from "vue";
import { useRepoStore } from "../stores/repo";
import { useUiStore } from "../stores/ui";
import { CHECK_SETUP_TASK_TITLE, checkSetupCliHint, fileCheckSetupTask } from "../lib/check-setup";

/**
 * #0592 — the "no checks configured" reminder shown wherever a check run
 * reported that the gate was SKIPPED because the repo has no check plan: a
 * neutral/amber callout, never green. Two easy paths out of the dead end:
 *
 * - **File a task** — one click creates "Set up check.steps in repoos.toml"
 *   through the normal task-creation path (`POST /api/tasks`) with a body
 *   that tells the assigned agent exactly what to run.
 * - **Copy the CLI hint** — for doing it by hand right now.
 */
const repo = useRepoStore();
const ui = useUiStore();

const filing = ref(false);
const copied = ref(false);
const hint = checkSetupCliHint();
let copiedTimer: ReturnType<typeof setTimeout> | undefined;

async function fileTask(): Promise<void> {
  if (filing.value) return;
  filing.value = true;
  try {
    const t = await fileCheckSetupTask();
    repo.pushToast(`Task #${t.id} filed — ${CHECK_SETUP_TASK_TITLE}`, "info");
    await ui.openTask(t);
  } catch (err) {
    repo.pushToast(err instanceof Error ? err.message : String(err), "error");
  } finally {
    filing.value = false;
  }
}

async function copyHint(): Promise<void> {
  try {
    await navigator.clipboard.writeText(hint);
    copied.value = true;
    if (copiedTimer) clearTimeout(copiedTimer);
    copiedTimer = setTimeout(() => (copied.value = false), 2000);
  } catch {
    /* clipboard unavailable — the hint text is selectable anyway */
  }
}
</script>

<!-- #0565: body-teleported surfaces are governed by their own CSS; this card
     renders in-flow (never an overlay), so it needs no teleport/layer attr. -->
<template>
  <aside class="ncpr" role="status" aria-label="No checks configured">
    <p class="ncpr-title">No checks configured</p>
    <p class="ncpr-body">
      Nothing was verified because this repo has no check plan yet. That's fine while there is no
      code to build or test — set checks up once the repo is scaffolded enough to build or run.
    </p>
    <p class="ncpr-hint">
      When it is: run <code class="ncpr-code">repoos check --print-plan</code> — it prints a
      starting <code class="ncpr-code">[[check.steps]]</code> TOML resolved from the repo (needs a
      <code class="ncpr-code">package.json</code>, <code class="ncpr-code">go.mod</code>,
      <code class="ncpr-code">Cargo.toml</code> or <code class="ncpr-code">gradlew</code>) — then
      commit the steps to <code class="ncpr-code">repoos.toml</code>. Docs:
      <code class="ncpr-code">user-docs/check.md</code>.
    </p>
    <div class="ncpr-actions">
      <button type="button" class="ncpr-btn ncpr-primary" :disabled="filing" @click="fileTask">
        {{ filing ? "Filing…" : `File a task: “${CHECK_SETUP_TASK_TITLE}”` }}
      </button>
      <button type="button" class="ncpr-btn" @click="copyHint">
        {{ copied ? "Copied" : "Copy CLI hint" }}
      </button>
    </div>
  </aside>
</template>

<style scoped>
.ncpr {
  border: 1px solid var(--amber-border-tint);
  background: var(--amber-tint);
  border-radius: 10px;
  padding: 10px 12px;
  margin: 8px 14px;
  font-size: 12px;
  line-height: 1.5;
}

.ncpr-title {
  margin: 0 0 4px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--amber);
}

.ncpr-body {
  margin: 0 0 6px;
  color: var(--txt);
}

.ncpr-hint {
  margin: 0;
  color: var(--txt-dim);
}

.ncpr-code {
  font-family: "JetBrains Mono", monospace;
  font-size: 11px;
  color: var(--txt);
}

.ncpr-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 8px;
}

.ncpr-btn {
  border: 1px solid var(--border);
  background: var(--panel-solid);
  color: var(--txt-dim);
  font-size: 11.5px;
  font-weight: 600;
  padding: 4px 10px;
  border-radius: 7px;
  cursor: pointer;
  transition: 0.15s;
}

.ncpr-btn:hover {
  border-color: var(--amber-border-tint);
  color: var(--txt);
}

.ncpr-primary:hover {
  color: var(--amber);
}

.ncpr-btn:disabled {
  opacity: 0.6;
  cursor: default;
}

@media (prefers-reduced-motion: reduce) {
  .ncpr-btn {
    transition: none;
  }
}
</style>
