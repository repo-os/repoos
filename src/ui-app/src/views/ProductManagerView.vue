<script setup lang="ts">
import { computed, nextTick, ref, watch, onMounted } from "vue";
import { ChevronDown } from "lucide-vue-next";
import { api, JSON_OPTS } from "../api";
import { renderMarkdown } from "../lib/markdown";
import { useRepoStore } from "../stores/repo";
import { useConfigStore } from "../stores/config";
import { useAuthStore } from "../stores/auth";
import type { Task, Agent, AgentOutputEntry } from "../types";
import Select from "../components/ui/select/root.vue";
import SelectContent from "../components/ui/select/content.vue";
import SelectItem from "../components/ui/select/item.vue";
import SelectTrigger from "../components/ui/select/trigger.vue";
import SelectValue from "../components/ui/select/value.vue";
import SelectViewport from "../components/ui/select/viewport.vue";
import AgentModelControl from "../components/AgentModelControl.vue";
import VoiceDictate from "../components/VoiceDictate.vue";
import { insertTextAtCursor } from "../utils/text-insertion";

const repo = useRepoStore();
const config = useConfigStore();
const auth = useAuthStore();

const selectedTaskId = ref<string | null>(null);
const draft = ref("");
const submitting = ref(false);
const log = ref<HTMLElement | null>(null);
const draftTextarea = ref<HTMLTextAreaElement | null>(null);
const pmAgentOverride = ref<string | null>(null);
const pmCliOverride = ref<string | null>(null);
const pmModelOverride = ref<string | null>(null);
const showAgentConfig = ref(false);

// Per-user PM session when auth is on (0248), so teammates sharing one
// instance each get their own PM conversation per task instead of reading
// and posting into the same thread. Matches the server's pmMessage route.
function pmSessionId(taskId: string): string {
  return auth.email ? `pm-task-v2:${taskId}::${auth.email}` : `pm-task-v2:${taskId}`;
}

const tasks = computed(() => repo.tasks);

const selectedTask = computed(() =>
  selectedTaskId.value
    ? tasks.value.find((t) => t.id === selectedTaskId.value)
    : null
);

const pmAgent = computed(() =>
  config.agents.find((a) => a.name.toLowerCase() === "pm") ?? null
);

const enabled = computed(() => pmAgent.value?.enabled ?? false);

const availableAgents = computed(() =>
  config.agents.filter((a) => a.enabled).map((a) => ({ value: a.name, label: a.name }))
);

const effectiveAgent = computed(() => pmAgentOverride.value || pmAgent.value?.name || "pm");
const effectiveCli = computed(() => pmCliOverride.value || pmAgent.value?.cli || "");
const effectiveModel = computed(() => pmModelOverride.value || pmAgent.value?.model || "");

const availableModels = computed(() => {
  const cli = effectiveCli.value;
  if (!cli) return [];
  return config.modelsFor(cli, effectiveModel.value);
});

const lines = computed(() => {
  if (!selectedTaskId.value) return [];
  return repo.outputs[pmSessionId(selectedTaskId.value)] ?? [];
});

const busy = computed(
  () =>
    submitting.value ||
    (selectedTaskId.value && repo.runningIds.includes(pmSessionId(selectedTaskId.value)))
);

const hasConversation = computed(() => lines.value.length > 0);

function lineKind(entry: AgentOutputEntry): "human" | "assistant" | "status" | "hidden" {
  if ("type" in entry) {
    if (entry.type === "human") return "human";
    if (entry.type === "text") return "assistant";
    if (entry.type === "step") return "hidden";
    return "status";
  }
  return entry.s === "out" ? "assistant" : "status";
}

function lineText(entry: AgentOutputEntry): string {
  if ("type" in entry) {
    if (entry.type === "human" || entry.type === "text") return entry.text;
    if (entry.type === "sys") return entry.d;
    if (entry.type === "tool") {
      const state = entry.state ? ` · ${entry.state}` : "";
      return `Checked with ${entry.tool}${state}`;
    }
    return "";
  }
  return entry.d;
}

function scrollToLatest(): void {
  nextTick(() => {
    if (log.value) log.value.scrollTop = log.value.scrollHeight;
  });
}

watch(() => lines.value.length, () => {
  scrollToLatest();
});

async function send(): Promise<void> {
  const text = draft.value.trim();
  if (!text || busy.value || !enabled.value || !selectedTaskId.value) return;

  submitting.value = true;
  const optimistic: AgentOutputEntry = { type: "human", text };
  const sessionId = pmSessionId(selectedTaskId.value);
  const optimisticIndex = (repo.outputs[sessionId] ?? []).length;
  repo.outputs[sessionId] = [...(repo.outputs[sessionId] ?? []), optimistic];
  draft.value = "";
  scrollToLatest();

  try {
    const payload: Record<string, unknown> = { text };
    if (pmAgentOverride.value) payload.agentOverride = pmAgentOverride.value;
    if (pmCliOverride.value) payload.cliOverride = pmCliOverride.value;
    if (pmModelOverride.value) payload.modelOverride = pmModelOverride.value;

    await api(
      `/api/tasks/${selectedTaskId.value}/pm/message`,
      JSON_OPTS("POST", payload)
    );
  } catch (error) {
    repo.outputs[sessionId] = (repo.outputs[sessionId] ?? []).filter(
      (_entry, index) => index !== optimisticIndex
    );
    draft.value = text;
    repo.outputs[sessionId] = [
      ...(repo.outputs[sessionId] ?? []),
      { type: "sys", d: error instanceof Error ? error.message : String(error) },
    ];
    repo.onError(error);
  } finally {
    submitting.value = false;
  }
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key !== "Enter" || event.shiftKey) return;
  event.preventDefault();
  void send();
}

function onDraftTranscribed(text: string): void {
  if (draftTextarea.value) {
    insertTextAtCursor(draftTextarea.value, text);
  }
}

watch(selectedTaskId, () => {
  if (!selectedTaskId.value) return;
  void repo.loadOutput(pmSessionId(selectedTaskId.value)).then(scrollToLatest);
});

onMounted(() => {
  if (tasks.value.length > 0 && !selectedTaskId.value) {
    selectedTaskId.value = tasks.value[0].id;
  }
  if (selectedTaskId.value) {
    void repo.loadOutput(pmSessionId(selectedTaskId.value)).then(scrollToLatest);
  }
});
</script>

<template>
  <div class="pm-view">
    <div class="pm-sidebar">
      <div class="pm-sidebar-header">
        <h2>Product Manager</h2>
        <p class="pm-sidebar-subtitle">Chat and edit tasks with AI</p>
      </div>
      <div class="pm-task-list">
        <div
          v-for="task in tasks"
          :key="task.id"
          class="pm-task-item"
          :class="{ 'pm-task-item-active': task.id === selectedTaskId }"
          @click="selectedTaskId = task.id"
        >
          <div class="pm-task-id">#{{ task.id }}</div>
          <div class="pm-task-title">{{ task.title }}</div>
          <div class="pm-task-status">{{ task.status }}</div>
        </div>
      </div>
    </div>

    <div class="pm-panel">
      <div v-if="!selectedTask" class="pm-empty">
        <p>Select a task to start chatting with the PM</p>
      </div>
      <template v-else>
        <header class="pm-header">
          <div class="pm-task-info">
            <div class="pm-title-line">
              <strong>#{{ selectedTask.id }}: {{ selectedTask.title }}</strong>
            </div>
            <div class="pm-status-line">
              <span class="pm-status-badge" :class="`pm-status-${selectedTask.status}`">
                {{ selectedTask.status }}
              </span>
              <span class="pm-agent-name">{{ pmAgent?.name ?? "PM" }}</span>
              <button
                class="pm-config-toggle"
                :class="{ 'pm-config-toggle-open': showAgentConfig }"
                @click="showAgentConfig = !showAgentConfig"
                title="Agent configuration"
              >
                <ChevronDown :size="16" />
              </button>
            </div>
          </div>
          <div v-if="showAgentConfig" class="pm-agent-config">
            <div class="pm-config-row">
              <label>Agent</label>
              <Select :model-value="pmAgentOverride ?? ''" @update:model-value="(v) => (pmAgentOverride = v || null)">
                <SelectTrigger class="pm-select">
                  <SelectValue :placeholder="effectiveAgent" />
                </SelectTrigger>
                <SelectContent>
                  <SelectViewport>
                    <SelectItem v-for="agent in availableAgents" :key="agent.value" :value="agent.value">
                      {{ agent.label }}
                    </SelectItem>
                  </SelectViewport>
                </SelectContent>
              </Select>
            </div>
            <div class="pm-config-row">
              <label>Coding Agent + Model</label>
              <AgentModelControl
                :cli-options="config.agentsMeta?.clis ?? []"
                :model-options="availableModels"
                :cli="effectiveCli"
                :model="effectiveModel"
                @update:cli="(v) => (pmCliOverride = v)"
                @update:model="(v) => (pmModelOverride = v)"
              />
            </div>
          </div>
        </header>

        <div ref="log" class="pm-log" role="log" aria-live="polite">
          <div v-if="!hasConversation" class="pm-welcome">
            <div class="pm-welcome-icon">PM</div>
            <strong>Chat about this task</strong>
            <p>Ask the PM to edit the task, suggest changes, or discuss progress.</p>
          </div>
          <template v-for="(entry, index) in lines" :key="index">
            <div v-if="lineKind(entry) !== 'hidden'" class="pm-row" :class="`pm-row-${lineKind(entry)}`">
              <div v-if="lineKind(entry) === 'assistant'" class="pm-mini-avatar">PM</div>
              <div class="pm-bubble" :class="`pm-bubble-${lineKind(entry)}`">
                <div v-if="lineKind(entry) === 'assistant'" class="pm-markdown" v-html="renderMarkdown(lineText(entry))"></div>
                <span v-else>{{ lineText(entry) }}</span>
              </div>
            </div>
          </template>
          <div v-if="busy" class="pm-thinking" aria-label="PM is thinking">
            <span></span><span></span><span></span>
          </div>
        </div>

        <form class="pm-compose" @submit.prevent="send">
          <textarea
            ref="draftTextarea"
            v-model="draft"
            rows="1"
            :disabled="!enabled"
            :placeholder="enabled ? 'Ask PM to edit this task…' : 'Enable PM agent on Agents page'"
            aria-label="Message PM"
            @keydown="onKeydown"
          ></textarea>
          <VoiceDictate :disabled="!enabled" @transcribed="onDraftTranscribed" />
          <button type="submit" :disabled="!draft.trim() || busy || !enabled" aria-label="Send message">
            <svg viewBox="0 0 20 20" fill="none"><path d="m3 9 13-6-5.5 14-2-5.5L3 9Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" /><path d="m8.5 11.5 3-3" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" /></svg>
          </button>
        </form>
      </template>
    </div>
  </div>
</template>

<style scoped>
.pm-view {
  display: flex;
  height: 100%;
  min-height: 0;
  gap: 0;
  background: var(--panel);
}

.pm-sidebar {
  width: 280px;
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--border);
  background: var(--panel-solid);
  overflow: hidden;
}

.pm-sidebar-header {
  padding: 16px;
  border-bottom: 1px solid var(--border);
}

.pm-sidebar-header h2 {
  margin: 0 0 4px;
  font-size: 16px;
  font-weight: 600;
}

.pm-sidebar-subtitle {
  margin: 0;
  font-size: 11px;
  color: var(--txt-dim);
  font-weight: 500;
}

.pm-task-list {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 6px;
}

.pm-task-item {
  padding: 10px 12px;
  border-radius: 8px;
  background: transparent;
  cursor: pointer;
  border: 1px solid transparent;
  transition: background-color 0.15s, border-color 0.15s;
}

.pm-task-item:hover {
  background: var(--nav-hover-bg);
}

.pm-task-item-active {
  background: var(--btn-primary-bg);
  border-color: var(--border-bright);
}

.pm-task-id {
  font-size: 10px;
  font-weight: 700;
  color: var(--txt-dim);
  letter-spacing: 0.05em;
  margin-bottom: 3px;
}

.pm-task-title {
  font-size: 12px;
  font-weight: 500;
  color: var(--txt);
  margin-bottom: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pm-task-status {
  font-size: 10px;
  color: var(--txt-faint);
}

.pm-panel {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.pm-empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--txt-dim);
  font-size: 14px;
}

.pm-header {
  padding: 14px 16px;
  border-bottom: 1px solid var(--border);
  background: var(--topbar-bg);
}

.pm-task-info {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.pm-title-line {
  font-size: 13px;
}

.pm-title-line strong {
  color: var(--txt);
}

.pm-status-line {
  display: flex;
  align-items: center;
  gap: 8px;
}

.pm-status-badge {
  font-size: 10px;
  font-weight: 600;
  padding: 2px 6px;
  border-radius: 4px;
  background: var(--txt-faint-dim);
  color: var(--txt-dim);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.pm-status-badge.pm-status-draft {
  background: var(--txt-faint-dim);
}

.pm-status-badge.pm-status-inbox {
  background: var(--txt-faint-dim);
}

.pm-status-badge.pm-status-ready {
  background: var(--blue-dim);
  color: var(--blue);
}

.pm-status-badge.pm-status-active {
  background: var(--green-dim);
  color: var(--green);
}

.pm-status-badge.pm-status-review {
  background: var(--violet-dim);
  color: var(--violet);
}

.pm-status-badge.pm-status-done {
  background: var(--cyan-dim);
  color: var(--cyan);
}

.pm-agent-name {
  font-size: 11px;
  color: var(--txt-dim);
  font-weight: 500;
}

.pm-config-toggle {
  width: 24px;
  height: 24px;
  display: grid;
  place-items: center;
  border: none;
  background: transparent;
  color: var(--txt-dim);
  cursor: pointer;
  border-radius: 4px;
  transition: background-color 0.15s, color 0.15s;
}

.pm-config-toggle:hover {
  background: var(--nav-hover-bg);
  color: var(--txt);
}

.pm-config-toggle-open {
  transform: rotate(180deg);
}

.pm-agent-config {
  margin-top: 10px;
  padding: 10px;
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.pm-config-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.pm-config-row label {
  font-size: 11px;
  font-weight: 600;
  color: var(--txt-dim);
  width: 50px;
  flex: none;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.pm-select {
  flex: 1;
  height: 28px;
  font-size: 11px;
}

.pm-log {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 11px;
  padding: 16px 14px;
  overscroll-behavior: contain;
}

.pm-welcome {
  margin: auto 0;
  text-align: center;
  padding: 22px 12px;
  color: var(--txt-dim);
}

.pm-welcome-icon {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  margin: 0 auto 12px;
  font-size: 16px;
  font-weight: 800;
  border-radius: 10px;
  color: var(--violet);
  background: var(--violet-dim);
  border: 1px solid var(--border);
}

.pm-welcome strong {
  display: block;
  color: var(--txt);
  font-size: 14px;
  margin-bottom: 6px;
}

.pm-welcome p {
  font-size: 11.5px;
  line-height: 1.55;
  max-width: 280px;
  margin: 0 auto;
}

.pm-row {
  display: flex;
  align-items: flex-end;
  gap: 7px;
}

.pm-row-human {
  justify-content: flex-end;
}

.pm-mini-avatar {
  width: 24px;
  height: 24px;
  flex: none;
  border-radius: 8px;
  font-size: 9px;
  font-weight: 800;
  display: grid;
  place-items: center;
  color: var(--violet);
  background: var(--violet-dim);
  border: 1px solid var(--border);
}

.pm-bubble {
  max-width: 84%;
  padding: 9px 11px;
  border-radius: 13px;
  font-size: 12px;
  line-height: 1.55;
  overflow-wrap: anywhere;
}

.pm-bubble-human {
  color: var(--btn-primary-color);
  background: var(--btn-primary-bg);
  border: 1px solid var(--border-bright);
  border-bottom-right-radius: 4px;
}

.pm-bubble-assistant {
  color: var(--txt);
  background: var(--panel);
  border: 1px solid var(--border);
  border-bottom-left-radius: 4px;
}

.pm-row-status {
  justify-content: center;
}

.pm-bubble-status {
  padding: 4px 8px;
  background: transparent;
  color: var(--txt-faint);
  font: 500 9.5px 'JetBrains Mono', monospace;
  text-align: center;
}

.pm-markdown :deep(p) {
  margin: 0 0 7px;
}

.pm-markdown :deep(p:last-child) {
  margin-bottom: 0;
}

.pm-markdown :deep(ul),
.pm-markdown :deep(ol) {
  padding-left: 17px;
  margin: 5px 0;
}

.pm-markdown :deep(code) {
  font: 10.5px 'JetBrains Mono', monospace;
  background: var(--md-body-bg);
  border-radius: 4px;
  padding: 1px 4px;
}

.pm-markdown :deep(pre) {
  overflow: auto;
  margin: 7px 0;
  padding: 8px;
  background: var(--md-body-bg);
  border-radius: 7px;
}

.pm-markdown :deep(pre code) {
  padding: 0;
  background: none;
}

.pm-markdown :deep(a) {
  color: var(--cyan);
}

.pm-thinking {
  display: flex;
  gap: 4px;
  align-self: flex-start;
  margin-left: 31px;
  padding: 9px 12px;
  border: 1px solid var(--border);
  border-radius: 13px;
  background: var(--panel);
}

.pm-thinking span {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--txt-faint);
  animation: pm-bounce 1.2s infinite;
}

.pm-thinking span:nth-child(2) {
  animation-delay: 0.15s;
}

.pm-thinking span:nth-child(3) {
  animation-delay: 0.3s;
}

.pm-compose {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  margin: 0 12px;
  padding: 8px 9px 8px 12px;
  border: 1px solid var(--border);
  border-radius: 13px;
  background: var(--panel-solid);
}

.pm-compose:focus-within {
  border-color: var(--border-bright);
  box-shadow: 0 0 0 3px var(--violet-dim);
}

.pm-compose textarea {
  flex: 1;
  min-height: 24px;
  max-height: 82px;
  resize: none;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--txt);
  font: 12.5px / 1.55 var(--font-sans);
}

.pm-compose textarea::placeholder {
  color: var(--txt-faint);
}

.pm-compose button {
  width: 31px;
  height: 31px;
  display: grid;
  place-items: center;
  flex: none;
  border: 0;
  border-radius: 9px;
  background: var(--btn-primary-bg);
  color: var(--violet);
  cursor: pointer;
}

.pm-compose button:disabled {
  opacity: 0.4;
  cursor: default;
}

.pm-compose button svg {
  width: 18px;
  height: 18px;
}

@keyframes pm-bounce {
  0%, 70%, 100% {
    transform: translateY(0);
    opacity: 0.4;
  }
  35% {
    transform: translateY(-3px);
    opacity: 1;
  }
}

@media (max-width: 760px) {
  .pm-view {
    flex-direction: column;
  }

  .pm-sidebar {
    width: 100%;
    max-height: 30%;
    border-right: none;
    border-bottom: 1px solid var(--border);
  }

  .pm-panel {
    flex: 1;
  }
}
</style>
