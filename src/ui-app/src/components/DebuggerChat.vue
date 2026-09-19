<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from "vue";
import { X } from "lucide-vue-next";
import { useRouter } from "vue-router";
import { api, JSON_OPTS } from "../api";
import { renderMarkdown } from "../lib/markdown";
import { fmtTime } from "../lib/time";
import { useConfigStore } from "../stores/config";
import { useRepoStore } from "../stores/repo";
import { useUiStore } from "../stores/ui";
import type { AgentOutputEntry } from "../types";
import FloatingHeadPanel from "./FloatingHeadPanel.vue";
import VoiceDictate from "./VoiceDictate.vue";
import AiChatThinking from "./AiChatThinking.vue";
import ChatJumpToLatest from "./ChatJumpToLatest.vue";
import { useChatScroll } from "../composables/useChatScroll";
import { insertTextAtCursor } from "../utils/text-insertion";
import { autoGrowTextarea } from "../utils/textarea-autogrow";

const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{ close: [] }>();

// Must equal the server-side debugger session id (agents.ts debuggerSessionId)
// so SSE agent.output / agent.running / agent.exited events for the conversation
// route to this panel's lines buffer and busy state.
const CHAT_ID = "__repoos-debugger__";
const DEBUGGER_AVATAR = "/assets/repoos-orchestrator-square.webp";

const repo = useRepoStore();
const config = useConfigStore();
const ui = useUiStore();
const router = useRouter();
const draft = ref("");
const submitting = ref(false);
const hydratedEnabled = ref(false);
const log = ref<HTMLElement | null>(null);
const draftTextarea = ref<HTMLTextAreaElement | null>(null);
const repairing = ref(false);
const repaired = ref(false);

interface DebuggerResponse {
  ok: boolean;
  enabled: boolean;
  lines: AgentOutputEntry[];
  running: boolean;
}

const enabled = computed(() => evalBuiltInEnabled() || hydratedEnabled.value);
const busy = computed(() => submitting.value || repo.runningIds.includes(CHAT_ID));
const lines = computed(() => repo.outputs[CHAT_ID] ?? []);
const hasConversation = computed(() => lines.value.length > 0);
const repairTaskId = computed(() => {
  const text = lines.value.map(lineText).join("\n");
  const matches = [...text.matchAll(/task\s+#(\d{4})/gi)];
  return matches.length ? matches[matches.length - 1][1] : null;
});
const diagnosis = computed(() => lines.value.map(lineText).filter(Boolean).slice(-8).join("\n"));
// Chat scroll standard (#0444): open on the newest message, remember where the
// reader was, and offer a jump back down once they scroll away.
const { showJumpToLatest, onScroll, scrollToLatest } = useChatScroll(log, {
  chatId: CHAT_ID,
  contentSize: () => lines.value.length,
  active: () => props.open,
});

const providerError = computed(
  () =>
    lines.value
      .map(lineText)
      .reverse()
      .find((text) =>
        /unexpected server error|unknownerror|connection|credit|rate limit/i.test(text),
      ) ?? null,
);

function configureDebugger(): void {
  emit("close");
  void router.push({ name: "agents" });
}

async function repair(): Promise<void> {
  if (!repairTaskId.value || repairing.value || !diagnosis.value) return;
  repairing.value = true;
  try {
    await api(
      "/api/debugger/repair",
      JSON_OPTS("POST", { taskId: repairTaskId.value, diagnosis: diagnosis.value }),
    );
    repaired.value = true;
    // The engineer now takes over: drop the Debugger panel and open the task
    // drawer (agent session) so the human can watch the fix being carried out
    // instead of staring at a panel stuck on "engineer repairing" (0274).
    emit("close");
    const task = await repo.fetchTask(repairTaskId.value);
    await ui.openTask(task);
    ui.activeTab = "agent";
  } catch (error) {
    repo.onError(error);
  } finally {
    repairing.value = false;
  }
}

// Read the Debugger's enabled state from persisted builtInAgents config.
function evalBuiltInEnabled(): boolean {
  const data = config.data as Record<string, unknown> | null;
  if (!data) return hydratedEnabled.value;
  const agents = data.builtInAgents as Record<string, { enabled?: boolean }> | undefined;
  if (!agents || agents.debugger === undefined) return hydratedEnabled.value;
  return Boolean(agents.debugger.enabled);
}

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
    const response = await api<DebuggerResponse>("/api/debugger");
    hydratedEnabled.value = response.enabled;
    repo.outputs[CHAT_ID] = response.lines;
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
    await api("/api/debugger/message", JSON_OPTS("POST", { text }));
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
 * Interrupt the Debugger's in-flight response. The server stops the running
 * agent turn and appends a "response interrupted" marker to the conversation.
 * Best-effort — a 404 when nothing is running is harmless.
 */
async function interrupt(): Promise<void> {
  try {
    await api("/api/debugger/interrupt", { method: "POST" });
  } catch (error) {
    repo.onError(error);
  }
}

// Following new output (and restoring a remembered position on open) is
// useChatScroll's job — see docs/ai-chat-standards.md (#0444).

onMounted(() => {
  void config.load();
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
    title="Debugger"
    description="Paste a bug and diagnose it."
    @close="emit('close')"
  >
    <header class="debugger-header">
      <div class="debugger-avatar" aria-hidden="true">
        <img :src="DEBUGGER_AVATAR" alt="Debugger" />
      </div>
      <div class="debugger-identity">
        <strong>Debugger</strong>
        <span
          ><i :class="{ off: !enabled }"></i
          >{{ enabled ? "Bug diagnostician" : "Disabled on Agents page" }}</span
        >
      </div>
      <button
        class="close-x debugger-close"
        type="button"
        aria-label="Close Debugger"
        title="Close"
        @click="emit('close')"
      >
        <X class="size-[15px]" />
      </button>
    </header>

    <div class="debugger-log-wrap">
      <div
        ref="log"
        class="debugger-log ai-chat-log"
        role="log"
        aria-live="polite"
        aria-label="Conversation with the Debugger"
        @scroll="onScroll"
      >
        <div v-if="!hasConversation" class="debugger-welcome">
          <div class="debugger-welcome-avatar"><img :src="DEBUGGER_AVATAR" alt="Debugger" /></div>
          <strong>Paste a bug, get a diagnosis</strong>
          <p>
            Paste an error message, stack trace, or buggy code and I'll find the root cause and
            suggest a fix.
          </p>
          <div class="debugger-prompts">
            <button type="button" @click="draft = 'Here is an error I hit…'">Report a bug</button>
            <button type="button" @click="draft = 'Why does this keep failing?'">
              Explain a recurring failure
            </button>
          </div>
        </div>
        <template v-for="(entry, index) in lines" :key="index">
          <div
            v-if="lineKind(entry) !== 'hidden'"
            class="debugger-row"
            :class="`debugger-row-${lineKind(entry)}`"
          >
            <div v-if="lineKind(entry) === 'assistant'" class="debugger-mini-avatar">
              <img :src="DEBUGGER_AVATAR" alt="D" />
            </div>
            <div class="debugger-bubble" :class="`debugger-bubble-${lineKind(entry)}`">
              <div
                v-if="lineKind(entry) === 'assistant'"
                class="debugger-markdown"
                v-html="renderMarkdown(lineText(entry))"
              ></div>
              <span v-else>{{ lineText(entry) }}</span>
              <span v-if="lineKind(entry) !== 'status' && entry.at" class="msg-time">{{
                fmtTime(entry.at)
              }}</span>
            </div>
          </div>
        </template>
        <AiChatThinking class="ai-chat-avatar-offset" :active="busy" label="Debugger is working" />
        <div v-if="providerError && !busy" class="debugger-provider-error" role="alert">
          <strong>The Debugger's agent or model could not respond.</strong>
          <span
            >It may be out of credit, unavailable, or disconnected. Choose a different agent or
            model, then try again.</span
          >
          <button type="button" @click="configureDebugger">Change agent or model</button>
        </div>
        <div v-if="repairTaskId && !busy" class="debugger-repair">
          <button type="button" :disabled="repairing || repaired" @click="repair">
            {{
              repairing
                ? "Implementing fix…"
                : repaired
                  ? "Fix handed to engineer"
                  : "Implement fix"
            }}
          </button>
        </div>
      </div>
    </div>

    <ChatJumpToLatest :visible="showJumpToLatest" :anchor="log" @click="scrollToLatest()" />

    <form class="debugger-compose" @submit.prevent="send">
      <textarea
        ref="draftTextarea"
        v-model="draft"
        rows="1"
        :disabled="!enabled"
        :placeholder="
          enabled
            ? 'Paste the bug, error, or stack trace…'
            : 'Enable the Debugger on the Agents page'
        "
        aria-label="Message the Debugger"
        @keydown="onKeydown"
        @input="adjustDraftHeight"
      ></textarea>
      <VoiceDictate :disabled="!enabled" @transcribed="onDraftTranscribed" />
      <button
        v-if="busy"
        type="button"
        class="debugger-stop"
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
        aria-label="Diagnose"
      >
        Diagnose
      </button>
    </form>
  </FloatingHeadPanel>
</template>

<style scoped>
.debugger-repair {
  padding: 0 14px 10px;
}
.debugger-repair button {
  border: 1px solid var(--cyan);
  border-radius: 9px;
  padding: 8px 10px;
  background: var(--btn-primary-bg);
  color: var(--btn-primary-color);
  font: 600 11px var(--font-sans);
  cursor: pointer;
}
.debugger-repair button:disabled {
  opacity: 0.6;
  cursor: default;
}
.debugger-header {
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 13px 14px;
  border-bottom: 1px solid var(--border);
  background: var(--topbar-bg);
}
.debugger-avatar {
  width: 38px;
  height: 38px;
  flex: none;
  border-radius: 50%;
  overflow: hidden;
  border: 1px solid var(--border-bright);
}
.debugger-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.debugger-identity {
  display: flex;
  flex: 1;
  min-width: 0;
  flex-direction: column;
  gap: 3px;
}
.debugger-identity strong {
  font-size: 13.5px;
  letter-spacing: -0.01em;
}
.debugger-identity span {
  display: flex;
  align-items: center;
  gap: 6px;
  font:
    500 10px "JetBrains Mono",
    monospace;
  color: var(--txt-dim);
}
.debugger-identity i {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--green);
  box-shadow: 0 0 6px var(--green);
}
.debugger-identity i.off {
  background: var(--txt-faint);
  box-shadow: none;
}
.debugger-log-wrap {
  position: relative;
  flex: 1;
  display: flex;
  min-height: 0;
}
/* Vertical rhythm between messages comes from .ai-chat-log (style.css). */
.debugger-log {
  flex: 1;
  overflow-y: auto;
  padding: 16px 14px;
}
.debugger-welcome {
  margin: auto 0;
  text-align: center;
  padding: 22px 12px;
  color: var(--txt-dim);
}
.debugger-welcome-avatar {
  width: 52px;
  height: 52px;
  margin: 0 auto 12px;
  border-radius: 50%;
  overflow: hidden;
  border: 1px solid var(--border-bright);
}
.debugger-welcome-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.debugger-welcome strong {
  display: block;
  color: var(--txt);
  font-size: 14px;
  margin-bottom: 6px;
}
.debugger-welcome p {
  font-size: 11.5px;
  line-height: 1.55;
  max-width: 280px;
  margin: 0 auto;
}
.debugger-prompts {
  display: flex;
  justify-content: center;
  flex-wrap: wrap;
  gap: 7px;
  margin-top: 14px;
}
.debugger-prompts button {
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 6px 9px;
  background: var(--panel);
  color: var(--txt-dim);
  font: 500 10px var(--font-sans);
  cursor: pointer;
}
.debugger-prompts button:hover {
  border-color: var(--border-bright);
  color: var(--txt);
}
.debugger-row {
  display: flex;
  align-items: flex-end;
  gap: 7px;
}
.debugger-row-human {
  justify-content: flex-end;
}
.debugger-mini-avatar {
  width: 24px;
  height: 24px;
  flex: none;
  border-radius: 50%;
  overflow: hidden;
  border: 1px solid var(--border);
}
.debugger-mini-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.debugger-bubble {
  max-width: 84%;
  padding: 9px 11px;
  border-radius: 13px;
  font-size: 12px;
  line-height: 1.55;
  overflow-wrap: anywhere;
}
.debugger-bubble-human {
  color: var(--btn-primary-color);
  background: var(--btn-primary-bg);
  border: 1px solid var(--border-bright);
  border-bottom-right-radius: 4px;
}
.debugger-bubble-assistant {
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
.debugger-row-status {
  justify-content: center;
}
.debugger-bubble-status {
  padding: 4px 8px;
  background: transparent;
  color: var(--txt-faint);
  font:
    500 9.5px "JetBrains Mono",
    monospace;
  text-align: center;
}
.debugger-markdown :deep(p) {
  margin: 0 0 7px;
}
.debugger-markdown :deep(p:last-child) {
  margin-bottom: 0;
}
.debugger-markdown :deep(ul),
.debugger-markdown :deep(ol) {
  padding-left: 17px;
  margin: 5px 0;
}
.debugger-markdown :deep(code) {
  font:
    10.5px "JetBrains Mono",
    monospace;
  background: var(--md-body-bg);
  border-radius: 4px;
  padding: 1px 4px;
}
.debugger-markdown :deep(pre) {
  overflow: auto;
  margin: 7px 0;
  padding: 8px;
  background: var(--md-body-bg);
  border-radius: 7px;
}
.debugger-markdown :deep(pre code) {
  padding: 0;
  background: none;
}
.debugger-markdown :deep(a) {
  color: var(--cyan);
}
.debugger-provider-error {
  display: flex;
  flex-direction: column;
  gap: 7px;
  padding: 10px 11px;
  border: 1px solid var(--red, #ef5b5b);
  border-radius: 10px;
  background: color-mix(in srgb, var(--red, #ef5b5b) 10%, var(--panel));
  color: var(--txt-dim);
  font-size: 11px;
  line-height: 1.45;
}
.debugger-provider-error strong {
  color: var(--txt);
  font-size: 11px;
}
.debugger-provider-error button {
  align-self: flex-start;
  border: 1px solid var(--border-bright);
  border-radius: 7px;
  padding: 6px 8px;
  background: var(--panel-solid);
  color: var(--txt);
  font: 600 10px var(--font-sans);
  cursor: pointer;
}
.debugger-provider-error button:hover {
  border-color: var(--cyan);
  color: var(--cyan);
}
.debugger-compose {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  /* #0444: the helper line under the compose row is gone, so the row now owns
     the panel's bottom spacing. */
  margin: 0 12px 12px;
  padding: 8px 9px 8px 12px;
  border: 1px solid var(--border);
  border-radius: 13px;
  background: var(--panel-solid);
}
.debugger-compose:focus-within {
  border-color: var(--border-bright);
  box-shadow: 0 0 0 3px var(--cyan-dim);
}
.debugger-compose textarea {
  flex: 1;
  min-height: 34px;
  max-height: 120px;
  overflow-y: auto;
  resize: none;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--txt);
  font: 12.5px/1.55 var(--font-sans);
}
.debugger-compose textarea::placeholder {
  color: var(--txt-faint);
}
.debugger-compose button {
  /* Deliberately no `background`/`color`: this scoped rule out-specifies
     the shared .ai-chat-send, so setting a fill here would silently win
     and leave the send button looking transparent. The send button takes
     .ai-chat-send; .debugger-stop sets its own. */

  width: auto;
  padding: 0 11px;
  height: 31px;
  flex: none;
  border: 0;
  border-radius: 9px;
  cursor: pointer;
  font: 500 11px var(--font-sans);
}
.debugger-compose button:disabled {
  opacity: 0.4;
  cursor: default;
}
.debugger-compose button.debugger-stop {
  width: 31px;
  padding: 0;
  display: grid;
  place-items: center;
  color: var(--red, #ef5b5b);
  background: color-mix(in srgb, var(--red, #ef5b5b) 16%, var(--btn-primary-bg));
}
.debugger-compose button.debugger-stop svg {
  width: 16px;
  height: 16px;
}
</style>
