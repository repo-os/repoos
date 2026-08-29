<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useConfigStore } from "../stores/config";
import { api, JSON_OPTS } from "../api";
import Button from "./ui/button.vue";
import Switch from "./ui/switch.vue";
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
  cli: string;
  model: string;
  lastRunAt?: string;
  isRunning?: boolean;
}

// Effective defaults for a fresh install: only applied once the config meta has
// actually loaded. Seeding cli/model from these before `agentsMeta` resolves
// would persist a stub value the moment the user toggles anything, so `state`
// starts with empty cli/model and they're filled in below.
const defaultCli = computed(() => config.agentsMeta.clis[0] ?? "opencode");
const defaultModel = computed(() => config.agentsMeta.models[0] ?? "default");

const state = ref<BuiltInAgentState>({
  enabled: false,
  schedule: "manual",
  cli: "",
  model: "",
});

// Keeps the row in sync with persisted config: config.data may be empty when
// the component mounts, and another tab can change builtInAgents at any time.
// On first run there is no persisted entry, so cli/model stay empty until the
// user picks them (empty is never persisted); once the server has a value it is
// merged over local state on every change rather than initializing once.
watch(
  () => {
    const data = config.data as Record<string, unknown> | null;
    return data?.builtInAgents as Record<string, unknown> | undefined;
  },
  (agents) => {
    const persisted = agents?.[props.agent] as BuiltInAgentState | undefined;
    if (persisted) {
      state.value = {
        enabled: persisted.enabled ?? false,
        schedule: persisted.schedule ?? "manual",
        lastRunAt: persisted.lastRunAt,
        cli: persisted.cli || defaultCli.value,
        model: persisted.model || defaultModel.value,
      };
    }
  },
  { immediate: true, deep: true },
);

const cliOptions = computed(() => config.agentsMeta.clis ?? []);
const modelsFor = config.modelsFor;

const isRunning = ref(false);
const error = ref("");
const message = ref("");

const agentMeta = computed(() => {
  if (props.agent === "debugger") {
    return {
      name: "Debugger Agent",
      description:
        "Paste a bug, stack trace, or error and get a clear diagnosis — the root cause plus a suggested fix. Chat with him from his floating head next to Ross and the CTO.",
      icon: "🐞",
    };
  }
  if (props.agent === "tech-debt") {
    return {
      name: "Tech Debt Agent",
      description:
        "Scans your repository for technical debt patterns including outdated dependencies, code duplication, high-complexity files, unused code, and deprecated APIs. Creates tasks in your inbox for each issue found.",
      icon: "🔧",
    };
  }
  if (props.agent === "performance") {
    return {
      name: "Performance Agent",
      description:
        "Keeps your app fast by scanning for performance issues like slow functions, blocking operations, deeply nested loops, unbounded memory growth, and duplicate computations. Creates tasks in your inbox for each issue found.",
      icon: "⚡",
    };
  }
  if (props.agent === "architect") {
    return {
      name: "Architect Agent",
      description:
        "Analyzes your codebase architecture — detects tight coupling, missing abstractions, scalability risks, and over-engineering. Generates a detailed markdown report saved to docs/agents/Architect/ with recommendations.",
      icon: "🏛",
    };
  }
  if (props.agent === "design") {
    return {
      name: "Design Agent",
      description:
        "Reviews your web UI's quality — layout, styling consistency, accessibility, and interaction flows. Flags UI bugs and UX friction and proposes concrete fixes and design improvements, saved as a markdown report to docs/agents/Design/.",
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

// The value handed to the control: an empty cli/model (fresh install, nothing
// persisted yet) falls back to the effective default for display only, so the
// user sees a real label instead of a blank pair — but nothing is persisted
// until they explicitly choose.
const effectiveCli = computed(() => state.value.cli || defaultCli.value);
const effectiveModel = computed(() => state.value.model || defaultModel.value);

async function saveState(): Promise<void> {
  try {
    const data = config.data as Record<string, unknown> | null;
    const existing = (data?.builtInAgents as Record<string, unknown>) || {};
    // Never persist an empty cli/model — only values the user actually chose.
    const entry: Record<string, unknown> = {
      enabled: state.value.enabled,
      schedule: state.value.schedule,
    };
    if (state.value.lastRunAt) entry.lastRunAt = state.value.lastRunAt;
    if (state.value.cli) entry.cli = state.value.cli;
    if (state.value.model) entry.model = state.value.model;
    await api(
      "/api/config",
      JSON_OPTS("PATCH", {
        builtInAgents: {
          ...existing,
          [props.agent]: entry,
        },
      }),
    );
    const res = (await api("/api/config")) as Record<string, unknown>;
    config.data = res.config as Record<string, unknown>;
  } catch (err) {
    error.value = err instanceof Error ? err.message : "Failed to save configuration";
  }
}

function toggleEnabled(v: boolean): void {
  state.value.enabled = v;
  void saveState();
}

function onCliUpdate(v: string): void {
  state.value.cli = v;
  void saveState();
}

function onModelUpdate(v: string): void {
  state.value.model = v;
  void saveState();
}

async function updateSchedule(value: string | undefined): Promise<void> {
  if (value && (value === "daily" || value === "weekly" || value === "manual")) {
    state.value.schedule = value;
    await saveState();
  }
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
  <div v-if="agentMeta" class="agent-card" :class="{ off: !state.enabled }">
    <div class="agent-head">
      <div class="agent-title">
        <span class="agent-dot"></span>
        <span class="agent-name">{{ agentMeta.icon }} {{ agentMeta.name }}</span>
        <span class="agent-badge">built-in</span>
      </div>
      <Switch :checked="state.enabled" @update:checked="toggleEnabled" />
    </div>
    <div class="agent-body">
      <div class="agent-field">
        <label>Coding agent + Model</label>
        <AgentModelControl
          :cli-options="cliOptions"
          :model-options="modelsFor(effectiveCli, effectiveModel)"
          :cli="effectiveCli"
          :model="effectiveModel"
          @update:cli="onCliUpdate"
          @update:model="onModelUpdate"
        />
      </div>
      <div v-if="!interactive" class="agent-field">
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
      <div v-else class="agent-field">
        <label>Interaction</label>
        <div class="built-in-interactive-hint">
          <span class="built-in-interactive-dot"></span>
          Chat from floating head
        </div>
      </div>
      <div class="agent-field">
        <label>Actions</label>
        <div class="agent-test-actions">
          <Button
            variant="outline"
            size="sm"
            :disabled="isRunning || !state.enabled"
            @click="runNow"
          >
            {{ isRunning ? "Running…" : "Run now" }}
          </Button>
          <span v-if="state.lastRunAt" class="built-in-last-run"> Last: {{ lastRunDisplay }} </span>
        </div>
      </div>
      <div v-if="message || error" class="agent-field built-in-status-field">
        <div v-if="message" class="built-in-status success">{{ message }}</div>
        <div v-if="error" class="built-in-status error">{{ error }}</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.built-in-interactive-hint {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 12px;
  border: 1px dashed var(--border-bright);
  border-radius: 8px;
  color: var(--txt-secondary);
  font-size: 12.5px;
  line-height: 1.4;
}

.built-in-interactive-dot {
  flex: none;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--green);
  box-shadow: 0 0 8px var(--green);
}

.built-in-last-run {
  font-size: 11px;
  color: var(--txt-faint);
  font-family: "JetBrains Mono", monospace;
}

.built-in-status-field {
  grid-column: 1 / -1;
}

.built-in-status {
  margin-top: 4px;
  padding: 8px 12px;
  border-radius: 4px;
  font-size: 12px;
  line-height: 1.3;
}

.built-in-status.success {
  background: rgba(34, 197, 94, 0.1);
  color: var(--green);
}

.built-in-status.error {
  background: rgba(239, 68, 68, 0.1);
  color: var(--red);
}
</style>
