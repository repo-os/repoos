<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from "vue";
import { api, JSON_OPTS } from "../api";
import { renderMarkdown } from "../lib/markdown";
import { fmtTime } from "../lib/time";
import { useConfigStore } from "../stores/config";
import { useRepoStore } from "../stores/repo";
import type { Agent, AgentOutputEntry, AgentSessionStats } from "../types";
import VoiceDictate from "./VoiceDictate.vue";
import { insertTextAtCursor } from "../utils/text-insertion";

const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{ close: [] }>();

const CHAT_ID = "repoos-guide";
const repo = useRepoStore();
const config = useConfigStore();
const draft = ref("");
const submitting = ref(false);
const hydratedEnabled = ref(true);
const hydratedAgent = ref<Agent | null>(null);
const log = ref<HTMLElement | null>(null);
const draftTextarea = ref<HTMLTextAreaElement | null>(null);

interface ChatResponse {
  ok: boolean;
  agent: Agent | null;
  enabled: boolean;
  lines: AgentOutputEntry[];
  running: boolean;
  stats: AgentSessionStats;
}

const configuredAgent = computed(
  () =>
    config.agents.find(
      (agent) =>
        agent.name.toLowerCase() === "ross" ||
        agent.name.toLowerCase() === "repoos guide",
    ) ?? null,
);
const agent = computed(() => configuredAgent.value ?? hydratedAgent.value);
const enabled = computed(() => agent.value?.enabled ?? hydratedEnabled.value);
const busy = computed(() => submitting.value || repo.runningIds.includes(CHAT_ID));
const lines = computed(() => repo.outputs[CHAT_ID] ?? []);
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

async function hydrate(): Promise<void> {
  try {
    const response = await api<ChatResponse>("/api/chat");
    hydratedAgent.value = response.agent;
    hydratedEnabled.value = response.enabled;
    repo.outputs[CHAT_ID] = response.lines;
    repo.agentStats[CHAT_ID] = response.stats;
    if (response.running && !repo.runningIds.includes(CHAT_ID)) {
      repo.runningIds = [...repo.runningIds, CHAT_ID];
    }
  } catch (error) {
    repo.onError(error);
  }
}

async function send(): Promise<void> {
  const text = draft.value.trim();
  if (!text || busy.value || !enabled.value) return;
  submitting.value = true;
  const optimistic: AgentOutputEntry = { type: "human", text, at: new Date().toISOString() };
  const optimisticIndex = lines.value.length;
  repo.outputs[CHAT_ID] = [...lines.value, optimistic];
  draft.value = "";
  scrollToLatest();
  try {
    await api("/api/chat/message", JSON_OPTS("POST", { text }));
  } catch (error) {
    repo.outputs[CHAT_ID] = (repo.outputs[CHAT_ID] ?? []).filter(
      (_entry, index) => index !== optimisticIndex,
    );
    draft.value = text;
    repo.outputs[CHAT_ID] = [
      ...(repo.outputs[CHAT_ID] ?? []),
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
    adjustTextareaHeight();
  }
}

function adjustTextareaHeight(): void {
  const textarea = draftTextarea.value;
  if (textarea) {
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 150) + 'px';
  }
}

/**
 * Interrupt Ross's in-flight response. The server stops the running agent turn
 * and appends a "response interrupted" marker to the conversation.
 * Best-effort — a 404 when nothing is running is harmless.
 */
async function interrupt(): Promise<void> {
  try {
    await api("/api/chat/interrupt", { method: "POST" });
  } catch (error) {
    repo.onError(error);
  }
}

watch(() => lines.value.length, () => {
  if (props.open) scrollToLatest();
});

onMounted(() => {
  void hydrate();
  // Adjust textarea height on mount
  setTimeout(() => adjustTextareaHeight(), 0);
});

watch(() => draft.value, () => {
  nextTick(() => adjustTextareaHeight());
});
</script>

<template>
  <aside
    v-if="props.open"
    class="guide-panel"
    aria-label="RepoOS Guide chat"
  >
    <header class="guide-header">
      <div class="guide-avatar" aria-hidden="true">
        <img src="/assets/repoos-ross-from-friends-square.webp" alt="Ross" />
      </div>
      <div class="guide-identity">
        <strong>{{ agent?.name ?? "Ross" }}</strong>
        <span><i :class="{ off: !enabled }"></i>{{ enabled ? "Repository assistant" : "Disabled on Agents page" }}</span>
      </div>
      <button class="guide-minimize" type="button" aria-label="Close Ross" title="Close" @click="emit('close')">
        <svg viewBox="0 0 20 20" fill="none"><path d="M4 10h12" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" /></svg>
      </button>
    </header>

    <div ref="log" class="guide-log" role="log" aria-live="polite" aria-label="Conversation with Ross">
      <div v-if="!hasConversation" class="guide-welcome">
        <div class="guide-welcome-avatar"><img src="/assets/repoos-ross-from-friends-square.webp" alt="Ross" /></div>
        <strong>Ask Ross about this repository</strong>
        <p>I can help with RepoOS, tasks, statuses, issues, code, and repository context.</p>
        <div class="guide-prompts">
          <button type="button" @click="draft = 'What is currently in progress?'">What's in progress?</button>
          <button type="button" @click="draft = 'Which issues need attention?'">Issues needing attention</button>
        </div>
      </div>
      <template v-for="(entry, index) in lines" :key="index">
        <div v-if="lineKind(entry) !== 'hidden'" class="guide-row" :class="`guide-row-${lineKind(entry)}`">
          <div v-if="lineKind(entry) === 'assistant'" class="guide-mini-avatar"><img src="/assets/repoos-ross-from-friends-square.webp" alt="R" /></div>
          <div class="guide-bubble" :class="`guide-bubble-${lineKind(entry)}`">
            <div v-if="lineKind(entry) === 'assistant'" class="guide-markdown" v-html="renderMarkdown(lineText(entry))"></div>
            <span v-else>{{ lineText(entry) }}</span>
            <span v-if="lineKind(entry) !== 'status' && entry.at" class="msg-time">{{ fmtTime(entry.at) }}</span>
          </div>
        </div>
      </template>
      <div v-if="busy" class="guide-thinking" aria-label="Ross is thinking">
        <span></span><span></span><span></span>
      </div>
    </div>

    <form class="guide-compose" @submit.prevent="send">
      <textarea
        ref="draftTextarea"
        v-model="draft"
        rows="1"
        :disabled="!enabled"
        :placeholder="enabled ? 'Ask about this repo…' : 'Enable Ross on the Agents page'"
        aria-label="Message Ross"
        @keydown="onKeydown"
        @input="adjustTextareaHeight"
      ></textarea>
      <VoiceDictate :disabled="!enabled" @transcribed="onDraftTranscribed" />
      <button
        v-if="busy"
        type="button"
        class="guide-stop"
        aria-label="Stop response"
        title="Stop response"
        @click="interrupt"
      >
        <svg viewBox="0 0 20 20" fill="none"><rect x="5" y="5" width="10" height="10" rx="1.5" fill="currentColor" /></svg>
      </button>
      <button v-else type="submit" :disabled="!draft.trim() || busy || !enabled" aria-label="Send message">
        <svg viewBox="0 0 20 20" fill="none"><path d="m3 9 13-6-5.5 14-2-5.5L3 9Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" /><path d="m8.5 11.5 3-3" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" /></svg>
      </button>
    </form>
    <div class="guide-footnote">Repo-aware assistant · Conversation stays open while you navigate</div>
  </aside>
</template>

<style scoped>
.guide-panel{position:fixed;top:0;right:0;bottom:0;width:680px;max-width:100vw;display:flex;flex-direction:column;overflow:hidden;border-left:1px solid var(--border-bright);background:var(--panel-gradient);box-shadow:var(--drawer-shadow);animation:guide-open .18s ease-out;pointer-events:auto;z-index:92}
.guide-header{display:flex;align-items:center;gap:11px;padding:13px 14px;border-bottom:1px solid var(--border);background:var(--topbar-bg)}
.guide-avatar{width:38px;height:38px;flex:none;border-radius:50%;overflow:hidden;border:1px solid var(--border-bright)}
.guide-avatar img{width:100%;height:100%;object-fit:cover}
.guide-identity{display:flex;flex:1;min-width:0;flex-direction:column;gap:3px}
.guide-identity strong{font-size:13.5px;letter-spacing:-.01em}
.guide-identity span{display:flex;align-items:center;gap:6px;font:500 10px 'JetBrains Mono',monospace;color:var(--txt-dim)}
.guide-identity i{width:6px;height:6px;border-radius:50%;background:var(--green);box-shadow:0 0 6px var(--green)}
.guide-identity i.off{background:var(--txt-faint);box-shadow:none}
.guide-minimize{width:34px;height:34px;display:grid;place-items:center;border:0;border-radius:9px;background:transparent;color:var(--txt-dim);cursor:pointer}
.guide-minimize:hover{background:var(--nav-hover-bg);color:var(--txt)}
.guide-minimize svg{width:19px;height:19px}
.guide-log{flex:1;overflow-y:auto;display:flex;flex-direction:column;gap:11px;padding:16px 14px;overscroll-behavior:contain}
.guide-welcome{margin:auto 0;text-align:center;padding:22px 12px;color:var(--txt-dim)}
.guide-welcome-avatar{width:52px;height:52px;margin:0 auto 12px;border-radius:50%;overflow:hidden;border:1px solid var(--border-bright)}
.guide-welcome-avatar img{width:100%;height:100%;object-fit:cover}
.guide-welcome strong{display:block;color:var(--txt);font-size:14px;margin-bottom:6px}
.guide-welcome p{font-size:11.5px;line-height:1.55;max-width:280px;margin:0 auto}
.guide-prompts{display:flex;justify-content:center;flex-wrap:wrap;gap:7px;margin-top:14px}
.guide-prompts button{border:1px solid var(--border);border-radius:999px;padding:6px 9px;background:var(--panel);color:var(--txt-dim);font:500 10px var(--font-sans);cursor:pointer}
.guide-prompts button:hover{border-color:var(--border-bright);color:var(--txt)}
.guide-row{display:flex;align-items:flex-end;gap:7px}
.guide-row-human{justify-content:flex-end}
.guide-mini-avatar{width:24px;height:24px;flex:none;border-radius:50%;overflow:hidden;border:1px solid var(--border)}
.guide-mini-avatar img{width:100%;height:100%;object-fit:cover}
.guide-bubble{max-width:84%;padding:9px 11px;border-radius:13px;font-size:12px;line-height:1.55;overflow-wrap:anywhere}
.guide-bubble-human{color:var(--btn-primary-color);background:var(--btn-primary-bg);border:1px solid var(--border-bright);border-bottom-right-radius:4px}
.guide-bubble-assistant{color:var(--txt);background:var(--panel);border:1px solid var(--border);border-bottom-left-radius:4px}
.msg-time{display:block;margin-top:3px;text-align:right;color:var(--txt-faint);font:500 8.5px 'JetBrains Mono',monospace;opacity:.8}
.guide-row-status{justify-content:center}
.guide-bubble-status{padding:4px 8px;background:transparent;color:var(--txt-faint);font:500 9.5px 'JetBrains Mono',monospace;text-align:center}
.guide-markdown :deep(p){margin:0 0 7px}
.guide-markdown :deep(p:last-child){margin-bottom:0}
.guide-markdown :deep(ul),.guide-markdown :deep(ol){padding-left:17px;margin:5px 0}
.guide-markdown :deep(code){font:10.5px 'JetBrains Mono',monospace;background:var(--md-body-bg);border-radius:4px;padding:1px 4px}
.guide-markdown :deep(pre){overflow:auto;margin:7px 0;padding:8px;background:var(--md-body-bg);border-radius:7px}
.guide-markdown :deep(pre code){padding:0;background:none}
.guide-markdown :deep(a){color:var(--cyan)}
.guide-thinking{display:flex;gap:4px;align-self:flex-start;margin-left:31px;padding:9px 12px;border:1px solid var(--border);border-radius:13px;background:var(--panel)}
.guide-thinking span{width:5px;height:5px;border-radius:50%;background:var(--txt-faint);animation:guide-bounce 1.2s infinite}
.guide-thinking span:nth-child(2){animation-delay:.15s}.guide-thinking span:nth-child(3){animation-delay:.3s}
.guide-compose{display:flex;align-items:flex-end;gap:8px;margin:0 12px;padding:8px 9px 8px 12px;border:1px solid var(--border);border-radius:13px;background:var(--panel-solid)}
.guide-compose:focus-within{border-color:var(--border-bright);box-shadow:0 0 0 3px var(--cyan-dim)}
.guide-compose textarea{flex:1;min-height:24px;max-height:82px;resize:none;border:0;outline:0;background:transparent;color:var(--txt);font:12.5px/1.55 var(--font-sans)}
.guide-compose textarea::placeholder{color:var(--txt-faint)}
.guide-compose button{width:31px;height:31px;display:grid;place-items:center;flex:none;border:0;border-radius:9px;background:var(--btn-primary-bg);color:var(--cyan);cursor:pointer}
.guide-compose button:disabled{opacity:.4;cursor:default}
.guide-compose button svg{width:18px;height:18px}
.guide-compose button.guide-stop{background:color-mix(in srgb,var(--red,#ef5b5b) 16%,var(--btn-primary-bg));color:var(--red,#ef5b5b)}
.guide-footnote{padding:7px 14px 10px;text-align:center;color:var(--txt-faint);font:500 8.5px 'JetBrains Mono',monospace}
@keyframes guide-open{from{opacity:0;transform:translateY(10px) scale(.98)}to{opacity:1;transform:none}}
@keyframes guide-bounce{0%,70%,100%{transform:translateY(0);opacity:.4}35%{transform:translateY(-3px);opacity:1}}
@keyframes guide-pulse{50%{opacity:.35}}
@media(max-width:600px){.guide-panel{left:0;right:0;width:100vw!important}}
@media(prefers-reduced-motion:reduce){.guide-panel,.guide-thinking span,.guide-running-dot{animation:none;transition:none}}
</style>
