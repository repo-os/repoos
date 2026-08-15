<script setup lang="ts">
import { computed, ref } from "vue";
import { storeToRefs } from "pinia";
import { ChevronDown, ChevronUp, RotateCcw } from "lucide-vue-next";
import {
  INTEGRATION_STAGES,
  type IntegrationStageName,
  useRepoStore,
} from "../stores/repo";

const repo = useRepoStore();
const { integration } = storeToRefs(repo);

/** Whether the bar should fold to a thin strip (default: expanded). */
const expanded = ref(true);

const active = computed(() => integration.value.active);
const queue = computed(() => integration.value.queue);

const idle = computed(() => !active.value);
const failed = computed(() => active.value?.phase === "failed");
const phaseDone = computed(() => active.value?.phase === "done");

/**
 * The server reports the active job's fine stage in its OWN execution order:
 * sync → build → check → merge → done. The bar renders them in the spec's
 * display order (sync → merge → build → check → done), and a stage is only
 * "done" once the job has moved past it. Because the execution order and the
 * display order differ, each display stage has its own "active at" and
 * "complete when at or past" execution index:
 *
 *   display           active-at    complete-at
 *   sync               sync(0)      build(1)   — done once building starts
 *   merge              merge(3)     done(4)    — done only at finalize
 *   build              build(1)     check(2)   — done once checking starts
 *   check              check(2)     merge(3)   — done once merging starts
 *   done               done(4)      phase done — done only when finalized
 */
const EXEC_INDEX: Record<IntegrationStageName, number> = {
  sync: 0,
  merge: 3,
  build: 1,
  check: 2,
  done: 4,
};
const COMPLETE_AT: Record<IntegrationStageName, number> = {
  sync: 1,
  merge: 4,
  build: 2,
  check: 3,
  done: 5,
};

const currentExec = computed(() => {
  const s = active.value?.stage as IntegrationStageName | undefined;
  if (s && s in EXEC_INDEX) return EXEC_INDEX[s];
  return 0;
});

/** The display status of a stage: done | active | failed | todo. */
function stageStatus(name: IntegrationStageName): "done" | "active" | "failed" | "todo" {
  const exec = currentExec.value;
  if (phaseDone.value) return "done";
  if (exec >= COMPLETE_AT[name]) return "done";
  if (exec === EXEC_INDEX[name]) return failed.value ? "failed" : "active";
  return "todo";
}

const retrying = ref(false);

async function retry() {
  if (!active.value) return;
  retrying.value = true;
  try {
    await repo.retryIntegration(active.value.taskId);
  } catch {
    /* error toast handled in store */
  } finally {
    retrying.value = false;
  }
}
</script>

<template>
  <div class="integration-bar" :class="{ collapsed: !expanded }">
    <Transition name="fold" mode="out-in">
      <div v-if="expanded" key="expanded" class="bar-body">
        <button
          type="button"
          class="toggle"
          aria-label="Collapse integration pipeline bar"
          @click="expanded = false"
        >
          <ChevronDown class="size-[14px]" />
        </button>

        <template v-if="idle">
          <span class="idle-label">
            <span class="idle-dot"></span> Integration pipeline idle
          </span>
          <span class="spacer"></span>
          <span class="queue-count" v-if="queue.length">
            {{ queue.length }} queued
          </span>
        </template>

        <template v-else>
          <span class="active-task mono">#{{ active!.taskId }}</span>

          <div class="stages">
            <template
              v-for="(s, i) in INTEGRATION_STAGES"
              :key="s"
            >
              <span
                class="stage"
                :class="stageStatus(s)"
              >
                <span
                  class="stage-mark"
                  v-if="stageStatus(s) === 'done'"
                >✓</span>
                <span
                  class="stage-spin"
                  v-else-if="stageStatus(s) === 'active'"
                ></span>
                <span class="stage-idx" v-else>{{ i + 1 }}</span>
                <span class="stage-name">{{ s }}</span>
              </span>
              <span v-if="i < INTEGRATION_STAGES.length - 1" class="stage-arrow">→</span>
            </template>
          </div>

          <span v-if="failed" class="err-msg">
            {{ active!.reason }}
          </span>

          <button
            v-if="failed"
            type="button"
            class="retry"
            :disabled="retrying"
            @click="retry"
          >
            <RotateCcw class="size-[13px]" />
            Retry
          </button>

          <span class="spacer"></span>

          <TransitionGroup tag="span" name="queue" class="queue">
            <span v-for="q in queue" :key="q.taskId" class="queue-item mono">
              #{{ q.taskId }} queueing…
            </span>
          </TransitionGroup>
        </template>
      </div>

      <div v-else key="collapsed" class="bar-strip">
        <button
          type="button"
          class="toggle"
          aria-label="Expand integration pipeline bar"
          @click="expanded = true"
        >
          <ChevronUp class="size-[14px]" />
        </button>
        <span
          class="strip-dot"
          :class="{ active: !idle, failed }"
        ></span>
        <span v-if="!idle" class="strip-label mono">#{{ active!.taskId }}</span>
        <span class="strip-stage" v-if="!idle && !failed">
          {{ active!.stage }}
        </span>
        <span v-else-if="failed" class="strip-stage failed">failed</span>
        <span class="spacer"></span>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.integration-bar {
  position: fixed;
  left: 20px;
  right: 20px;
  bottom: calc(var(--safe-bot, 0px) + 12px);
  z-index: 80;
  display: flex;
  justify-content: center;
  pointer-events: none;
}

.bar-body,
.bar-strip {
  pointer-events: auto;
  display: flex;
  align-items: center;
  gap: 12px;
  border: 1px solid var(--border-bright);
  background: var(--panel-solid);
  box-shadow: 0 18px 44px rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(10px);
  border-radius: 12px;
}

.bar-body {
  max-width: 760px;
  padding: 10px 14px;
  flex-wrap: wrap;
}

.bar-strip {
  padding: 7px 14px;
  gap: 9px;
  border-radius: 999px;
}

.toggle {
  display: grid;
  place-items: center;
  padding: 2px;
  color: var(--txt-faint);
  background: transparent;
  border: none;
  cursor: pointer;
  border-radius: 6px;
  transition: color 0.15s, transform 0.15s;
}
.toggle:hover {
  color: var(--txt);
}

.idle-label {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 12.5px;
  color: var(--txt-dim);
}
.idle-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--txt-faint);
}

.spacer {
  flex: 1;
  min-width: 4px;
}

.mono {
  font-family: "JetBrains Mono", monospace;
}

.active-task {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--cyan);
}

.stages {
  display: inline-flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
}

.stage {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  color: var(--txt-faint);
}
.stage-mark {
  color: var(--green);
  font-weight: 700;
}
.stage-spin {
  width: 9px;
  height: 9px;
  border: 2px solid var(--border-bright);
  border-top-color: var(--cyan);
  border-radius: 50%;
  animation: stage-spin 0.8s linear infinite;
}
.stage-idx {
  display: inline-grid;
  place-items: center;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  font-size: 9px;
  border: 1px solid var(--border);
}
.stage.active {
  color: var(--cyan);
}
.stage.failed {
  color: var(--red);
}
.stage.failed .stage-idx {
  border-color: var(--red);
  color: var(--red);
}
.stage-arrow {
  color: var(--txt-faint);
  font-size: 11px;
}

.err-msg {
  font-size: 11.5px;
  color: var(--red);
  max-width: 220px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.retry {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 10px;
  font-size: 11.5px;
  font-weight: 600;
  color: #fff;
  background: var(--red);
  border: none;
  border-radius: 8px;
  cursor: pointer;
  transition: opacity 0.15s, transform 0.15s;
}
.retry:hover {
  opacity: 0.9;
}
.retry:disabled {
  opacity: 0.5;
  cursor: default;
}

.queue {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.queue-item {
  font-size: 11px;
  color: var(--txt-dim);
  background: var(--cyan-dim);
  border: 1px solid rgba(57, 224, 255, 0.18);
  padding: 3px 8px;
  border-radius: 999px;
}
.queue-count {
  font-size: 11px;
  color: var(--txt-dim);
}

.bar-strip .toggle {
  color: var(--txt-dim);
}
.strip-dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: var(--txt-faint);
}
.strip-dot.active {
  background: var(--cyan);
  box-shadow: 0 0 8px var(--cyan);
  animation: head-pulse 1.2s infinite;
}
.strip-dot.failed {
  background: var(--red);
  box-shadow: 0 0 8px var(--red);
}
.strip-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--cyan);
}
.strip-stage {
  font-size: 11px;
  color: var(--txt-dim);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
.strip-stage.failed {
  color: var(--red);
}

@keyframes stage-spin {
  to {
    transform: rotate(360deg);
  }
}
@keyframes head-pulse {
  50% {
    opacity: 0.35;
  }
}

.fold-enter-active,
.fold-leave-active {
  transition: opacity 0.18s ease, transform 0.18s ease;
}
.fold-enter-from,
.fold-leave-to {
  opacity: 0;
  transform: translateY(6px);
}

.queue-enter-active,
.queue-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}
.queue-enter-from,
.queue-leave-to {
  opacity: 0;
  transform: translateX(8px);
}

@media (max-width: 760px) {
  .integration-bar {
    left: 10px;
    right: 10px;
    bottom: calc(76px + var(--safe-bot));
  }
}

@media (prefers-reduced-motion: reduce) {
  .stage-spin,
  .strip-dot.active {
    animation: none;
  }
}
</style>
