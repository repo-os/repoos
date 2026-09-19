<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from "vue";
import { api, JSON_OPTS } from "../api";
import { renderMarkdown } from "../lib/markdown";
import { fmtTime } from "../lib/time";
import { useConfigStore } from "../stores/config";
import { useRepoStore } from "../stores/repo";
import { useUiStore } from "../stores/ui";
import type { AgentOutputEntry, Task } from "../types";
import VoiceDictate from "./VoiceDictate.vue";
import { insertTextAtCursor } from "../utils/text-insertion";
import { autoGrowTextarea } from "../utils/textarea-autogrow";
import SendToEngineerDialog from "./SendToEngineerDialog.vue";
import AiChatThinking from "./AiChatThinking.vue";
import ChatJumpToLatest from "./ChatJumpToLatest.vue";
import { useChatScroll } from "../composables/useChatScroll";

const props = withDefaults(defineProps<{ task: Task; active?: boolean }>(), { active: true });
const emit = defineEmits<{ close: [] }>();

const DEBUGGER_AVATAR = "/assets/repoos-orchestrator-square.webp";
const CHAT_ID = computed(() => `debugger:${props.task.id}`);

const repo = useRepoStore();
const config = useConfigStore();
const ui = useUiStore();
const draft = ref("");
const submitting = ref(false);
const hydratedEnabled = ref(false);
const log = ref<HTMLElement | null>(null);
const draftTextarea = ref<HTMLTextAreaElement | null>(null);

const enabled = computed(() => evalBuiltInEnabled() || hydratedEnabled.value);
const busy = computed(() => submitting.value || repo.runningIds.includes(CHAT_ID.value));
const lines = computed(() => repo.outputs[CHAT_ID.value] ?? []);
const hasConversation = computed(() => lines.value.length > 0);

// Chat scroll standard (#0444): open on the newest message, remember the
// reader's position per task, and offer a jump back down once they scroll away.
const { showJumpToLatest, onScroll, scrollToLatest } = useChatScroll(log, {
  chatId: () => CHAT_ID.value,
  contentSize: () => lines.value.length,
  active: () => props.active,
});

const dispatchRole = ref<null | "engineer" | "pm">(null);
const dispatchBusy = ref(false);
const dispatchErr = ref("");

interface TaskDebuggerResponse {
  ok: boolean;
  enabled: boolean;
  lines: AgentOutputEntry[];
  running: boolean;
}

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
    const response = await api<TaskDebuggerResponse>(`/api/tasks/${props.task.id}/debugger`);
    hydratedEnabled.value = response.enabled;
    repo.outputs[CHAT_ID.value] = response.lines;
    if (response.running && !repo.runningIds.includes(CHAT_ID.value)) {
      repo.runningIds = [...repo.runningIds, CHAT_ID.value];
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
  repo.outputs[CHAT_ID.value] = [...lines.value, optimistic];
  draft.value = "";
  scrollToLatest("auto");
  try {
    await api(`/api/tasks/${props.task.id}/debugger/message`, JSON_OPTS("POST", { text }));
  } catch (error) {
    repo.outputs[CHAT_ID.value] = (repo.outputs[CHAT_ID.value] ?? []).filter(
      (_entry, index) => index !== optimisticIndex,
    );
    draft.value = text;
    repo.outputs[CHAT_ID.value] = [
      ...(repo.outputs[CHAT_ID.value] ?? []),
      { type: "sys", d: error instanceof Error ? error.message : String(error) },
    ];
    repo.onError(error);
  } finally {
    submitting.value = false;
  }
}

async function interrupt(): Promise<void> {
  try {
    await api(`/api/tasks/${props.task.id}/debugger/interrupt`, { method: "POST" });
  } catch (error) {
    repo.onError(error);
  }
}

function openDispatch(role: "engineer" | "pm"): void {
  dispatchRole.value = role;
  dispatchErr.value = "";
}

function closeDispatch(): void {
  dispatchRole.value = null;
}

async function confirmDispatch(note: string): Promise<void> {
  if (!dispatchRole.value) return;
  const role = dispatchRole.value;
  dispatchBusy.value = true;
  dispatchErr.value = "";
  try {
    const endpoint =
      role === "engineer"
        ? `/api/tasks/${props.task.id}/debugger/send-to-engineer`
        : `/api/tasks/${props.task.id}/debugger/send-to-pm`;
    const instruction =
      role === "engineer"
        ? note.trim()
          ? `Based on the Debugger's diagnosis, please act on the following instruction:\n\n${note.trim()}`
          : "Resume work on this task using the Debugger's diagnosis to fix the failure."
        : note.trim();
    await api(endpoint, JSON_OPTS("POST", { text: instruction }));
    closeDispatch();
  } catch (error) {
    dispatchErr.value = error instanceof Error ? error.message : String(error);
  } finally {
    dispatchBusy.value = false;
  }
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key !== "Enter" || event.shiftKey || event.isComposing) return;
  event.preventDefault();
  void send();
}

function onDraftTranscribed(text: string): void {
  if (draftTextarea.value) {
    insertTextAtCursor(draftTextarea.value, text);
  }
}

function adjustDraftHeight(): void {
  autoGrowTextarea(draftTextarea.value);
}

// Following new output is useChatScroll's job (#0444).

watch(
  () => props.task.id,
  () => {
    void hydrate();
  },
);

onMounted(() => {
  void config.load();
  void hydrate();
});

watch(
  () => draft.value,
  () => {
    nextTick(adjustDraftHeight);
  },
);
</script>

<template>
  <div class="td-bg">
    <div v-if="!enabled" class="td-disabled">
      <strong>Debugger is disabled</strong>
      <span
        >Enable the Debugger on the <RouterLink :to="{ name: 'agents' }">Agents page</RouterLink> to
        chat about this task.</span
      >
    </div>

    <template v-else>
      <div
        ref="log"
        class="td-log ai-chat-log"
        role="log"
        aria-live="polite"
        aria-label="Conversation with the Debugger"
        @scroll="onScroll"
      >
        <div v-if="!hasConversation" class="td-welcome">
          <div class="td-welcome-avatar"><img :src="DEBUGGER_AVATAR" alt="Debugger" /></div>
          <strong>Debug this task</strong>
          <p>
            I have this task's spec, logs, and every agent conversation (PM, engineer, reviewer).
            Tell me what broke and I'll explain the cause and the fix.
          </p>
          <div class="td-prompts">
            <button type="button" @click="draft = 'Why is this task failing?'">
              Why is this failing?
            </button>
            <button
              type="button"
              @click="draft = 'Explain the engineer auth error and how to fix it'"
            >
              Explain the auth error
            </button>
          </div>
        </div>
        <template v-for="(entry, index) in lines" :key="index">
          <div
            v-if="lineKind(entry) !== 'hidden'"
            class="td-row"
            :class="`td-row-${lineKind(entry)}`"
          >
            <div v-if="lineKind(entry) === 'assistant'" class="td-mini-avatar">
              <img :src="DEBUGGER_AVATAR" alt="D" />
            </div>
            <div class="td-bubble" :class="`td-bubble-${lineKind(entry)}`">
              <div
                v-if="lineKind(entry) === 'assistant'"
                class="td-markdown"
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
        <div v-if="dispatchErr" class="td-dispatch-err" role="alert">{{ dispatchErr }}</div>
      </div>

      <ChatJumpToLatest :visible="showJumpToLatest" :anchor="log" @click="scrollToLatest()" />

      <div class="td-dispatch">
        <button type="button" :disabled="busy" @click="openDispatch('engineer')">
          Send to engineer
        </button>
        <button type="button" :disabled="busy" @click="openDispatch('pm')">Send to PM</button>
      </div>

      <form class="td-compose" @submit.prevent="send">
        <textarea
          ref="draftTextarea"
          v-model="draft"
          rows="1"
          :disabled="!enabled"
          :placeholder="
            enabled ? 'Ask the Debugger about this task…' : 'Enable the Debugger on the Agents page'
          "
          aria-label="Message the Debugger"
          @keydown="onKeydown"
          @input="adjustDraftHeight"
        ></textarea>
        <VoiceDictate :disabled="!enabled" @transcribed="onDraftTranscribed" />
        <button
          v-if="busy"
          type="button"
          class="td-stop"
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
    </template>

    <SendToEngineerDialog
      v-if="dispatchRole"
      :open="true"
      :busy="dispatchBusy"
      :title="dispatchRole === 'engineer' ? 'Send to engineer' : 'Send to PM'"
      @cancel="closeDispatch"
      @confirm="confirmDispatch"
    />
  </div>
</template>

<style scoped>
.td-bg {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-height: 0;
  flex: 1;
}
.td-disabled {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 14px;
  border: 1px dashed var(--border);
  border-radius: 10px;
  color: var(--txt-dim);
  font-size: 12px;
  line-height: 1.5;
}
.td-disabled strong {
  color: var(--txt);
  font-size: 13px;
}
.td-disabled a {
  color: var(--cyan);
}
/* Vertical rhythm between messages comes from .ai-chat-log (style.css). */
.td-log {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 4px 2px;
}
.td-welcome {
  margin: auto 0;
  text-align: center;
  padding: 18px 12px;
  color: var(--txt-dim);
}
.td-welcome-avatar {
  width: 48px;
  height: 48px;
  margin: 0 auto 10px;
  border-radius: 50%;
  overflow: hidden;
  border: 1px solid var(--border-bright);
}
.td-welcome-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.td-welcome strong {
  display: block;
  color: var(--txt);
  font-size: 14px;
  margin-bottom: 6px;
}
.td-welcome p {
  font-size: 11.5px;
  line-height: 1.55;
  max-width: 300px;
  margin: 0 auto;
}
.td-prompts {
  display: flex;
  justify-content: center;
  flex-wrap: wrap;
  gap: 7px;
  margin-top: 14px;
}
.td-prompts button {
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 6px 9px;
  background: var(--panel);
  color: var(--txt-dim);
  font: 500 10px var(--font-sans);
  cursor: pointer;
}
.td-prompts button:hover {
  border-color: var(--border-bright);
  color: var(--txt);
}
.td-row {
  display: flex;
  align-items: flex-end;
  gap: 7px;
}
.td-row-human {
  justify-content: flex-end;
}
.td-mini-avatar {
  width: 24px;
  height: 24px;
  flex: none;
  border-radius: 50%;
  overflow: hidden;
  border: 1px solid var(--border);
}
.td-mini-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.td-bubble {
  max-width: 84%;
  padding: 9px 11px;
  border-radius: 13px;
  font-size: 12px;
  line-height: 1.55;
  overflow-wrap: anywhere;
}
.td-bubble-human {
  color: var(--btn-primary-color);
  background: var(--btn-primary-bg);
  border: 1px solid var(--border-bright);
  border-bottom-right-radius: 4px;
}
.td-bubble-assistant {
  color: var(--txt);
  background: var(--panel);
  border: 1px solid var(--border);
  border-bottom-left-radius: 4px;
}
.td-bubble-status {
  padding: 4px 8px;
  background: transparent;
  color: var(--txt-faint);
  font:
    500 9.5px "JetBrains Mono",
    monospace;
  text-align: center;
}
.td-row-status {
  justify-content: center;
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
.td-markdown :deep(p) {
  margin: 0 0 7px;
}
.td-markdown :deep(p:last-child) {
  margin-bottom: 0;
}
.td-markdown :deep(ul),
.td-markdown :deep(ol) {
  padding-left: 17px;
  margin: 5px 0;
}
.td-markdown :deep(code) {
  font:
    10.5px "JetBrains Mono",
    monospace;
  background: var(--md-body-bg);
  border-radius: 4px;
  padding: 1px 4px;
}
.td-markdown :deep(pre) {
  overflow: auto;
  margin: 7px 0;
  padding: 8px;
  background: var(--md-body-bg);
  border-radius: 7px;
}
.td-markdown :deep(pre code) {
  padding: 0;
  background: none;
}
.td-markdown :deep(a) {
  color: var(--cyan);
}
.td-dispatch-err {
  padding: 8px 10px;
  border: 1px solid var(--red, #ef5b5b);
  border-radius: 9px;
  background: color-mix(in srgb, var(--red, #ef5b5b) 10%, var(--panel));
  color: var(--txt-dim);
  font-size: 11px;
  line-height: 1.45;
}
.td-dispatch {
  display: flex;
  gap: 8px;
}
.td-dispatch button {
  flex: 1;
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: 9px;
  background: var(--panel);
  color: var(--txt);
  font: 600 11px var(--font-sans);
  cursor: pointer;
}
.td-dispatch button:hover:not(:disabled) {
  border-color: var(--cyan);
  color: var(--cyan);
}
.td-dispatch button:disabled {
  opacity: 0.5;
  cursor: default;
}
.td-compose {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  padding: 8px 9px 8px 12px;
  border: 1px solid var(--border);
  border-radius: 13px;
  background: var(--panel-solid);
}
.td-compose:focus-within {
  border-color: var(--border-bright);
  box-shadow: 0 0 0 3px var(--cyan-dim);
}
.td-compose textarea {
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
.td-compose textarea::placeholder {
  color: var(--txt-faint);
}
.td-compose button {
  width: auto;
  padding: 0 11px;
  height: 31px;
  flex: none;
  border: 0;
  border-radius: 9px;
  /* Fill comes from .ai-chat-send / .td-stop below. */
  background: transparent;
  color: var(--txt-dim);
  cursor: pointer;
  font: 500 11px var(--font-sans);
}
.td-compose button:disabled {
  opacity: 0.4;
  cursor: default;
}
.td-compose button.td-stop {
  width: 31px;
  padding: 0;
  display: grid;
  place-items: center;
  color: var(--red, #ef5b5b);
  background: color-mix(in srgb, var(--red, #ef5b5b) 16%, var(--btn-primary-bg));
}
.td-compose button.td-stop svg {
  width: 16px;
  height: 16px;
}
</style>
