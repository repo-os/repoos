<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from "vue";
import { X } from "lucide-vue-next";
import { api, JSON_OPTS } from "../api";
import { renderMarkdown } from "../lib/markdown";
import { fmtTime } from "../lib/time";
import { useConfigStore } from "../stores/config";
import { useRepoStore } from "../stores/repo";
import type { Agent, AgentOutputEntry, AgentSessionStats } from "../types";
import FloatingHeadPanel from "./FloatingHeadPanel.vue";
import VoiceDictate from "./VoiceDictate.vue";
import AiChatThinking from "./AiChatThinking.vue";
import ChatJumpToLatest from "./ChatJumpToLatest.vue";
import { useChatScroll } from "../composables/useChatScroll";
import { insertTextAtCursor } from "../utils/text-insertion";
import { autoGrowTextarea } from "../utils/textarea-autogrow";

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
      (agent) => agent.name.toLowerCase() === "ross" || agent.name.toLowerCase() === "repoos guide",
    ) ?? null,
);
const agent = computed(() => configuredAgent.value ?? hydratedAgent.value);
const enabled = computed(() => agent.value?.enabled ?? hydratedEnabled.value);
const busy = computed(() => submitting.value || repo.runningIds.includes(CHAT_ID));
const lines = computed(() => repo.outputs[CHAT_ID] ?? []);
const hasConversation = computed(() => lines.value.length > 0);

// Chat scroll standard (#0444): open on the newest message, remember where the
// reader was, and offer a jump back down once they scroll away.
const { showJumpToLatest, onScroll, scrollToLatest } = useChatScroll(log, {
  chatId: CHAT_ID,
  contentSize: () => lines.value.length,
  active: () => props.open,
});

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
  scrollToLatest("auto");
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
  if (event.key !== "Enter" || event.shiftKey || event.isComposing) return;
  event.preventDefault();
  void send();
}

function onDraftTranscribed(text: string): void {
  if (draftTextarea.value) {
    insertTextAtCursor(draftTextarea.value, text); // dispatches `input` → adjustDraftHeight
  }
}

function adjustDraftHeight(): void {
  autoGrowTextarea(draftTextarea.value);
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

// Following new output is useChatScroll's job — it only follows a reader who is
// already at the bottom, so reading history is never yanked away (#0444).

onMounted(() => {
  void hydrate();
});

// Covers programmatic changes (post-send reset, a restored draft) — no `input` event.
watch(
  () => draft.value,
  () => {
    nextTick(adjustDraftHeight);
  },
);
</script>

<template>
  <FloatingHeadPanel
    :open="props.open"
    title="Ross"
    description="Ask Ross about this repository."
    @close="emit('close')"
  >
    <header class="guide-header">
      <div class="guide-avatar" aria-hidden="true">
        <img src="/assets/repoos-ross-from-friends-square.webp" alt="Ross" />
      </div>
      <div class="guide-identity">
        <strong>{{ agent?.name ?? "Ross" }}</strong>
        <span
          ><i :class="{ off: !enabled }"></i
          >{{ enabled ? "Repository assistant" : "Disabled on Agents page" }}</span
        >
      </div>
      <button
        class="close-x guide-close"
        type="button"
        aria-label="Close Ross"
        title="Close"
        @click="emit('close')"
      >
        <X class="size-[15px]" />
      </button>
    </header>

    <div
      ref="log"
      class="guide-log ai-chat-log"
      role="log"
      aria-live="polite"
      aria-label="Conversation with Ross"
      @scroll="onScroll"
    >
      <div v-if="!hasConversation" class="guide-welcome">
        <div class="guide-welcome-avatar">
          <img src="/assets/repoos-ross-from-friends-square.webp" alt="Ross" />
        </div>
        <strong>Ask Ross about this repository</strong>
        <p>I can help with RepoOS, tasks, statuses, issues, code, and repository context.</p>
        <div class="guide-prompts">
          <button type="button" @click="draft = 'What is currently in progress?'">
            What's in progress?
          </button>
          <button type="button" @click="draft = 'Which issues need attention?'">
            Issues needing attention
          </button>
        </div>
      </div>
      <template v-for="(entry, index) in lines" :key="index">
        <div
          v-if="lineKind(entry) !== 'hidden'"
          class="guide-row"
          :class="`guide-row-${lineKind(entry)}`"
        >
          <div v-if="lineKind(entry) === 'assistant'" class="guide-mini-avatar">
            <img src="/assets/repoos-ross-from-friends-square.webp" alt="R" />
          </div>
          <div class="guide-bubble" :class="`guide-bubble-${lineKind(entry)}`">
            <div
              v-if="lineKind(entry) === 'assistant'"
              class="guide-markdown"
              v-html="renderMarkdown(lineText(entry))"
            ></div>
            <span v-else>{{ lineText(entry) }}</span>
            <span v-if="lineKind(entry) !== 'status' && entry.at" class="msg-time">{{
              fmtTime(entry.at)
            }}</span>
          </div>
        </div>
      </template>
      <AiChatThinking class="ai-chat-avatar-offset" :active="busy" label="Ross is thinking" />
    </div>

    <ChatJumpToLatest :visible="showJumpToLatest" :anchor="log" @click="scrollToLatest()" />

    <form class="guide-compose" @submit.prevent="send">
      <textarea
        ref="draftTextarea"
        v-model="draft"
        rows="1"
        :disabled="!enabled"
        :placeholder="enabled ? 'Ask about this repo…' : 'Enable Ross on the Agents page'"
        aria-label="Message Ross"
        @keydown="onKeydown"
        @input="adjustDraftHeight"
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
        <svg viewBox="0 0 20 20" fill="none">
          <rect x="5" y="5" width="10" height="10" rx="1.5" fill="currentColor" />
        </svg>
      </button>
      <button
        v-else
        type="submit"
        class="ai-chat-send"
        :disabled="!draft.trim() || busy || !enabled"
        aria-label="Send message"
      >
        <svg viewBox="0 0 20 20" fill="none">
          <path
            d="m3 9 13-6-5.5 14-2-5.5L3 9Z"
            stroke="currentColor"
            stroke-width="1.7"
            stroke-linejoin="round"
          />
          <path d="m8.5 11.5 3-3" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" />
        </svg>
      </button>
    </form>
  </FloatingHeadPanel>
</template>

<style scoped>
.guide-header {
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 13px 14px;
  border-bottom: 1px solid var(--border);
  background: var(--topbar-bg);
}
.guide-avatar {
  width: 38px;
  height: 38px;
  flex: none;
  border-radius: 50%;
  overflow: hidden;
  border: 1px solid var(--border-bright);
}
.guide-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.guide-identity {
  display: flex;
  flex: 1;
  min-width: 0;
  flex-direction: column;
  gap: 3px;
}
.guide-identity strong {
  font-size: 13.5px;
  letter-spacing: -0.01em;
}
.guide-identity span {
  display: flex;
  align-items: center;
  gap: 6px;
  font:
    500 10px "JetBrains Mono",
    monospace;
  color: var(--txt-dim);
}
.guide-identity i {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--green);
  box-shadow: 0 0 6px var(--green);
}
.guide-identity i.off {
  background: var(--txt-faint);
  box-shadow: none;
}
/* Vertical rhythm between messages comes from .ai-chat-log (style.css). */
.guide-log {
  flex: 1;
  overflow-y: auto;
  padding: 16px 14px;
}
.guide-welcome {
  margin: auto 0;
  text-align: center;
  padding: 22px 12px;
  color: var(--txt-dim);
}
.guide-welcome-avatar {
  width: 52px;
  height: 52px;
  margin: 0 auto 12px;
  border-radius: 50%;
  overflow: hidden;
  border: 1px solid var(--border-bright);
}
.guide-welcome-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.guide-welcome strong {
  display: block;
  color: var(--txt);
  font-size: 14px;
  margin-bottom: 6px;
}
.guide-welcome p {
  font-size: 11.5px;
  line-height: 1.55;
  max-width: 280px;
  margin: 0 auto;
}
.guide-prompts {
  display: flex;
  justify-content: center;
  flex-wrap: wrap;
  gap: 7px;
  margin-top: 14px;
}
.guide-prompts button {
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 6px 9px;
  background: var(--panel);
  color: var(--txt-dim);
  font: 500 10px var(--font-sans);
  cursor: pointer;
}
.guide-prompts button:hover {
  border-color: var(--border-bright);
  color: var(--txt);
}
.guide-row {
  display: flex;
  align-items: flex-end;
  gap: 7px;
}
.guide-row-human {
  justify-content: flex-end;
}
.guide-mini-avatar {
  width: 24px;
  height: 24px;
  flex: none;
  border-radius: 50%;
  overflow: hidden;
  border: 1px solid var(--border);
}
.guide-mini-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.guide-bubble {
  max-width: 84%;
  padding: 9px 11px;
  border-radius: 13px;
  font-size: 12px;
  line-height: 1.55;
  overflow-wrap: anywhere;
}
.guide-bubble-human {
  color: var(--btn-primary-color);
  background: var(--btn-primary-bg);
  border: 1px solid var(--border-bright);
  border-bottom-right-radius: 4px;
}
.guide-bubble-assistant {
  color: var(--txt);
  background: var(--panel);
  border: 1px solid var(--border);
  border-bottom-left-radius: 4px;
}
.msg-time {
  display: block;
  margin-top: 3px;
  text-align: right;
  color: var(--txt-faint);
  font:
    500 8.5px "JetBrains Mono",
    monospace;
  opacity: 0.8;
}
.guide-row-status {
  justify-content: center;
}
.guide-bubble-status {
  padding: 4px 8px;
  background: transparent;
  color: var(--txt-faint);
  font:
    500 9.5px "JetBrains Mono",
    monospace;
  text-align: center;
}
.guide-markdown :deep(p) {
  margin: 0 0 7px;
}
.guide-markdown :deep(p:last-child) {
  margin-bottom: 0;
}
.guide-markdown :deep(ul),
.guide-markdown :deep(ol) {
  padding-left: 17px;
  margin: 5px 0;
}
.guide-markdown :deep(code) {
  font:
    10.5px "JetBrains Mono",
    monospace;
  background: var(--md-body-bg);
  border-radius: 4px;
  padding: 1px 4px;
}
.guide-markdown :deep(pre) {
  overflow: auto;
  margin: 7px 0;
  padding: 8px;
  background: var(--md-body-bg);
  border-radius: 7px;
}
.guide-markdown :deep(pre code) {
  padding: 0;
  background: none;
}
.guide-markdown :deep(a) {
  color: var(--cyan);
}
.guide-compose {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  margin: 0 12px 12px;
  padding: 8px 9px 8px 12px;
  border: 1px solid var(--border);
  border-radius: 13px;
  background: var(--panel-solid);
}
.guide-compose:focus-within {
  border-color: var(--border-bright);
  box-shadow: 0 0 0 3px var(--cyan-dim);
}
.guide-compose textarea {
  flex: 1;
  min-height: 24px;
  max-height: 120px;
  overflow-y: auto;
  resize: none;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--txt);
  font: 12.5px/1.55 var(--font-sans);
}
.guide-compose textarea::placeholder {
  color: var(--txt-faint);
}
.guide-compose button {
  width: 31px;
  height: 31px;
  display: grid;
  place-items: center;
  flex: none;
  border: 0;
  border-radius: 9px;
  /* Fill comes from the shared .ai-chat-send (style.css) for the send button
     and from .guide-stop below for the interrupt button. */
  background: transparent;
  color: var(--txt-dim);
  cursor: pointer;
}
.guide-compose button:disabled {
  opacity: 0.4;
  cursor: default;
}
.guide-compose button svg {
  width: 18px;
  height: 18px;
}
.guide-compose button.guide-stop {
  background: color-mix(in srgb, var(--red, #ef5b5b) 16%, var(--btn-primary-bg));
  color: var(--red, #ef5b5b);
}
</style>
