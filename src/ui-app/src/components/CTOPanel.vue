<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { X, ArrowDown } from "lucide-vue-next";
import { api } from "../api";
import { renderChatMarkdown } from "../lib/markdown";
import { fmtTime, timestampTip } from "../lib/time";
import { withSavedReport } from "../lib/cto-conversation";
import { autoGrowTextarea } from "../utils/textarea-autogrow";
import { useRepoStore } from "../stores/repo";
import { useConfigStore } from "../stores/config";
import { useCtoChatAgent, CHAT_AGENT_MEMORY_KEYS } from "../composables/useChatAgentModel";
import FloatingHeadPanel from "./FloatingHeadPanel.vue";
import AiChatThinking from "./AiChatThinking.vue";
import ChatAgentModelChip from "./ChatAgentModelChip.vue";
import ChatDiagnosticRow from "./ChatDiagnosticRow.vue";
import ChatToolCallRow from "./ChatToolCallRow.vue";
import { useChatScroll } from "../composables/useChatScroll";
import { useCopyChatMessage } from "../composables/useCopyChatMessage";
import { bubbleRole, toDisplayRows, type DisplayRow } from "../lib/chat-rows";

const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{ close: [] }>();

const repo = useRepoStore();
const config = useConfigStore();
const draft = ref("");
const submitting = ref(false);
const log = ref<HTMLElement | null>(null);
const draftTextarea = ref<HTMLTextAreaElement | null>(null);

// Inline agent + model chip (#0669): reads the CTO agent from config.agents and
// persists a pick the same way the Agents page does.
const ctoAgent = useCtoChatAgent();

const busy = computed(() => submitting.value || repo.cto.running);
const enabled = computed(() => repo.cto.enabled);
const running = computed(() => repo.cto.running);
const report = computed(() => repo.cto.report);
const lines = computed(() => repo.cto.lines);

// The saved report is folded in as a normal assistant entry (#0732) only when
// it is not already present in the transcript, so each monitoring run shows its
// report once and earlier runs are preserved. It renders through the same
// markdown bubble path as every other reply.
const displayLines = computed(() =>
  enabled.value ? withSavedReport(lines.value, report.value) : [...lines.value],
);

// Chat scroll standard (#0444): open on the newest message, remember where the
// reader was, and offer a jump back down once they scroll away.
const { showJumpToLatest, onScroll, scrollToLatest } = useChatScroll(log, {
  chatId: "cto",
  contentSize: () => displayLines.value.length,
  active: () => props.open,
});

const { messageBubbleListeners } = useCopyChatMessage();

// Rows are grouped by the shared transform (#0506): a run of adjacent tool
// calls is one expandable row with counts and the time it finished, not a
// one line of prose per call, with no count, outcome, or anything to expand.
const rows = computed<DisplayRow[]>(() => toDisplayRows(displayLines.value));

// Relative ages in the timestamp popup must not freeze at mount: tick a `now`
// while the panel is open so the tooltip text stays accurate (#0732).
const now = ref(Date.now());
let nowTimer: ReturnType<typeof setInterval> | undefined;

function stopNowTicker(): void {
  if (nowTimer !== undefined) {
    clearInterval(nowTimer);
    nowTimer = undefined;
  }
}

watch(
  () => props.open,
  (open) => {
    stopNowTicker();
    if (!open) return;
    now.value = Date.now();
    nowTimer = setInterval(() => {
      now.value = Date.now();
    }, 1000);
  },
  { immediate: true },
);

onBeforeUnmount(stopNowTicker);

/** The styled hover/focus popup for a row's timestamp: relative age + local date. */
function timeTip(iso: string | undefined): string {
  return timestampTip(iso, new Date(now.value));
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

/** Persist the chip pick (Agents page path) so it applies to the next turn. */
async function onAgentModelChange(cli: string, model: string): Promise<void> {
  try {
    await ctoAgent.setAgentModel(cli, model);
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
    title="CTO"
    description="Ask the CTO about board health."
    @close="emit('close')"
  >
    <header class="agent-chat-header">
      <div class="agent-chat-avatar" aria-hidden="true">
        <img src="/assets/repoos-cto-square.webp" alt="CTO" />
      </div>
      <div class="agent-chat-id">
        <strong>CTO</strong>
        <span v-if="!enabled" class="agent-chat-off"><i></i>Disabled on Agents page</span>
      </div>
      <ChatAgentModelChip
        :cli-options="ctoAgent.cliOptions.value"
        :model-options="ctoAgent.modelOptions.value"
        :cli="ctoAgent.cli.value"
        :model="ctoAgent.model.value"
        :memory-key="CHAT_AGENT_MEMORY_KEYS.cto"
        :disabled="!enabled"
        @update:cli="(v) => onAgentModelChange(v, ctoAgent.model.value)"
        @update:model="(v) => onAgentModelChange(ctoAgent.cli.value, v)"
      />
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

    <div class="cto-log-wrap">
      <div ref="log" class="cto-log ai-chat-log" @scroll="onScroll">
        <div v-if="!enabled" class="cto-disabled">
          <p>CTO agent is disabled. Enable it from the Agents page.</p>
        </div>

        <template v-for="row in rows" :key="row.key">
          <ChatDiagnosticRow
            v-if="row.kind === 'line' && row.s === 'err'"
            :text="row.text"
            :at="row.at"
          />
          <ChatToolCallRow v-else-if="row.kind === 'tools'" :calls="row.calls" :at="row.at" />
          <div v-else :class="`cto-line ${bubbleRole(row)}`" v-on="messageBubbleListeners(row)">
            <div
              v-if="bubbleRole(row) === 'assistant'"
              class="cto-markdown"
              v-html="renderChatMarkdown(row.text)"
            ></div>
            <span v-else>{{ row.text }}</span>
            <!-- Every row carries its last-updated time (#0506), system rows
                 included: a `sys` entry is stamped like any other. Hovering or
                 focusing the time shows a styled popup with the relative age
                 and the local date (#0732). -->
            <span v-if="row.at" class="msg-time" tabindex="0" :title="timeTip(row.at)">{{
              fmtTime(row.at)
            }}</span>
          </div>
        </template>

        <AiChatThinking :active="busy" label="CTO is thinking" />
      </div>
      <button v-if="showJumpToLatest" type="button" class="agent-jump" @click="scrollToLatest()">
        <ArrowDown class="size-3.5" />
        Latest
      </button>
    </div>

    <form class="ai-chat-compose" @submit.prevent="send">
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
        class="ai-chat-stop"
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
        class="ai-chat-send cto-send"
        :disabled="busy || !enabled || !draft.trim()"
      >
        Send
      </button>
    </form>
  </FloatingHeadPanel>
</template>

<style scoped>
/* The header (avatar + name + chip + close) is the shared `.agent-chat-header`
   set in style.css (#0669); the panel is body-teleported, so header chrome
   lives globally rather than in a scoped block here. */
/* Vertical rhythm between messages comes from .ai-chat-log (style.css). */
.cto-log-wrap {
  position: relative;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
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
.cto-line {
  padding: 6px 8px;
  font-size: 12px;
  line-height: 1.5;
  border-radius: 8px;
}
.cto-line.human {
  color: var(--btn-primary-color);
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
/* Assistant replies render as markdown (#0669). */
.cto-markdown :deep(p) {
  margin: 0 0 7px;
}
.cto-markdown :deep(p:last-child) {
  margin-bottom: 0;
}
.cto-markdown :deep(h1),
.cto-markdown :deep(h2),
.cto-markdown :deep(h3),
.cto-markdown :deep(h4) {
  margin: 8px 0 5px;
  font-size: 12.5px;
  line-height: 1.35;
}
.cto-markdown :deep(h1:first-child),
.cto-markdown :deep(h2:first-child),
.cto-markdown :deep(h3:first-child) {
  margin-top: 0;
}
.cto-markdown :deep(ul),
.cto-markdown :deep(ol) {
  margin: 5px 0;
  padding-left: 17px;
}
.cto-markdown :deep(code) {
  font:
    11px "JetBrains Mono",
    monospace;
  background: var(--md-body-bg);
  border-radius: 4px;
  padding: 1px 4px;
}
.cto-markdown :deep(pre) {
  margin: 6px 0;
  padding: 8px 10px;
  border-radius: 8px;
  background: var(--md-body-bg);
  overflow-x: auto;
}
.cto-markdown :deep(pre code) {
  background: none;
  padding: 0;
}
.cto-markdown :deep(table) {
  width: 100%;
  border-collapse: collapse;
  margin: 6px 0;
  font-size: 11.5px;
}
.cto-markdown :deep(th),
.cto-markdown :deep(td) {
  border: 1px solid var(--border);
  padding: 4px 7px;
  text-align: left;
}
.cto-markdown :deep(a) {
  color: var(--cyan);
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
/* The time is focusable so the popup opens from the keyboard too (#0732). */
.msg-time:focus-visible {
  outline: 2px solid var(--cyan);
  outline-offset: 2px;
  border-radius: 4px;
}
/* Text send button — the shared compose sizes icon buttons at 31px; "Send"
   needs its own width. No fill here: `.ai-chat-send` owns that (a fill would
   out-specify the shared class and leave it transparent). */
.cto-send {
  width: auto;
  padding: 0 12px;
  font: 500 11px var(--font-sans);
}
</style>
