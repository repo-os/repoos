<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from "vue";
import { api } from "../api";
import { renderMarkdown } from "../lib/markdown";
import { useRepoStore } from "../stores/repo";
import type { AgentOutputEntry } from "../types";

const repo = useRepoStore();
const open = ref(false);
const draft = ref("");
const submitting = ref(false);
const log = ref<HTMLElement | null>(null);

const busy = computed(() => submitting.value || repo.cto.running);
const enabled = computed(() => repo.cto.enabled);
const running = computed(() => repo.cto.running);
const report = computed(() => repo.cto.report);
const lines = computed(() => repo.cto.lines);

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

function toggle(): void {
  open.value = !open.value;
  if (open.value) scrollToLatest();
}

async function send(): Promise<void> {
  const text = draft.value.trim();
  if (!text || busy.value || !enabled.value) return;
  submitting.value = true;
  // No optimistic append here: the server emits the human turn back over SSE
  // (session `cto:board`) and loadCTO() below pulls the authoritative
  // transcript, so an optimistic copy would double the line.
  draft.value = "";

  try {
    await api("/api/cto/message", {
      method: "POST",
      body: JSON.stringify({ text }, undefined)
    });
    // Pull the authoritative transcript (the server persists the human turn).
    await repo.loadCTO();
  } catch (error) {
    repo.onError(error);
  } finally {
    submitting.value = false;
  }
}

onMounted(() => {
  void repo.loadCTO();
});
</script>

<template>
  <div class="cto-panel" :class="{ open }">
    <button class="toggle-btn" @click="toggle" :title="open ? 'Close CTO panel' : 'Open CTO panel'">
      CTO <span v-if="running" class="live-dot">🔴</span>
    </button>

    <div v-if="open" class="panel-content">
      <div class="header">
        <h2>CTO Board Monitor</h2>
        <button class="close-btn" @click="toggle">×</button>
      </div>

      <div class="report" v-if="report">
        <div class="report-meta">Latest report at {{ new Date(report.at).toLocaleTimeString() }}</div>
        <div class="report-content" v-html="renderMarkdown(report.markdown)"></div>
      </div>

      <div v-if="!enabled" class="disabled-notice">
        CTO agent is disabled. Enable it from the Agents page.
      </div>

      <div class="log" ref="log">
        <div v-for="(entry, i) of lines" :key="i" :class="`line ${lineKind(entry)}`">
          {{ lineText(entry) }}
        </div>
      </div>

      <div class="input-area">
        <input
          v-model="draft"
          type="text"
          placeholder="Ask the CTO about board health..."
          :disabled="busy || !enabled"
          @keydown.enter="send"
        />
        <button @click="send" :disabled="busy || !enabled || !draft.trim()">Send</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.cto-panel {
  position: fixed;
  right: 0;
  top: 60px;
  width: 0;
  height: calc(100vh - 60px);
  overflow: hidden;
  transition: width 0.3s ease;
  border-left: 1px solid var(--color-border);
  background: var(--color-bg);
  display: flex;
  flex-direction: column;
}

.cto-panel.open {
  width: 400px;
}

.toggle-btn {
  position: fixed;
  right: 16px;
  top: 70px;
  background: var(--color-primary);
  color: white;
  border: none;
  padding: 8px 16px;
  border-radius: 4px;
  cursor: pointer;
  z-index: 1000;
}

.toggle-btn:hover {
  opacity: 0.8;
}

.panel-content {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  border-bottom: 1px solid var(--color-border);
}

.header h2 {
  margin: 0;
  font-size: 16px;
}

.close-btn {
  background: none;
  border: none;
  font-size: 20px;
  cursor: pointer;
}

.disabled-notice {
  padding: 16px;
  color: var(--color-text-secondary);
  font-size: 14px;
}

.report {
  padding: 16px;
  border-bottom: 1px solid var(--color-border);
  overflow-y: auto;
}

.report-meta {
  font-size: 12px;
  color: var(--color-text-secondary);
  margin-bottom: 8px;
}

.report-content {
  font-size: 13px;
  line-height: 1.5;
}

.log {
  flex: 1;
  overflow-y: auto;
  padding: 12px 16px;
  font-family: monospace;
  font-size: 12px;
}

.line {
  margin: 4px 0;
}

.line.human {
  color: var(--color-primary);
  font-weight: 500;
}

.line.assistant {
  color: var(--color-text);
}

.line.status {
  color: var(--color-text-secondary);
  font-style: italic;
}

.input-area {
  display: flex;
  gap: 8px;
  padding: 12px 16px;
  border-top: 1px solid var(--color-border);
}

.input-area input {
  flex: 1;
  padding: 8px 12px;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  font-size: 13px;
}

.input-area button {
  padding: 8px 16px;
  background: var(--color-primary);
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
}

.input-area button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
