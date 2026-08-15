<script setup lang="ts">
import { computed, onMounted } from "vue";
import { storeToRefs } from "pinia";
import { useRepoStore } from "../stores/repo";
import Card from "./ui/card.vue";
import type { AutoEngineeringDecision } from "../types";

const repo = useRepoStore();
const { autoEng } = storeToRefs(repo);

onMounted(() => {
  void repo.refreshAutoEng();
});

const enabled = computed(() => autoEng.value?.enabled ?? false);
const maxActiveTasks = computed(() => autoEng.value?.maxActiveTasks ?? 3);
const activeCount = computed(() => autoEng.value?.activeCount ?? 0);
const openSlots = computed(() => autoEng.value?.availableSlots ?? 0);
const reconciling = computed(() => autoEng.value?.reconciling ?? false);
const decision = computed<AutoEngineeringDecision | null>(() => autoEng.value?.decision ?? null);

const statusChip = computed(() => {
  if (!enabled.value) return { text: "Off", cls: "off" };
  if (reconciling.value) return { text: "Deciding…", cls: "busy" };
  if (!decision.value) return { text: "Idle", cls: "idle" };
  switch (decision.value.outcome) {
    case "selected":
      return { text: "Started " + decision.value.selectedIds.length, cls: "ok" };
    case "no-ready-work":
      return { text: "Waiting for ready tasks", cls: "warn" };
    case "no-capacity":
      return { text: "At capacity", cls: "idle" };
    case "pm-unavailable":
      return { text: "PM unavailable", cls: "err" };
    case "pm-failed":
      return { text: "PM failed", cls: "err" };
    default:
      return { text: "Idle", cls: "idle" };
  }
});

const statusLine = computed(() => {
  const d = decision.value;
  if (!enabled.value) return "Automatic task selection is off. Enable it in Settings.";
  if (reconciling.value) return "Asking the PM agent which ready tasks should start…";
  if (!d) return "No decision recorded yet — it will appear here after the first transition.";
  switch (d.outcome) {
    case "selected":
      return d.rationale
        ? `Started ${d.selectedIds.length} task${d.selectedIds.length === 1 ? "" : "s"} (${d.selectedIds.map((id) => `#${id}`).join(", ")}). ${d.rationale}`
        : `Started ${d.selectedIds.length} task${d.selectedIds.length === 1 ? "" : "s"} (${d.selectedIds.map((id) => `#${id}`).join(", ")}).`;
    case "no-capacity":
      return `All ${d.maxActiveTasks} engineer slot${d.maxActiveTasks === 1 ? "" : "s"} are full.`;
    case "no-ready-work":
      return "Capacity is open but there are no ready tasks — add or promote work to let auto-engineering start it.";
    case "pm-unavailable":
      return "No PM agent is configured, so nothing was started. Configure one on the Agents page.";
    case "pm-failed":
      return d.error ? `The PM agent failed: ${d.error}` : "The PM agent run failed, so nothing was started.";
    default:
      return "";
  }
});

function fmtTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString();
  } catch {
    return iso;
  }
}

function triggerLabel(t: AutoEngineeringDecision["trigger"]): string {
  switch (t) {
    case "active-to-review":
      return "task moved to review";
    case "inbox-to-ready":
      return "task moved to ready";
    case "config-change":
      return "settings changed";
    case "startup":
      return "server start";
    default:
      return t;
  }
}
</script>

<template>
  <Card class="ae-panel" style="margin-bottom: 16px">
    <div class="panel-title">
      Auto-engineering
      <span class="chip" :class="statusChip.cls">{{ statusChip.text }}</span>
    </div>

    <div v-if="!enabled" class="off-note">
      Automatic task selection is <b>off</b>. Turn it on in
      <router-link to="/settings" class="link">Settings</router-link> to keep engineer slots
      filled automatically.
    </div>

    <div v-else>
      <div class="headlines">
        <div class="metric">
          <div class="metric-label">Maximum active</div>
          <div class="metric-val">
            <span class="metric-big">{{ maxActiveTasks }}</span>
            <span class="metric-sub">slots</span>
          </div>
        </div>
        <div class="metric">
          <div class="metric-label">Active now</div>
          <div class="metric-val">
            <span class="metric-big" :class="{ full: activeCount >= maxActiveTasks }">{{ activeCount }}</span>
            <span class="metric-sub">in progress</span>
          </div>
        </div>
        <div class="metric">
          <div class="metric-label">Open slots</div>
          <div class="metric-val">
            <span class="metric-big" :class="{ free: openSlots > 0 }">{{ openSlots }}</span>
            <span class="metric-sub">available</span>
          </div>
        </div>
      </div>

      <div class="status-line" :class="{ warn: decision?.outcome === 'no-ready-work', err: decision?.outcome === 'pm-unavailable' || decision?.outcome === 'pm-failed' }">
        {{ statusLine }}
      </div>

      <div v-if="decision" class="decision-meta">
        <span>Last check {{ fmtTime(decision.timestamp) }}</span>
        <span>·</span>
        <span>triggered by {{ triggerLabel(decision.trigger) }}</span>
        <span>·</span>
        <span>{{ decision.candidateIds.length }} ready candidate{{ decision.candidateIds.length === 1 ? "" : "s" }}</span>
      </div>
    </div>
  </Card>
</template>

<style scoped>
.ae-panel {
  padding: 16px;
}

.panel-title {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--txt-dim);
  margin-bottom: 14px;
}

.chip {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.02em;
  text-transform: none;
  padding: 2px 9px;
  border-radius: 999px;
}

.chip.ok {
  background: var(--green-tint);
  color: var(--green);
}

.chip.warn {
  background: var(--amber-tint);
  color: var(--amber);
}

.chip.idle {
  background: var(--chip-bg, rgba(138, 150, 180, 0.12));
  color: var(--txt-dim);
}

.chip.err {
  background: rgba(255, 92, 92, 0.14);
  color: #ff7a7a;
}

.chip.off {
  background: var(--chip-bg, rgba(138, 150, 180, 0.12));
  color: var(--txt-faint);
}

.chip.busy {
  background: var(--cyan-dim);
  color: var(--cyan);
}

.headlines {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
  margin-bottom: 12px;
}

.metric {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.metric-label {
  font-size: 11px;
  color: var(--txt-faint);
}

.metric-val {
  display: flex;
  align-items: baseline;
  gap: 6px;
}

.metric-big {
  font-size: 26px;
  font-weight: 700;
  line-height: 1;
  font-variant-numeric: tabular-nums;
}

.metric-big.full {
  color: var(--amber);
}

.metric-big.free {
  color: var(--green);
}

.metric-sub {
  font-size: 12px;
  color: var(--txt-dim);
}

.status-line {
  font-size: 13px;
  color: var(--txt-dim);
  background: var(--chip-bg, rgba(138, 150, 180, 0.1));
  border-radius: 9px;
  padding: 10px 12px;
}

.status-line.warn {
  background: var(--amber-tint);
  color: var(--amber);
}

.status-line.err {
  background: rgba(255, 92, 92, 0.1);
  color: #ff9a9a;
}

.decision-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 10px;
  font-size: 11px;
  color: var(--txt-faint);
}

.off-note {
  font-size: 13px;
  color: var(--txt-dim);
}

.link {
  color: var(--cyan);
}
</style>
