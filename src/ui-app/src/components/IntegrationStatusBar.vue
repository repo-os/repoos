<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { storeToRefs } from "pinia";
import { ChevronDown, ChevronUp } from "lucide-vue-next";
import { useRepoStore } from "../stores/repo";
import { INTEGRATION_STAGES, type IntegrationPipelineSnapshot } from "../types";

const PERSIST_KEY = "repoos.integrationBar.collapsed";

const repo = useRepoStore();
const { integration } = storeToRefs(repo);

/** True when the bar is folded to a thin strip (persisted across reloads). */
const collapsed = ref<boolean>(
  (() => {
    try {
      return localStorage.getItem(PERSIST_KEY) === "1";
    } catch {
      return false;
    }
  })(),
);

// Keep the strip's summary truthful even when collapsed.
watch(collapsed, (c) => {
  try {
    localStorage.setItem(PERSIST_KEY, c ? "1" : "0");
  } catch {
    /* ignore quota / privacy-mode failures */
  }
});

const snapshot = computed<IntegrationPipelineSnapshot | null>(() => integration.value ?? null);
const idle = computed(() => snapshot.value === null || snapshot.value.empty);
const active = computed(() => snapshot.value?.active ?? null);
const queue = computed(() => snapshot.value?.queue ?? []);

/** Index of the current stage within INTEGRATION_STAGES, or -1. */
const currentIndex = computed(() => {
  const s = active.value?.stage;
  if (!s) return -1;
  const i = INTEGRATION_STAGES.indexOf(s);
  return i;
});

/** The failed stage index (the stage that turned red), or -1 when not failed. */
const failedIndex = computed(() => {
  if (!active.value?.failed) return -1;
  // A failure is pinned to the stage being run at the time; fall back to the
  // current index if the stage never resolved.
  return currentIndex.value;
});

function retry(): void {
  if (!active.value) return;
  repo
    .retryIntegration(active.value.taskId)
    .catch((err) => {
      const message = err instanceof Error ? err.message : String(err);
      repo.pushToast(message, "error");
    });
}

function stageClass(s: string, i: number): string {
  // On failure the failing stage is pinned red; earlier stages stay checked
  // (green) and later stages remain pending (todo).
  if (active.value?.failed) {
    if (i < failedIndex.value) return "done";
    if (i === failedIndex.value && failedIndex.value >= 0) return "failed";
    return "todo";
  }
  if (i < currentIndex.value) return "done";
  if (i === currentIndex.value) return "current";
  return "todo";
}
</script>

<template>
  <div class="ibar-wrap" :class="{ collapsed }">
    <!-- Collapsed thin strip: one row with a summary pill + expand toggle -->
    <button
      v-if="collapsed"
      type="button"
      class="ibar-strip"
      :title="'Integration pipeline — ' + (idle ? 'idle' : active ? '#' + active.taskId + ' ' + (active.stage ?? '…') : '')"
      @click="collapsed = false"
    >
      <span class="strip-dot" :class="{ idle, run: !idle && !active?.failed, err: active?.failed }"></span>
      <span class="strip-label">
        <template v-if="idle">Integration pipeline idle</template>
        <template v-else-if="active">
          <span class="mono">#{{ active.taskId }}</span>
          <template v-if="active.failed"> integration failed</template>
          <template v-else> integrating… <span class="mono dim">{{ active.stage ?? "" }}</span></template>
        </template>
        <template v-else>Integrating…</template>
      </span>
      <ChevronUp class="strip-chev" aria-hidden="true" />
    </button>

    <!-- Expanded bar -->
    <div v-else class="ibar">
      <div class="ibar-top">
        <button type="button" class="ibar-toggle" :title="'Collapse integration pipeline'" @click="collapsed = true">
          <ChevronDown class="bar-chev" aria-hidden="true" />
        </button>

        <template v-if="idle">
          <span class="ibar-title">
            <span class="bar-dot idle"></span>
            Integration pipeline idle
          </span>
          <span class="ibar-idle-hint">Queued close-outs appear here as they are synced, merged, built and checked.</span>
        </template>

        <template v-else-if="active">
          <span class="ibar-title">
            <span class="bar-dot" :class="{ run: !active.failed, err: active.failed }"></span>
            <span class="mono">#{{ active.taskId }}</span>
            <template v-if="active.failed"> integration failed</template>
            <template v-else> integrating</template>
          </span>

          <ol class="stages" :aria-label="'Integration stages'">
            <li
              v-for="(s, i) in INTEGRATION_STAGES"
              :key="s"
              class="stage"
              :class="stageClass(s, i)"
            >
              <span class="stage-mark" aria-hidden="true">
                <svg v-if="i < currentIndex" viewBox="0 0 24 24" class="stage-check" fill="none">
                  <path d="M5 13l4 4L19 7" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
                </svg>
                <span v-else class="stage-dot" :class="{ spin: i === currentIndex && !active.failed }"></span>
              </span>
              <span class="stage-name">{{ s }}</span>
              <span v-if="i < INTEGRATION_STAGES.length - 1" class="stage-arrow" aria-hidden="true">→</span>
            </li>
          </ol>

          <div v-if="active.failed" class="ibar-err">
            <div class="ibar-err-text">
              <span class="err-label">Failed at {{ active.stage ?? "…" }}</span>
              <span class="err-msg">{{ active.error ?? "The integration could not be completed." }}</span>
            </div>
            <button type="button" class="bar-btn" @click="retry">Retry</button>
          </div>
        </template>
      </div>

      <div v-if="queue.length" class="ibar-queue">
        <span class="queue-label">Queue</span>
        <span v-for="q in queue" :key="q" class="queue-item mono">#{{ q }} queueing…</span>
        <span class="queue-count">+{{ queue.length }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.ibar-wrap {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  /* The integration status is useful ambient UI, never a modal. Keep it
     below the drawer and its backdrop so it cannot cover or intercept them. */
  z-index: 60;
  pointer-events: none;
}

.ibar-wrap > * {
  pointer-events: auto;
}

.ibar {
  background: var(--panel-solid);
  border-top: 1px solid var(--border);
  box-shadow: 0 -8px 24px rgba(0, 0, 0, 0.35);
  padding: 8px 14px 10px;
}

.ibar-top {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.ibar-toggle {
  display: grid;
  place-items: center;
  width: 22px;
  height: 22px;
  flex-shrink: 0;
  border: none;
  background: none;
  color: var(--txt-faint);
  cursor: pointer;
}

.ibar-toggle:hover {
  color: var(--txt);
}

.bar-chev {
  width: 16px;
  height: 16px;
}

.ibar-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--txt);
  white-space: nowrap;
}

.bar-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.bar-dot.idle {
  background: var(--txt-faint);
}

.bar-dot.run {
  background: var(--cyan);
  box-shadow: 0 0 8px var(--cyan);
}

.bar-dot.err {
  background: var(--red);
  box-shadow: 0 0 8px var(--red);
}

.ibar-idle-hint {
  font-size: 12px;
  color: var(--txt-faint);
}

.stages {
  display: flex;
  align-items: center;
  gap: 2px;
  list-style: none;
  margin: 0;
  padding: 4px 0;
  flex-wrap: wrap;
}

.stage {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--txt-faint);
  white-space: nowrap;
}

.stage-mark {
  display: grid;
  place-items: center;
  width: 16px;
  height: 16px;
}

.stage-check {
  width: 14px;
  height: 14px;
  color: var(--green);
}

.stage.dot {
  background: var(--txt-faint);
  border-radius: 50%;
  width: 8px;
  height: 8px;
  border: 2px solid var(--txt-faint);
  box-sizing: content-box;
}

.stage-dot {
  width: 8px;
  height: 8px;
  border: 2px solid var(--txt-faint);
  border-radius: 50%;
  box-sizing: content-box;
}

.stage-dot.spin {
  border-top-color: var(--cyan);
  border-right-color: var(--cyan);
  animation: ibar-spin 0.9s linear infinite;
}

.stage.done .stage-name {
  color: var(--txt-dim);
}

.stage.current .stage-name {
  color: var(--cyan);
  font-weight: 600;
}

.stage.failed .stage-name {
  color: var(--red);
  font-weight: 600;
}

.stage.failed .stage-dot,
.stage.failed .stage-mark {
  color: var(--red);
}

.stage.failed .stage-dot {
  border-color: var(--red);
  border-top-color: var(--red);
  border-right-color: var(--red);
}

.stage-arrow {
  color: var(--txt-faint);
  margin-left: 2px;
  margin-right: 2px;
}

.ibar-err {
  display: flex;
  align-items: center;
  gap: 12px;
  background: var(--red-tint);
  border: 1px solid var(--red-border-tint);
  border-radius: 9px;
  padding: 8px 12px;
  margin-top: 6px;
}

.ibar-err-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.err-label {
  font-size: 11px;
  font-weight: 700;
  color: var(--red);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.err-msg {
  font-size: 12px;
  color: var(--txt);
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}

.bar-btn {
  flex-shrink: 0;
  border: 1px solid var(--red-border-tint);
  background: var(--red-tint);
  color: var(--red);
  font-size: 12px;
  font-weight: 600;
  padding: 5px 14px;
  border-radius: 8px;
  cursor: pointer;
  transition: 0.15s;
}

.bar-btn:hover {
  background: var(--red);
  color: #fff;
}

.ibar-queue {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 6px;
  padding-top: 6px;
  border-top: 1px dashed var(--border);
  font-size: 12px;
}

.queue-label {
  color: var(--txt-faint);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.queue-item {
  color: var(--txt-dim);
  background: var(--chip-bg);
  border-radius: 999px;
  padding: 2px 10px;
}

.queue-count {
  color: var(--txt-faint);
}

/* Collapsed thin strip */
.ibar-strip {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  background: var(--panel-solid);
  border-top: 1px solid var(--border);
  box-shadow: 0 -8px 24px rgba(0, 0, 0, 0.35);
  padding: 6px 14px;
  cursor: pointer;
  font-size: 12px;
  color: var(--txt-dim);
  text-align: left;
}

.strip-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex-shrink: 0;
}

.strip-dot.idle {
  background: var(--txt-faint);
}

.strip-dot.run {
  background: var(--cyan);
  box-shadow: 0 0 8px var(--cyan);
}

.strip-dot.err {
  background: var(--red);
  box-shadow: 0 0 8px var(--red);
}

.strip-label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dim {
  color: var(--txt-faint);
}

.strip-chev {
  width: 16px;
  height: 16px;
  color: var(--txt-faint);
  flex-shrink: 0;
}

/* Mobile: stay full-width but always float clear of the bottom tab bar,
   whose height is safe-area aware (see .tabbar in style.css). Use the same
   offset FloatingHeads uses so nothing tucks under the nav, and keep this
   bar below FloatingHeads (z-index 70) but above the tab bar (z-index 50)
   so the CTO/Ross buttons stay visible and tappable on top of it. The bar
   no longer touches the viewport edge, so give it a card look rather than
   the dock's top-border/upward-shadow treatment. */
@media (max-width: 760px) {
  .ibar-wrap {
    bottom: calc(74px + var(--safe-bot));
    z-index: 60;
  }

  .ibar,
  .ibar-strip {
    border: 1px solid var(--border);
    border-radius: 14px;
    box-shadow: 0 10px 24px rgba(0, 0, 0, 0.25);
  }
}

/* Desktop: float the bar as a content-sized, rounded panel near the bottom
   of the viewport instead of a full-bleed dock. */
@media (min-width: 761px) {
  .ibar-wrap {
    left: 50%;
    right: auto;
    bottom: 14px;
    transform: translateX(-50%);
  }

  .ibar,
  .ibar-strip {
    width: fit-content;
    max-width: min(680px, calc(100vw - 28px));
    border: 1px solid var(--border);
    border-radius: 16px;
    box-shadow: 0 12px 32px rgba(0, 0, 0, 0.25);
  }

  .ibar-strip {
    border-radius: 999px;
    padding: 7px 16px;
  }

  .ibar {
    padding: 10px 16px 12px;
  }
}

@keyframes ibar-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .stage-dot.spin {
    animation: none;
  }
}
</style>
