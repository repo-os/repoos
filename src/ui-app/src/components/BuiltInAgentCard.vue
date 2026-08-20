<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useConfigStore } from "../stores/config";
import { api, JSON_OPTS } from "../api";
import Button from "./ui/button.vue";
import Select from "./ui/select/root.vue";
import SelectContent from "./ui/select/content.vue";
import SelectItem from "./ui/select/item.vue";
import SelectTrigger from "./ui/select/trigger.vue";
import SelectValue from "./ui/select/value.vue";
import SelectViewport from "./ui/select/viewport.vue";
import AgentModelControl from "./AgentModelControl.vue";

interface Props {
  agent: string;
  /** Chat-style agent: hide the schedule / run-now block; interaction happens via its floating head. */
  interactive?: boolean;
}

const props = defineProps<Props>();
const config = useConfigStore();

type Schedule = "daily" | "weekly" | "manual";

interface BuiltInAgentState {
  enabled: boolean;
  schedule: Schedule;
  lastRunAt?: string;
  isRunning?: boolean;
  cli?: string;
  model?: string;
  instructions?: string;
}

const defaultState: BuiltInAgentState = {
  enabled: false,
  schedule: "manual",
};

const state = ref<BuiltInAgentState>({ ...defaultState });

// Keeps the card in sync with persisted config: config.data may be empty when
// the component mounts, and another tab can change builtInAgents at any time.
// Merge the server's value over local state on every change rather than
// initializing once (stale-state fix from review).
watch(
  () => {
    const data = config.data as Record<string, unknown> | null;
    return data?.builtInAgents as Record<string, unknown> | undefined;
  },
  (agents) => {
    const persisted = agents?.[props.agent] as BuiltInAgentState | undefined;
    if (persisted) state.value = { ...defaultState, ...persisted };
  },
  { immediate: true, deep: true },
);

const isRunning = ref(false);
const error = ref("");
const message = ref("");

const agentMeta = computed(() => {
  if (props.agent === "debugger") {
    return {
      name: "Debugger Agent",
      description: "Paste a bug, stack trace, or error and get a clear diagnosis — the root cause plus a suggested fix. Chat with him from his floating head next to Ross and the CTO.",
      icon: "🐞",
    };
  }
  if (props.agent === "tech-debt") {
    return {
      name: "Tech Debt Agent",
      description: "Scans your repository for technical debt patterns including outdated dependencies, code duplication, high-complexity files, unused code, and deprecated APIs. Creates tasks in your inbox for each issue found.",
      icon: "🔧",
    };
  }
  if (props.agent === "performance") {
    return {
      name: "Performance Agent",
      description: "Keeps your app fast by scanning for performance issues like slow functions, blocking operations, deeply nested loops, unbounded memory growth, and duplicate computations. Creates tasks in your inbox for each issue found.",
      icon: "⚡",
    };
  }
  if (props.agent === "architect") {
    return {
      name: "Architect Agent",
      description: "Analyzes your codebase architecture — detects tight coupling, missing abstractions, scalability risks, and over-engineering. Generates a detailed markdown report saved to docs/agents/Architect/ with recommendations.",
      icon: "🏛",
    };
  }
  if (props.agent === "design") {
    return {
      name: "Design Agent",
      description: "Reviews your web UI's quality — layout, styling consistency, accessibility, and interaction flows. Flags UI bugs and UX friction and proposes concrete fixes and design improvements, saved as a markdown report to docs/agents/Design/.",
      icon: "🎨",
    };
  }
  return null;
});

const lastRunDisplay = computed(() => {
  if (!state.value.lastRunAt) return "Never";
  const date = new Date(state.value.lastRunAt);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
});

const cliOptions = computed(() => config.agentsMeta.clis ?? []);
const modelOptions = computed(() => config.modelsFor(state.value.cli ?? "opencode", state.value.model));

async function saveState(): Promise<void> {
  try {
    const data = config.data as Record<string, unknown> | null;
    const existing = (data?.builtInAgents as Record<string, unknown>) || {};
    await api("/api/config", JSON_OPTS("PATCH", {
      builtInAgents: {
        ...existing,
        [props.agent]: state.value,
      },
    }));
    const res = (await api("/api/config")) as Record<string, unknown>;
    config.data = res.config as Record<string, unknown>;
  } catch (err) {
    error.value = err instanceof Error ? err.message : "Failed to save configuration";
  }
}

function toggleEnabled(): void {
  state.value.enabled = !state.value.enabled;
  void saveState();
}

async function updateSchedule(value: string | undefined): Promise<void> {
  if (value && (value === "daily" || value === "weekly" || value === "manual")) {
    state.value.schedule = value;
    await saveState();
  }
}

function updateCli(v: string): void {
  state.value.cli = v;
  void saveState();
}

function updateModel(v: string): void {
  state.value.model = v;
  void saveState();
}

async function runNow(): Promise<void> {
  if (isRunning.value) return;
  isRunning.value = true;
  error.value = "";
  message.value = "";
  try {
    const response = (await api(
      `/api/agents/built-in/${props.agent}/run`,
      JSON_OPTS("POST", {}),
    )) as {
      ok: boolean;
      taskCount: number;
      failed?: number;
      errors?: string[];
      issuesFound?: number;
      findingsFound?: number;
      scannedFiles?: number;
    };
    if (response.ok) {
      state.value.lastRunAt = new Date().toISOString();
      if (response.failed && response.failed > 0) {
        error.value = `${response.taskCount} task(s) created, ${response.failed} failed — ${
          (response.errors ?? []).join("; ") || "unknown write error"
        }`;
      } else if (props.agent === "design") {
        message.value = `Review complete — ${response.findingsFound ?? 0} design finding(s) found (${response.scannedFiles ?? 0} files scanned). Report saved to docs/agents/Design/.`;
      } else if (props.agent === "architect") {
        message.value = `Review complete — ${response.issuesFound ?? 0} architecture issue(s) found (${response.scannedFiles ?? 0} files scanned). Report saved to docs/agents/Architect/.`;
      } else if (response.taskCount > 0) {
        const agentType = props.agent === "performance" ? "performance" : "tech debt";
        message.value = `Scan complete — ${response.taskCount} ${agentType} task(s) created from ${response.issuesFound ?? 0} issue(s).`;
      } else {
        const agentType = props.agent === "performance" ? "performance" : "tech debt";
        message.value = `Scan complete — no ${agentType} issues found (${response.scannedFiles ?? 0} files scanned).`;
      }
      await saveState();
    } else {
      error.value = "Failed to run agent";
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : "Failed to run agent";
  } finally {
    isRunning.value = false;
  }
}
</script>

<template>
  <div v-if="agentMeta" class="built-in-agent-card">
    <div class="agent-card-head">
      <div class="agent-info">
        <span class="agent-icon">{{ agentMeta.icon }}</span>
        <div>
          <div class="agent-name">{{ agentMeta.name }}</div>
          <div class="agent-status">
            <span v-if="state.enabled" class="status-badge enabled">Enabled</span>
            <span v-else class="status-badge">Disabled</span>
            <span v-if="state.lastRunAt" class="last-run">
              Last run: {{ lastRunDisplay }}
            </span>
          </div>
        </div>
      </div>
      <Button
        variant="ghost"
        size="sm"
        :class="{ 'toggle-on': state.enabled }"
        @click="toggleEnabled"
      >
        {{ state.enabled ? "Disable" : "Enable" }}
      </Button>
    </div>

    <div class="agent-desc">{{ agentMeta.description }}</div>

    <div v-if="state.enabled" class="agent-config">
      <div v-if="interactive" class="interactive-hint">
        <span class="interactive-dot"></span>
        Chat with the {{ agentMeta.name }} from his floating head.
      </div>
      <template v-else>
        <div v-if="props.agent !== 'debugger'" class="config-field">
          <label>Coding agent + Model</label>
          <AgentModelControl
            :cli-options="cliOptions"
            :model-options="modelOptions"
            :cli="state.cli ?? 'opencode'"
            :model="state.model ?? 'default'"
            @update:cli="updateCli"
            @update:model="updateModel"
          />
          <div class="config-hint">
            Optional — when set, the agent runs AI-powered analysis via this CLI after the deterministic scan.
          </div>
        </div>

        <div class="config-field">
          <label>Run schedule</label>
          <Select :model-value="state.schedule" @update:model-value="updateSchedule">
            <SelectTrigger class="h-[34px] w-full rounded-[9px] px-[11px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper">
              <SelectViewport class="min-w-[var(--radix-select-trigger-width)]">
                <SelectItem value="daily">Daily</SelectItem>
                <SelectItem value="weekly">Weekly</SelectItem>
                <SelectItem value="manual">Manual only</SelectItem>
              </SelectViewport>
            </SelectContent>
          </Select>
        </div>

        <div class="config-actions">
          <Button
            variant="outline"
            size="sm"
            :disabled="isRunning"
            @click="runNow"
          >
            {{ isRunning ? "Running…" : "Run now" }}
          </Button>
        </div>

        <div v-if="message" class="status-message success">{{ message }}</div>
        <div v-if="error" class="status-message error">{{ error }}</div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.built-in-agent-card {
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 12px;
  margin: 8px 0;
  background: var(--bg-secondary);
}

.agent-card-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 12px;
}

.agent-info {
  display: flex;
  gap: 12px;
  flex: 1;
}

.agent-icon {
  font-size: 24px;
  line-height: 1.5;
}

.agent-name {
  font-weight: 600;
  color: var(--text-primary);
}

.agent-status {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-top: 4px;
  font-size: 12px;
}

.status-badge {
  padding: 2px 6px;
  border-radius: 4px;
  background: var(--bg-tertiary);
  color: var(--text-secondary);
}

.status-badge.enabled {
  background: var(--green);
  color: white;
}

.last-run {
  color: var(--text-tertiary);
  font-size: 11px;
}

.agent-desc {
  margin-bottom: 12px;
  color: var(--text-secondary);
  font-size: 13px;
  line-height: 1.4;
}

.agent-config {
  border-top: 1px solid var(--border);
  padding-top: 12px;
}

.config-field {
  margin-bottom: 12px;
}

.config-field label {
  display: block;
  font-size: 12px;
  font-weight: 500;
  margin-bottom: 6px;
  color: var(--text-secondary);
}

.config-hint {
  margin-top: 4px;
  font-size: 11px;
  color: var(--text-tertiary);
  line-height: 1.3;
}

.interactive-hint {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 12px;
  border: 1px dashed var(--border-bright);
  border-radius: 8px;
  color: var(--text-secondary);
  font-size: 12.5px;
  line-height: 1.4;
}

.interactive-dot {
  flex: none;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--green);
  box-shadow: 0 0 8px var(--green);
}

.config-actions {
  display: flex;
  gap: 8px;
}

.status-message {
  margin-top: 10px;
  padding: 8px 12px;
  border-radius: 4px;
  font-size: 12px;
  line-height: 1.3;
}

.status-message.success {
  background: rgba(34, 197, 94, 0.1);
  color: var(--green);
}

.status-message.error {
  background: rgba(239, 68, 68, 0.1);
  color: var(--red);
}

.toggle-on {
  color: var(--green);
}
</style>
