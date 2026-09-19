<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from "vue";
import { X } from "lucide-vue-next";
import { api } from "../api";
import { renderMarkdown } from "../lib/markdown";
import { fmtTime } from "../lib/time";
import { autoGrowTextarea } from "../utils/textarea-autogrow";
import { useRepoStore } from "../stores/repo";
import type { AgentOutputEntry } from "../types";
import FloatingHeadPanel from "./FloatingHeadPanel.vue";
import AiChatThinking from "./AiChatThinking.vue";
import ChatJumpToLatest from "./ChatJumpToLatest.vue";
import { useChatScroll } from "../composables/useChatScroll";

const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{ close: [] }>();

const repo = useRepoStore();
const draft = ref("");
const submitting = ref(false);
const log = ref<HTMLElement | null>(null);
const draftTextarea = ref<HTMLTextAreaElement | null>(null);

const busy = computed(() => submitting.value || repo.cto.running);
const enabled = computed(() => repo.cto.enabled);
const running = computed(() => repo.cto.running);
const report = computed(() => repo.cto.report);
const lines = computed(() => repo.cto.lines);

// Chat scroll standard (#0444): open on the newest message, remember where the
// reader was, and offer a jump back down once they scroll away.
const { showJumpToLatest, onScroll, scrollToLatest } = useChatScroll(log, {
  chatId: "cto",
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

function onKeydown(event: KeyboardEvent): void {
  // Enter sends; Shift+Enter inserts a newline (this field became a <textarea>).
  // `isComposing` keeps an IME confirmation Enter from sending mid-composition.
  if (event.key !== "Enter" || event.shiftKey || event.isComposing) return;
  event.preventDefault();
  void send();
}

function adjustDraftHeight(): void {
  autoGrowTextarea(draftTextarea.value);
}

async function send(): Promise<void> {
  const text = draft.value.trim();
  if (!text || busy.value || !enabled.value) return;
  submitting.value = true;
  draft.value = "";
  try {
    await api("/api/cto/message", {
      method: "POST",
      body: JSON.stringify({ text }),
    });
    await repo.loadCTO();
  } catch (error) {
    repo.onError(error);
  } finally {
    submitting.value = false;
  }
}

/**
 * Interrupt the CTO's in-flight response. The server cancels the running agent
 * turn and appends a "response interrupted" marker to the conversation.
 * Best-effort — a no-op when nothing is running is harmless.
 */
async function interrupt(): Promise<void> {
  try {
    await api("/api/cto/interrupt", { method: "POST" });
    await repo.loadCTO();
  } catch (error) {
    repo.onError(error);
  }
}

onMounted(() => {
  void repo.loadCTO();
});

// Covers programmatic changes (the post-send reset) that emit no `input` event.
watch(
  () => draft.value,
  () => {
    nextTick(adjustDraftHeight);
  },
);
</script>

<template>
  <FloatingHeadPanel
    :open="open"
    title="CTO Board Monitor"
    description="Ask the CTO about board health."
    @close="emit('close')"
  >
    <header class="cto-header">
      <div class="cto-avatar" aria-hidden="true">
        <img src="/assets/repoos-cto-square.webp" alt="CTO" />
      </div>
      <div class="cto-identity">
        <strong>CTO Board Monitor</strong>
        <span
          ><i :class="{ off: !enabled }"></i
          >{{ enabled ? "CTO agent is active" : "Disabled on Agents page" }}</span
        >
      </div>
      <button
        class="close-x cto-close"
        type="button"
        aria-label="Close CTO"
        title="Close"
        @click="emit('close')"
      >
        <X class="size-[15px]" />
      </button>
    </header>

    <div ref="log" class="cto-log ai-chat-log" @scroll="onScroll">
      <div v-if="!enabled" class="cto-disabled">
        <p>CTO agent is disabled. Enable it from the Agents page.</p>
      </div>

      <div v-else-if="report" class="cto-report">
        <div class="cto-report-meta">
          Latest report at {{ new Date(report.at).toLocaleTimeString() }}
        </div>
        <div class="cto-report-content" v-html="renderMarkdown(report.markdown)"></div>
      </div>

      <div v-for="(entry, i) of lines" :key="i" :class="`cto-line ${lineKind(entry)}`">
        {{ lineText(entry) }}
        <span v-if="lineKind(entry) !== 'status' && entry.at" class="msg-time">{{
          fmtTime(entry.at)
        }}</span>
      </div>

      <AiChatThinking :active="busy" label="CTO is thinking" />
    </div>

    <ChatJumpToLatest :visible="showJumpToLatest" :anchor="log" @click="scrollToLatest()" />

    <form class="cto-compose" @submit.prevent="send">
      <textarea
        ref="draftTextarea"
        v-model="draft"
        placeholder="Ask the CTO about board health..."
        :disabled="busy || !enabled"
        rows="1"
        @keydown="onKeydown"
        @input="adjustDraftHeight"
      ></textarea>
      <button
        v-if="busy"
        type="button"
        class="cto-stop"
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
        :disabled="busy || !enabled || !draft.trim()"
      >
        Send
      </button>
    </form>
  </FloatingHeadPanel>
</template>

<style scoped>
.cto-header {
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 13px 14px;
  border-bottom: 1px solid var(--border);
  background: var(--topbar-bg);
}
.cto-avatar {
  width: 38px;
  height: 38px;
  flex: none;
  border-radius: 50%;
  overflow: hidden;
  border: 1px solid var(--border-bright);
}
.cto-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.cto-identity {
  display: flex;
  flex: 1;
  min-width: 0;
  flex-direction: column;
  gap: 3px;
}
.cto-identity strong {
  font-size: 13.5px;
  letter-spacing: -0.01em;
}
.cto-identity span {
  display: flex;
  align-items: center;
  gap: 6px;
  font:
    500 10px "JetBrains Mono",
    monospace;
  color: var(--txt-dim);
}
.cto-identity i {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--green);
  box-shadow: 0 0 6px var(--green);
}
.cto-identity i.off {
  background: var(--txt-faint);
  box-shadow: none;
}
/* Vertical rhythm between messages comes from .ai-chat-log (style.css). */
.cto-log {
  flex: 1;
  overflow-y: auto;
  padding: 16px 14px;
}
.cto-disabled {
  padding: 16px;
  color: var(--txt-dim);
  font-size: 13px;
  text-align: center;
  margin: auto 0;
}
.cto-report {
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--panel);
  margin-bottom: 8px;
}
.cto-report-meta {
  font-size: 10.5px;
  color: var(--txt-faint);
  margin-bottom: 8px;
  font-family: "JetBrains Mono", monospace;
}
.cto-report-content {
  font-size: 12.5px;
  line-height: 1.55;
}
.cto-report-content :deep(p) {
  margin: 0 0 7px;
}
.cto-report-content :deep(p:last-child) {
  margin-bottom: 0;
}
.cto-report-content :deep(ul),
.cto-report-content :deep(ol) {
  padding-left: 17px;
  margin: 5px 0;
}
.cto-report-content :deep(code) {
  font:
    10.5px "JetBrains Mono",
    monospace;
  background: var(--md-body-bg);
  border-radius: 4px;
  padding: 1px 4px;
}
.cto-report-content :deep(a) {
  color: var(--cyan);
}
.cto-line {
  padding: 6px 8px;
  font-size: 12px;
  line-height: 1.5;
  border-radius: 8px;
}
.cto-line.human {
  color: var(--txt);
  font-weight: 500;
  background: var(--btn-primary-bg);
  align-self: flex-end;
  border-bottom-right-radius: 3px;
}
.cto-line.assistant {
  color: var(--txt);
  background: var(--panel);
  border: 1px solid var(--border);
  border-bottom-left-radius: 3px;
}
.cto-line.status {
  color: var(--txt-faint);
  font-style: italic;
  font-size: 11px;
  text-align: center;
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
.cto-compose {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  /* #0444: the compose row was flush against the panel's bottom edge. */
  margin: 0 12px 12px;
  padding: 8px 9px 8px 12px;
  border: 1px solid var(--border);
  border-radius: 13px;
  background: var(--panel-solid);
}
.cto-compose textarea {
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
.cto-compose textarea::placeholder {
  color: var(--txt-faint);
}
.cto-compose button {
  width: auto;
  padding: 0 12px;
  height: 31px;
  display: grid;
  place-items: center;
  flex: none;
  border: 0;
  border-radius: 9px;
  /* Fill comes from .ai-chat-send / .cto-stop below. */
  background: transparent;
  color: var(--txt-dim);
  cursor: pointer;
  font: 500 11px var(--font-sans);
}
.cto-compose button:disabled {
  opacity: 0.4;
  cursor: default;
}
.cto-compose button.cto-stop {
  width: 31px;
  padding: 0;
  display: grid;
  place-items: center;
  color: var(--red, #ef5b5b);
  background: color-mix(in srgb, var(--red, #ef5b5b) 16%, var(--btn-primary-bg));
}
.cto-compose button.cto-stop svg {
  width: 16px;
  height: 16px;
}
</style>
