<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { AlertTriangle, ChevronDown, ChevronRight, RefreshCw } from "lucide-vue-next";
import type { Task, TaskCheckRun, TaskLogEntry } from "../types";
import { useRepoStore } from "../stores/repo";
import { relTime } from "../lib/time";
import { summarizeCheckFailure } from "../../../core/check-failure-summary.js";
import Card from "./ui/card.vue";
import Button from "./ui/button.vue";

const props = defineProps<{ task: Task }>();
const repo = useRepoStore();

/**
 * Only tasks that actually have a git worktree cut from main can be synced.
 * Tasks still in `inbox` (no branch/worktree yet) have nothing to reconcile,
 * so the control is hidden for them.
 */
const hasWorktree = computed(() => !!props.task.git.worktreePath);
/** Warn before merging main into a worktree that has uncommitted edits. */
const worktreeDirty = computed(() => !!props.task.git.dirty);
const syncBusy = ref(false);
async function syncWithMain(): Promise<void> {
  if (!hasWorktree.value || syncBusy.value) return;
  syncBusy.value = true;
  try {
    await repo.syncTaskBranch(props.task.id);
  } catch (err) {
    repo.onError(err);
  } finally {
    syncBusy.value = false;
  }
}

onMounted(() => {
  void repo.refreshTaskChecks(props.task.id);
  void repo.refreshTaskLogs(props.task.id);
});
watch(
  () => props.task.id,
  (id) => {
    void repo.refreshTaskChecks(id);
    void repo.refreshTaskLogs(id);
  },
);

type EventLevel = "info" | "warn" | "error";
type EventKind = "activity" | "log" | "check";

interface DebugEvent {
  key: string;
  at: string;
  kind: EventKind;
  level: EventLevel;
  title: string;
  detail?: string;
  failureSummary?: string;
  checkRun?: TaskCheckRun;
}

/** Activity lines look like `- 2026-08-27T06:20:50Z · status draft→inbox, title, area, body`
 *  — the task's own append-only state-change log, already part of its body. */
function parseActivity(body: string): { at: string; text: string }[] {
  const heading = body.lastIndexOf("\n## Activity\n");
  if (heading === -1) return [];
  const section = body.slice(heading);
  const entries: { at: string; text: string }[] = [];
  const re = /^- (\S+) · (.+)$/gmu;
  let m: RegExpExecArray | null;
  while ((m = re.exec(section))) {
    entries.push({ at: m[1], text: m[2] });
  }
  return entries;
}

function checkLabel(kind: TaskCheckRun["kind"]): string {
  return kind === "handoff-finalize" ? "handoff-finalize check" : "MTD merge-gate check";
}

function fmtDuration(ms: number | null): string {
  if (ms === null) return "";
  if (ms < 1000) return `${ms}ms`;
  const totalSec = ms / 1000;
  if (totalSec < 60) return `${totalSec.toFixed(1)}s`;
  const m = Math.floor(totalSec / 60);
  const s = Math.round(totalSec % 60);
  return `${m}m ${s}s`;
}

const events = computed<DebugEvent[]>(() => {
  const out: DebugEvent[] = [];

  for (const a of parseActivity(props.task.body ?? "")) {
    out.push({
      key: `activity-${a.at}-${a.text.slice(0, 24)}`,
      at: a.at,
      kind: "activity",
      level: /fail|error/i.test(a.text) ? "error" : "info",
      title: a.text,
    });
  }

  for (const l of repo.taskLogs[props.task.id] ?? []) {
    out.push({
      key: `log-${l.timestamp}-${l.message.slice(0, 24)}`,
      at: l.timestamp,
      kind: "log",
      level:
        l.level === "error" || l.level === "fatal" ? "error" : l.level === "warn" ? "warn" : "info",
      title: l.message,
      detail: l.context && Object.keys(l.context).length ? JSON.stringify(l.context) : undefined,
    });
  }

  for (const c of repo.taskChecks[props.task.id] ?? []) {
    const label = checkLabel(c.kind);
    const title = c.running
      ? `${label} — running…`
      : `${label} — ${c.passed ? "passed" : "failed"} in ${fmtDuration(c.durationMs)}`;
    out.push({
      key: `check-${c.id}`,
      at: c.startedAt,
      kind: "check",
      level: c.running ? "info" : c.passed ? "info" : "error",
      title,
      failureSummary: !c.running && c.passed === false ? summarizeCheckFailure(c.output) ?? undefined : undefined,
      checkRun: c,
    });
  }

  return out.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
});

const filter = ref<"all" | "errors">("all");
const kindFilter = ref<"all" | EventKind>("all");
const filteredEvents = computed(() =>
  events.value.filter((e) => {
    if (filter.value === "errors" && e.level !== "error" && e.level !== "warn") return false;
    if (kindFilter.value !== "all" && e.kind !== kindFilter.value) return false;
    return true;
  }),
);

const runningCheck = computed<TaskCheckRun | undefined>(() =>
  (repo.taskChecks[props.task.id] ?? []).find((c) => c.running),
);

/** Ticks once a second while a check is running, so its elapsed timer counts
 *  up live instead of freezing until the next output chunk (mirrors
 *  TestRunPanel's own timer). */
const now = ref(Date.now());
let nowTimer: ReturnType<typeof setInterval> | undefined;
onMounted(() => {
  nowTimer = setInterval(() => {
    now.value = Date.now();
  }, 1000);
});
onUnmounted(() => clearInterval(nowTimer));
const runningElapsed = computed(() => {
  if (!runningCheck.value) return "";
  return fmtDuration(Math.max(0, now.value - Date.parse(runningCheck.value.startedAt)));
});

const logEl = ref<HTMLElement | null>(null);
const stick = ref(true);
function onLogScroll(): void {
  const el = logEl.value;
  if (!el) return;
  stick.value = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
}
watch(
  () => runningCheck.value?.output,
  () => {
    if (!stick.value) return;
    nextTick(() => {
      const el = logEl.value;
      if (el) el.scrollTop = el.scrollHeight;
    });
  },
);

const expanded = ref<Set<string>>(new Set());
function toggleExpanded(key: string): void {
  const next = new Set(expanded.value);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  expanded.value = next;
}
</script>

<template>
  <div class="debug-panel">
    <Card v-if="hasWorktree" class="debug-sync">
      <div class="debug-sync-head">
        <RefreshCw class="debug-sync-icon" :class="{ spinning: syncBusy }" />
        <div class="debug-sync-text">
          <span class="debug-sync-title">Sync with main</span>
          <span class="debug-sync-sub">
            Merge main into this task's branch to pick up fixes landed since it was cut.
          </span>
        </div>
        <Button
          variant="outline"
          size="sm"
          class="debug-sync-btn"
          :disabled="syncBusy"
          @click="syncWithMain"
        >
          {{ syncBusy ? "Syncing…" : "Sync now" }}
        </Button>
      </div>
      <p v-if="worktreeDirty" class="debug-sync-warn">
        This worktree has uncommitted changes — merging main may refuse or merge around your
        in-progress edits. Commit or stash first if you want a clean reconcile.
      </p>
    </Card>

    <Card v-if="runningCheck" class="debug-live">
      <div class="debug-live-head">
        <span class="debug-live-dot" />
        <span class="debug-live-title">{{ checkLabel(runningCheck.kind) }} running…</span>
        <span class="debug-live-elapsed">{{ runningElapsed }}</span>
      </div>
      <pre ref="logEl" class="debug-log" @scroll="onLogScroll">{{
        runningCheck.output || "…"
      }}</pre>
    </Card>

    <div class="debug-filters">
      <select v-model="kindFilter" class="debug-select">
        <option value="all">All events</option>
        <option value="activity">State changes</option>
        <option value="log">Logs</option>
        <option value="check">Checks</option>
      </select>
      <button
        type="button"
        class="debug-filter-btn"
        :class="{ active: filter === 'errors' }"
        @click="filter = filter === 'errors' ? 'all' : 'errors'"
      >
        <AlertTriangle class="debug-filter-icon" />
        Errors &amp; warnings only
      </button>
    </div>

    <div v-if="filteredEvents.length === 0" class="agent-empty">
      <p>No debug events yet.</p>
    </div>
    <div v-else class="debug-events">
      <div
        v-for="e in filteredEvents"
        :key="e.key"
        class="debug-event"
        :class="[
          `debug-level-${e.level}`,
          { 'debug-event-expandable': e.kind === 'check' || e.detail },
        ]"
        @click="e.kind === 'check' || e.detail ? toggleExpanded(e.key) : undefined"
      >
        <div class="debug-event-row">
          <component
            :is="
              e.kind === 'check' || e.detail
                ? expanded.has(e.key)
                  ? ChevronDown
                  : ChevronRight
                : 'span'
            "
            class="debug-event-chevron"
          />
          <span class="debug-event-kind">{{ e.kind }}</span>
          <span class="debug-event-title">{{ e.title }}</span>
          <span class="debug-event-time" :title="e.at">{{ relTime(e.at) }}</span>
        </div>
        <p v-if="e.failureSummary" class="debug-event-summary">{{ e.failureSummary }}</p>
        <pre
          v-if="expanded.has(e.key) && e.kind === 'check' && e.checkRun"
          class="debug-log debug-log-inline"
          >{{ e.checkRun.output || "(no output captured)" }}</pre>
        <pre v-else-if="expanded.has(e.key) && e.detail" class="debug-log debug-log-inline">{{
          e.detail
        }}</pre>
      </div>
    </div>
  </div>
</template>

<style scoped>
.debug-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.debug-sync {
  background: var(--panel-gradient, linear-gradient(180deg, #0c1222, #080c16));
  border: 1px solid var(--cyan-dim);
  border-radius: 12px;
  padding: 14px;
}
.debug-sync-head {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.debug-sync-icon {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  color: var(--cyan);
}
.debug-sync-icon.spinning {
  animation: debug-sync-spin 1s linear infinite;
}
@keyframes debug-sync-spin {
  to {
    transform: rotate(360deg);
  }
}
.debug-sync-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  min-width: 0;
}
.debug-sync-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--txt);
}
.debug-sync-sub {
  font-size: 11.5px;
  color: var(--txt-faint);
  line-height: 1.4;
}
.debug-sync-btn {
  flex-shrink: 0;
}
.debug-sync-warn {
  margin: 10px 0 0;
  font-size: 11.5px;
  line-height: 1.45;
  color: var(--yellow, #e6b450);
}

.debug-live {
  background: var(--panel-gradient, linear-gradient(180deg, #0c1222, #080c16));
  border: 1px solid var(--cyan-dim);
  border-radius: 12px;
  padding: 14px;
}
.debug-live-head {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.debug-live-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--cyan);
  box-shadow: 0 0 0 3px var(--cyan-dim);
  flex-shrink: 0;
}
.debug-live-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--cyan);
}
.debug-live-elapsed {
  margin-left: auto;
  font-family: "JetBrains Mono", ui-monospace, monospace;
  font-size: 12px;
  color: var(--txt-dim);
  font-variant-numeric: tabular-nums;
}

.debug-log {
  margin: 8px 0 0;
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
.debug-log-inline {
  max-height: 240px;
}

.debug-filters {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.debug-select {
  font-size: 12px;
  padding: 5px 8px;
  border-radius: 6px;
  border: 1px solid var(--border);
  background: var(--panel);
  color: var(--txt);
}
.debug-filter-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 11.5px;
  font-weight: 600;
  padding: 5px 10px;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: transparent;
  color: var(--txt-dim);
  cursor: pointer;
}
.debug-filter-btn.active {
  border-color: var(--red-border-tint, rgba(255, 107, 125, 0.4));
  background: var(--red-tint);
  color: var(--red);
}
.debug-filter-icon {
  width: 13px;
  height: 13px;
}

.debug-events {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.debug-event {
  border-radius: 8px;
  padding: 7px 9px;
  border-left: 2px solid transparent;
}
.debug-event-expandable {
  cursor: pointer;
}
.debug-event-expandable:hover {
  background: var(--chip-bg);
}
.debug-event-row {
  display: flex;
  align-items: center;
  gap: 7px;
  min-width: 0;
}
.debug-event-chevron {
  width: 13px;
  height: 13px;
  flex-shrink: 0;
  color: var(--txt-faint);
}
.debug-event-kind {
  flex-shrink: 0;
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--txt-faint);
  background: var(--chip-bg);
  border-radius: 4px;
  padding: 1px 5px;
}
.debug-event-title {
  flex: 1;
  min-width: 0;
  font-size: 12.5px;
  color: var(--txt);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.debug-event-time {
  flex-shrink: 0;
  font-size: 11px;
  color: var(--txt-faint);
  font-variant-numeric: tabular-nums;
}
.debug-event-summary {
  margin: 4px 0 0 20px;
  color: var(--txt-dim);
  font-family: "JetBrains Mono", ui-monospace, monospace;
  font-size: 11px;
  line-height: 1.45;
  overflow-wrap: anywhere;
}

.debug-level-warn {
  border-left-color: var(--yellow, #e6b450);
}
.debug-level-warn .debug-event-title {
  color: var(--yellow, #e6b450);
}
.debug-level-error {
  border-left-color: var(--red);
  background: var(--red-tint);
}
.debug-level-error .debug-event-title {
  color: var(--red);
  font-weight: 600;
}

@media (max-width: 560px) {
  .debug-event-title {
    white-space: normal;
  }
  .debug-event-time {
    display: none;
  }
}
</style>
