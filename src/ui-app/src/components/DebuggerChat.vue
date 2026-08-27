<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { api, JSON_OPTS } from "../api";
import { renderMarkdown } from "../lib/markdown";
import { fmtTime } from "../lib/time";
import { useConfigStore } from "../stores/config";
import { useRepoStore } from "../stores/repo";
import { useUiStore } from "../stores/ui";
import type { AgentOutputEntry } from "../types";
import VoiceDictate from "./VoiceDictate.vue";
import { insertTextAtCursor } from "../utils/text-insertion";

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
const showScrollToBottom = ref(false);
const SCROLL_BOTTOM_THRESHOLD = 80;

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
const providerError = computed(() => lines.value
  .map(lineText)
  .reverse()
  .find((text) => /unexpected server error|unknownerror|connection|credit|rate limit/i.test(text)) ?? null);

function configureDebugger(): void {
  emit("close");
  void router.push({ name: "agents" });
}

async function repair(): Promise<void> {
  if (!repairTaskId.value || repairing.value || !diagnosis.value) return;
  repairing.value = true;
  try {
    await api("/api/debugger/repair", JSON_OPTS("POST", { taskId: repairTaskId.value, diagnosis: diagnosis.value }));
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

function scrollToLatest(): void {
  nextTick(() => {
    if (log.value) log.value.scrollTop = log.value.scrollHeight;
    showScrollToBottom.value = false;
  });
}

function onLogScroll(): void {
  const el = log.value;
  if (!el) return;
  showScrollToBottom.value = el.scrollHeight - el.scrollTop - el.clientHeight > SCROLL_BOTTOM_THRESHOLD;
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
  scrollToLatest();
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
    textarea.style.height = Math.min(textarea.scrollHeight, 200) + 'px';
  }
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

watch(() => lines.value.length, () => {
  if (props.open) scrollToLatest();
});

watch(() => props.open, (isOpen) => {
  if (isOpen) scrollToLatest();
});

onMounted(() => {
  void config.load();
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
    class="debugger-panel"
    aria-label="Debugger chat"
  >
    <header class="debugger-header">
      <div class="debugger-avatar" aria-hidden="true">
        <img :src="DEBUGGER_AVATAR" alt="Debugger" />
      </div>
      <div class="debugger-identity">
        <strong>Debugger</strong>
        <span><i :class="{ off: !enabled }"></i>{{ enabled ? "Bug diagnostician" : "Disabled on Agents page" }}</span>
      </div>
      <button class="debugger-minimize" type="button" aria-label="Minimize Debugger" title="Minimize" @click="emit('close')">
        <svg viewBox="0 0 20 20" fill="none"><path d="M4 10h12" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" /></svg>
      </button>
    </header>

    <div class="debugger-log-wrap">
    <div ref="log" class="debugger-log" role="log" aria-live="polite" aria-label="Conversation with the Debugger" @scroll="onLogScroll">
      <div v-if="!hasConversation" class="debugger-welcome">
        <div class="debugger-welcome-avatar"><img :src="DEBUGGER_AVATAR" alt="Debugger" /></div>
        <strong>Paste a bug, get a diagnosis</strong>
        <p>Paste an error message, stack trace, or buggy code and I'll find the root cause and suggest a fix.</p>
        <div class="debugger-prompts">
          <button type="button" @click="draft = 'Here is an error I hit…'">Report a bug</button>
          <button type="button" @click="draft = 'Why does this keep failing?'">Explain a recurring failure</button>
        </div>
      </div>
      <template v-for="(entry, index) in lines" :key="index">
        <div v-if="lineKind(entry) !== 'hidden'" class="debugger-row" :class="`debugger-row-${lineKind(entry)}`">
          <div v-if="lineKind(entry) === 'assistant'" class="debugger-mini-avatar"><img :src="DEBUGGER_AVATAR" alt="D" /></div>
          <div class="debugger-bubble" :class="`debugger-bubble-${lineKind(entry)}`">
            <div v-if="lineKind(entry) === 'assistant'" class="debugger-markdown" v-html="renderMarkdown(lineText(entry))"></div>
            <span v-else>{{ lineText(entry) }}</span>
            <span v-if="lineKind(entry) !== 'status' && entry.at" class="msg-time">{{ fmtTime(entry.at) }}</span>
          </div>
        </div>
      </template>
      <div v-if="busy" class="debugger-thinking" aria-label="Debugger is working">
        <span></span><span></span><span></span>
      </div>
      <div v-if="providerError && !busy" class="debugger-provider-error" role="alert">
        <strong>The Debugger's agent or model could not respond.</strong>
        <span>It may be out of credit, unavailable, or disconnected. Choose a different agent or model, then try again.</span>
        <button type="button" @click="configureDebugger">Change agent or model</button>
      </div>
      <div v-if="repairTaskId && !busy" class="debugger-repair">
        <button type="button" :disabled="repairing || repaired" @click="repair">{{ repairing ? "Implementing fix…" : repaired ? "Fix handed to engineer" : "Implement fix" }}</button>
      </div>
    </div>
    <button v-if="showScrollToBottom" type="button" class="debugger-scroll-bottom" aria-label="Scroll to latest messages" @click="scrollToLatest">
      <svg viewBox="0 0 20 20" fill="none"><path d="M5 8l5 5 5-5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" /></svg>
      Scroll to bottom
    </button>
    </div>

    <form class="debugger-compose" @submit.prevent="send">
      <textarea
        ref="draftTextarea"
        v-model="draft"
        rows="1"
        :disabled="!enabled"
        :placeholder="enabled ? 'Paste the bug, error, or stack trace…' : 'Enable the Debugger on the Agents page'"
        aria-label="Message the Debugger"
        @keydown="onKeydown"
        @input="adjustTextareaHeight"
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
        <svg viewBox="0 0 20 20" fill="none"><rect x="5" y="5" width="10" height="10" rx="1.5" fill="currentColor" /></svg>
      </button>
      <button v-else type="submit" :disabled="!draft.trim() || busy || !enabled" aria-label="Diagnose">
        Diagnose
      </button>
    </form>
    <div class="debugger-footnote">Paste a bug → root cause + suggested fix · Conversation stays open</div>
  </aside>
</template>

<style scoped>
.debugger-panel{position:fixed;right:0;top:0;bottom:0;width:min(420px,100vw);height:100dvh;display:flex;flex-direction:column;overflow:hidden;border-left:1px solid var(--border-bright);background:var(--panel-gradient);box-shadow:-24px 0 70px rgba(0,0,0,.28);backdrop-filter:blur(18px);animation:debugger-open .18s ease-out;pointer-events:auto;z-index:110}
.debugger-repair{padding:0 14px 10px}.debugger-repair button{border:1px solid var(--cyan);border-radius:9px;padding:8px 10px;background:var(--btn-primary-bg);color:var(--btn-primary-color);font:600 11px var(--font-sans);cursor:pointer}.debugger-repair button:disabled{opacity:.6;cursor:default}
.debugger-header{display:flex;align-items:center;gap:11px;padding:13px 14px;border-bottom:1px solid var(--border);background:var(--topbar-bg)}
.debugger-avatar{width:38px;height:38px;flex:none;border-radius:50%;overflow:hidden;border:1px solid var(--border-bright)}
.debugger-avatar img{width:100%;height:100%;object-fit:cover}
.debugger-identity{display:flex;flex:1;min-width:0;flex-direction:column;gap:3px}
.debugger-identity strong{font-size:13.5px;letter-spacing:-.01em}
.debugger-identity span{display:flex;align-items:center;gap:6px;font:500 10px 'JetBrains Mono',monospace;color:var(--txt-dim)}
.debugger-identity i{width:6px;height:6px;border-radius:50%;background:var(--green);box-shadow:0 0 6px var(--green)}
.debugger-identity i.off{background:var(--txt-faint);box-shadow:none}
.debugger-minimize{width:34px;height:34px;display:grid;place-items:center;border:0;border-radius:9px;background:transparent;color:var(--txt-dim);cursor:pointer}
.debugger-minimize:hover{background:var(--nav-hover-bg);color:var(--txt)}
.debugger-minimize svg{width:19px;height:19px}
.debugger-log-wrap{position:relative;flex:1;display:flex;min-height:0}
.debugger-log{flex:1;overflow-y:auto;display:flex;flex-direction:column;gap:11px;padding:16px 14px;overscroll-behavior:contain}
.debugger-scroll-bottom{position:absolute;left:50%;bottom:14px;transform:translateX(-50%);display:flex;align-items:center;gap:5px;padding:7px 12px;border:1px solid var(--border-bright);border-radius:999px;background:var(--panel-solid);color:var(--txt);font:600 10.5px var(--font-sans);cursor:pointer;box-shadow:0 6px 18px rgba(0,0,0,.28);z-index:2}
.debugger-scroll-bottom:hover{border-color:var(--cyan);color:var(--cyan)}
.debugger-scroll-bottom svg{width:13px;height:13px}
.debugger-welcome{margin:auto 0;text-align:center;padding:22px 12px;color:var(--txt-dim)}
.debugger-welcome-avatar{width:52px;height:52px;margin:0 auto 12px;border-radius:50%;overflow:hidden;border:1px solid var(--border-bright)}
.debugger-welcome-avatar img{width:100%;height:100%;object-fit:cover}
.debugger-welcome strong{display:block;color:var(--txt);font-size:14px;margin-bottom:6px}
.debugger-welcome p{font-size:11.5px;line-height:1.55;max-width:280px;margin:0 auto}
.debugger-prompts{display:flex;justify-content:center;flex-wrap:wrap;gap:7px;margin-top:14px}
.debugger-prompts button{border:1px solid var(--border);border-radius:999px;padding:6px 9px;background:var(--panel);color:var(--txt-dim);font:500 10px var(--font-sans);cursor:pointer}
.debugger-prompts button:hover{border-color:var(--border-bright);color:var(--txt)}
.debugger-row{display:flex;align-items:flex-end;gap:7px}
.debugger-row-human{justify-content:flex-end}
.debugger-mini-avatar{width:24px;height:24px;flex:none;border-radius:50%;overflow:hidden;border:1px solid var(--border)}
.debugger-mini-avatar img{width:100%;height:100%;object-fit:cover}
.debugger-bubble{max-width:84%;padding:9px 11px;border-radius:13px;font-size:12px;line-height:1.55;overflow-wrap:anywhere}
.debugger-bubble-human{color:var(--btn-primary-color);background:var(--btn-primary-bg);border:1px solid var(--border-bright);border-bottom-right-radius:4px}
.debugger-bubble-assistant{color:var(--txt);background:var(--panel);border:1px solid var(--border);border-bottom-left-radius:4px}
.msg-time{display:block;margin-top:3px;text-align:right;color:var(--txt-faint);font:500 8.5px 'JetBrains Mono',monospace;opacity:.8}
.debugger-row-status{justify-content:center}
.debugger-bubble-status{padding:4px 8px;background:transparent;color:var(--txt-faint);font:500 9.5px 'JetBrains Mono',monospace;text-align:center}
.debugger-markdown :deep(p){margin:0 0 7px}
.debugger-markdown :deep(p:last-child){margin-bottom:0}
.debugger-markdown :deep(ul),.debugger-markdown :deep(ol){padding-left:17px;margin:5px 0}
.debugger-markdown :deep(code){font:10.5px 'JetBrains Mono',monospace;background:var(--md-body-bg);border-radius:4px;padding:1px 4px}
.debugger-markdown :deep(pre){overflow:auto;margin:7px 0;padding:8px;background:var(--md-body-bg);border-radius:7px}
.debugger-markdown :deep(pre code){padding:0;background:none}
.debugger-markdown :deep(a){color:var(--cyan)}
.debugger-thinking{display:flex;gap:4px;align-self:flex-start;margin-left:31px;padding:9px 12px;border:1px solid var(--border);border-radius:13px;background:var(--panel)}
.debugger-thinking span{width:5px;height:5px;border-radius:50%;background:var(--txt-faint);animation:debugger-bounce 1.2s infinite}
.debugger-thinking span:nth-child(2){animation-delay:.15s}.debugger-thinking span:nth-child(3){animation-delay:.3s}
.debugger-provider-error{display:flex;flex-direction:column;gap:7px;padding:10px 11px;border:1px solid var(--red,#ef5b5b);border-radius:10px;background:color-mix(in srgb,var(--red,#ef5b5b) 10%,var(--panel));color:var(--txt-dim);font-size:11px;line-height:1.45}.debugger-provider-error strong{color:var(--txt);font-size:11px}.debugger-provider-error button{align-self:flex-start;border:1px solid var(--border-bright);border-radius:7px;padding:6px 8px;background:var(--panel-solid);color:var(--txt);font:600 10px var(--font-sans);cursor:pointer}.debugger-provider-error button:hover{border-color:var(--cyan);color:var(--cyan)}
.debugger-compose{display:flex;align-items:flex-end;gap:8px;margin:0 12px;padding:8px 9px 8px 12px;border:1px solid var(--border);border-radius:13px;background:var(--panel-solid)}
.debugger-compose:focus-within{border-color:var(--border-bright);box-shadow:0 0 0 3px var(--cyan-dim)}
.debugger-compose textarea{flex:1;min-height:34px;max-height:96px;resize:none;border:0;outline:0;background:transparent;color:var(--txt);font:12.5px/1.55 var(--font-sans)}
.debugger-compose textarea::placeholder{color:var(--txt-faint)}
.debugger-compose button{width:auto;padding:0 11px;height:31px;flex:none;border:0;border-radius:9px;background:var(--btn-primary-bg);color:var(--cyan);cursor:pointer;font:500 11px var(--font-sans)}
.debugger-compose button:disabled{opacity:.4;cursor:default}
.debugger-compose button.debugger-stop{width:31px;padding:0;display:grid;place-items:center;color:var(--red,#ef5b5b);background:color-mix(in srgb,var(--red,#ef5b5b) 16%,var(--btn-primary-bg))}
.debugger-compose button.debugger-stop svg{width:16px;height:16px}
.debugger-footnote{padding:7px 14px 10px;text-align:center;color:var(--txt-faint);font:500 8.5px 'JetBrains Mono',monospace}
@keyframes debugger-open{from{opacity:0;transform:translateY(10px) scale(.98)}to{opacity:1;transform:none}}
@keyframes debugger-bounce{0%,70%,100%{transform:translateY(0);opacity:.4}35%{transform:translateY(-3px);opacity:1}}
@media(max-width:760px){.debugger-panel{right:12px;left:12px;width:auto;height:min(560px,calc(100dvh - 150px))}}
@media(prefers-reduced-motion:reduce){.debugger-panel,.debugger-thinking span{animation:none;transition:none}}
</style>
