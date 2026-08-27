<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from "vue";
import { api } from "../api";
import { renderMarkdown } from "../lib/markdown";
import { fmtTime } from "../lib/time";
import { useRepoStore } from "../stores/repo";
import type { AgentOutputEntry } from "../types";

defineProps<{ open: boolean }>();
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

function onKeydown(event: KeyboardEvent): void {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    void send();
  }
  // Note: Shift+Enter inserts a newline instead of sending (changed from previous <input> implementation)
}

function adjustTextareaHeight(): void {
  const textarea = draftTextarea.value;
  if (textarea) {
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
  }
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
  // Adjust textarea height on mount
  setTimeout(() => adjustTextareaHeight(), 0);
});

watch(() => draft.value, () => {
  nextTick(() => adjustTextareaHeight());
});
</script>

<template>
  <aside
    v-if="open"
    class="cto-panel"
    aria-label="CTO Board Monitor"
  >
    <header class="cto-header">
      <div class="cto-avatar" aria-hidden="true">
        <img src="/assets/repoos-cto-square.webp" alt="CTO" />
      </div>
      <div class="cto-identity">
        <strong>CTO Board Monitor</strong>
        <span><i :class="{ off: !enabled }"></i>{{ enabled ? "CTO agent is active" : "Disabled on Agents page" }}</span>
      </div>
      <button class="cto-minimize" type="button" aria-label="Close CTO" title="Close" @click="emit('close')">
        <svg viewBox="0 0 20 20" fill="none"><path d="M4 10h12" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" /></svg>
      </button>
    </header>

    <div class="cto-log" ref="log">
      <div v-if="!enabled" class="cto-disabled">
        <p>CTO agent is disabled. Enable it from the Agents page.</p>
      </div>

      <div v-else-if="report" class="cto-report">
        <div class="cto-report-meta">Latest report at {{ new Date(report.at).toLocaleTimeString() }}</div>
        <div class="cto-report-content" v-html="renderMarkdown(report.markdown)"></div>
      </div>

      <div v-for="(entry, i) of lines" :key="i" :class="`cto-line ${lineKind(entry)}`">
        {{ lineText(entry) }}
        <span v-if="lineKind(entry) !== 'status' && entry.at" class="msg-time">{{ fmtTime(entry.at) }}</span>
      </div>

      <div v-if="busy" class="cto-thinking" aria-label="CTO is thinking">
        <span></span><span></span><span></span>
      </div>
    </div>

    <form class="cto-compose" @submit.prevent="send">
      <textarea
        ref="draftTextarea"
        v-model="draft"
        placeholder="Ask the CTO about board health..."
        :disabled="busy || !enabled"
        rows="1"
        @keydown="onKeydown"
        @input="adjustTextareaHeight"
      ></textarea>
      <button v-if="busy" type="button" class="cto-stop" aria-label="Stop response" title="Stop response" @click="interrupt">
        <svg viewBox="0 0 20 20" fill="none"><rect x="5" y="5" width="10" height="10" rx="1.5" fill="currentColor" /></svg>
      </button>
      <button v-else type="submit" :disabled="busy || !enabled || !draft.trim()">Send</button>
    </form>
  </aside>
</template>

<style scoped>
.cto-panel{position:fixed;top:0;right:0;bottom:0;width:680px;max-width:100vw;display:flex;flex-direction:column;overflow:hidden;border-left:1px solid var(--border-bright);background:var(--panel-gradient);box-shadow:var(--drawer-shadow);animation:cto-open .18s ease-out;pointer-events:auto;z-index:92}
.cto-header{display:flex;align-items:center;gap:11px;padding:13px 14px;border-bottom:1px solid var(--border);background:var(--topbar-bg)}
.cto-avatar{width:38px;height:38px;flex:none;border-radius:50%;overflow:hidden;border:1px solid var(--border-bright)}
.cto-avatar img{width:100%;height:100%;object-fit:cover}
.cto-identity{display:flex;flex:1;min-width:0;flex-direction:column;gap:3px}
.cto-identity strong{font-size:13.5px;letter-spacing:-.01em}
.cto-identity span{display:flex;align-items:center;gap:6px;font:500 10px 'JetBrains Mono',monospace;color:var(--txt-dim)}
.cto-identity i{width:6px;height:6px;border-radius:50%;background:var(--green);box-shadow:0 0 6px var(--green)}
.cto-identity i.off{background:var(--txt-faint);box-shadow:none}
.cto-minimize{width:34px;height:34px;display:grid;place-items:center;border:0;border-radius:9px;background:transparent;color:var(--txt-dim);cursor:pointer}
.cto-minimize:hover{background:var(--nav-hover-bg);color:var(--txt)}
.cto-minimize svg{width:19px;height:19px}
.cto-log{flex:1;overflow-y:auto;display:flex;flex-direction:column;gap:11px;padding:16px 14px;overscroll-behavior:contain}
.cto-disabled{padding:16px;color:var(--txt-dim);font-size:13px;text-align:center;margin:auto 0}
.cto-report{padding:12px;border:1px solid var(--border);border-radius:12px;background:var(--panel);margin-bottom:8px}
.cto-report-meta{font-size:10.5px;color:var(--txt-faint);margin-bottom:8px;font-family:'JetBrains Mono',monospace}
.cto-report-content{font-size:12.5px;line-height:1.55}
.cto-report-content :deep(p){margin:0 0 7px}
.cto-report-content :deep(p:last-child){margin-bottom:0}
.cto-report-content :deep(ul),.cto-report-content :deep(ol){padding-left:17px;margin:5px 0}
.cto-report-content :deep(code){font:10.5px 'JetBrains Mono',monospace;background:var(--md-body-bg);border-radius:4px;padding:1px 4px}
.cto-report-content :deep(a){color:var(--cyan)}
.cto-line{padding:6px 8px;font-size:12px;line-height:1.5;border-radius:8px}
.cto-line.human{color:var(--txt);font-weight:500;background:var(--btn-primary-bg);align-self:flex-end;border-bottom-right-radius:3px}
.cto-line.assistant{color:var(--txt);background:var(--panel);border:1px solid var(--border);border-bottom-left-radius:3px}
.cto-line.status{color:var(--txt-faint);font-style:italic;font-size:11px;text-align:center}
.msg-time{display:block;margin-top:3px;text-align:right;color:var(--txt-faint);font:500 8.5px 'JetBrains Mono',monospace;opacity:.8}
.cto-thinking{display:flex;gap:4px;align-self:flex-start;padding:9px 12px;border:1px solid var(--border);border-radius:13px;background:var(--panel)}
.cto-thinking span{width:5px;height:5px;border-radius:50%;background:var(--txt-faint);animation:cto-bounce 1.2s infinite}
.cto-thinking span:nth-child(2){animation-delay:.15s}.cto-thinking span:nth-child(3){animation-delay:.3s}
.cto-compose{display:flex;align-items:flex-end;gap:8px;margin:0 12px;padding:8px 9px 8px 12px;border:1px solid var(--border);border-radius:13px;background:var(--panel-solid)}
.cto-compose textarea{flex:1;min-height:24px;max-height:120px;resize:none;border:0;outline:0;background:transparent;color:var(--txt);font:12.5px/1.55 var(--font-sans)}
.cto-compose textarea::placeholder{color:var(--txt-faint)}
.cto-compose button{width:auto;padding:0 12px;height:31px;display:grid;place-items:center;flex:none;border:0;border-radius:9px;background:var(--btn-primary-bg);color:var(--cyan);cursor:pointer;font:500 11px var(--font-sans)}
.cto-compose button:disabled{opacity:.4;cursor:default}
.cto-compose button.cto-stop{width:31px;padding:0;display:grid;place-items:center;color:var(--red,#ef5b5b);background:color-mix(in srgb,var(--red,#ef5b5b) 16%,var(--btn-primary-bg))}
.cto-compose button.cto-stop svg{width:16px;height:16px}
@keyframes cto-open{from{opacity:0;transform:translateY(10px) scale(.98)}to{opacity:1;transform:none}}
@keyframes cto-bounce{0%,70%,100%{transform:translateY(0);opacity:.4}35%{transform:translateY(-3px);opacity:1}}
@media(max-width:600px){.cto-panel{left:0;right:0;width:100vw!important}}
@media(prefers-reduced-motion:reduce){.cto-panel,.cto-thinking span{animation:none;transition:none}}
</style>
