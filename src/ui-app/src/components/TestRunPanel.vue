<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { storeToRefs } from "pinia";
import { useRepoStore } from "../stores/repo";
import Card from "./ui/card.vue";
import { parseTestSummary, parseFailures, countFileResultLines } from "../lib/testRunParse";

const repo = useRepoStore();
const { testRun } = storeToRefs(repo);

const starting = ref(false);

async function run(): Promise<void> {
  if (starting.value || testRun.value.running) return;
  starting.value = true;
  try {
    await repo.startTestRun();
  } catch (err) {
    repo.onError(err);
  } finally {
    starting.value = false;
  }
}

onMounted(() => {
  // Picks up a run already in progress (or its last result) instead of
  // showing empty state until the next SSE chunk arrives.
  void repo.refreshTestRun();
});

/** Ticks once a second while a run is in progress, so the elapsed timer
 *  counts up live instead of freezing until the next output chunk. */
const now = ref(Date.now());
let nowTimer: ReturnType<typeof setInterval> | undefined;
onMounted(() => {
  nowTimer = setInterval(() => {
    now.value = Date.now();
  }, 1000);
});
onUnmounted(() => clearInterval(nowTimer));

const elapsedMs = computed(() => {
  const start = testRun.value.startedAt;
  if (!start) return 0;
  const end = testRun.value.finishedAt ?? new Date(now.value).toISOString();
  return Math.max(0, Date.parse(end) - Date.parse(start));
});

function fmtElapsed(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

const summary = computed(() => parseTestSummary(testRun.value.output));
const failures = computed(() => parseFailures(testRun.value.output));
const filesSeen = computed(() => countFileResultLines(testRun.value.output));

/** Idle / running / passed / failed — drives the status chip's color+label. */
const status = computed<{ label: string; cls: string }>(() => {
  if (testRun.value.running) return { label: "running…", cls: "trp-running" };
  if (!testRun.value.finishedAt) return { label: "idle", cls: "trp-idle" };
  if (testRun.value.code === 0) return { label: "passed", cls: "trp-passed" };
  return { label: "failed", cls: "trp-failed" };
});

/** Auto-scrolls the log to the bottom as output arrives, unless the human
 *  has scrolled up to read something — matches the agent-log's own
 *  "stick to bottom" convention elsewhere in the drawer. */
const logEl = ref<HTMLElement | null>(null);
const stick = ref(true);
function onLogScroll(): void {
  const el = logEl.value;
  if (!el) return;
  stick.value = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
}
watch(
  () => testRun.value.output,
  () => {
    if (!stick.value) return;
    nextTick(() => {
      const el = logEl.value;
      if (el) el.scrollTop = el.scrollHeight;
    });
  },
);
</script>

<template>
  <Card class="test-run-panel">
    <div class="trp-head">
      <div class="panel-title">Test Suite</div>
      <span class="trp-status" :class="status.cls">{{ status.label }}</span>
      <span v-if="testRun.startedAt" class="trp-elapsed">{{ fmtElapsed(elapsedMs) }}</span>
      <button type="button" class="trp-run" :disabled="starting || testRun.running" @click="run">
        {{ testRun.running ? "Running…" : "Run full test suite" }}
      </button>
    </div>

    <div v-if="testRun.running || testRun.startedAt" class="trp-body">
      <div class="trp-progress">
        <span v-if="testRun.running"
          >{{ filesSeen }} test file{{ filesSeen === 1 ? "" : "s" }} seen so far</span
        >
        <template v-else-if="summary">
          <span>{{ summary.testFilesPassed }}/{{ summary.testFilesTotal }} files</span>
          <span>·</span>
          <span :class="{ 'trp-bad-count': summary.testsFailed > 0 }">
            {{ summary.testsFailed > 0 ? `${summary.testsFailed} failed, ` : ""
            }}{{ summary.testsPassed }} passed{{
              summary.testsSkipped ? `, ${summary.testsSkipped} skipped` : ""
            }}
            of {{ summary.testsTotal }}
          </span>
          <span v-if="summary.durationSec !== null"
            >· {{ summary.durationSec.toFixed(1) }}s runtime</span
          >
        </template>
      </div>

      <div v-if="!testRun.running && failures.length" class="trp-failures">
        <div class="trp-failures-title">Failures ({{ failures.length }})</div>
        <div v-for="(f, i) in failures" :key="i" class="trp-failure">
          <div class="trp-failure-file">{{ f.file }}</div>
          <div v-if="f.test" class="trp-failure-test">{{ f.test }}</div>
        </div>
      </div>

      <pre ref="logEl" class="trp-log" @scroll="onLogScroll">{{ testRun.output || "…" }}</pre>
    </div>

    <div v-else class="trp-empty">No test run yet this session.</div>
  </Card>
</template>

<style scoped>
.test-run-panel {
  background: var(--panel-gradient, linear-gradient(180deg, #0c1222, #080c16));
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 16px;
  margin-bottom: 16px;
}

.panel-title {
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--txt-dim);
}

.trp-head {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.trp-status {
  font-family: "JetBrains Mono", ui-monospace, monospace;
  font-size: 10.5px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  padding: 2px 8px;
  border-radius: 999px;
}
.trp-idle {
  color: var(--txt-faint);
  background: var(--chip-bg);
}
.trp-running {
  color: var(--cyan);
  background: var(--cyan-dim);
}
.trp-passed {
  color: var(--green);
  background: var(--green-tint);
}
.trp-failed {
  color: var(--red);
  background: var(--red-tint);
}

.trp-elapsed {
  font-family: "JetBrains Mono", ui-monospace, monospace;
  font-size: 12px;
  color: var(--txt-dim);
  font-variant-numeric: tabular-nums;
}

.trp-run {
  margin-left: auto;
  font-family: "JetBrains Mono", ui-monospace, monospace;
  font-size: 11px;
  font-weight: 600;
  padding: 6px 12px;
  border-radius: 7px;
  border: 1px solid var(--cyan-dim);
  background: var(--cyan-dim);
  color: var(--cyan);
  cursor: pointer;
}
.trp-run:hover:not(:disabled) {
  filter: brightness(1.15);
}
.trp-run:disabled {
  cursor: default;
  opacity: 0.6;
}

.trp-body {
  margin-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.trp-progress {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  font-size: 12px;
  color: var(--txt-dim);
  font-variant-numeric: tabular-nums;
}
.trp-bad-count {
  color: var(--red);
  font-weight: 600;
}

.trp-failures {
  border: 1px solid var(--red-border-tint, rgba(255, 107, 125, 0.25));
  background: var(--red-tint);
  border-radius: 8px;
  padding: 10px 12px;
  max-height: 220px;
  overflow-y: auto;
}
.trp-failures-title {
  font-size: 11px;
  font-weight: 700;
  color: var(--red);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  margin-bottom: 6px;
}
.trp-failure {
  padding: 5px 0;
  border-top: 1px solid rgba(255, 107, 125, 0.15);
  font-size: 12px;
}
.trp-failure:first-child {
  border-top: none;
}
.trp-failure-file {
  font-family: "JetBrains Mono", ui-monospace, monospace;
  color: var(--txt);
  font-weight: 600;
}
.trp-failure-test {
  color: var(--txt-dim);
  margin-top: 1px;
}

.trp-log {
  margin: 0;
  background: var(--md-body-bg, #070a12);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 10px 12px;
  font-family: "JetBrains Mono", ui-monospace, monospace;
  font-size: 11px;
  line-height: 1.5;
  color: var(--txt-dim);
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 320px;
  overflow-y: auto;
}

.trp-empty {
  margin-top: 10px;
  font-size: 12px;
  color: var(--txt-faint);
}
</style>
