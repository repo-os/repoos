<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from "vue";
import { api, JSON_OPTS } from "../api";
import { renderMarkdown } from "../lib/markdown";
import type {
  PlaygroundChatMessage,
  PlaygroundChatResponse,
  PlaygroundModel,
  PlaygroundModelsResponse,
  PlaygroundProviderGroup,
} from "../types";
import Button from "./ui/button.vue";

const STARTER_PROMPTS = ["What's this repo about?", "Explain this codebase", "What would you improve here first?"];

/** A catalog model plus the label of the provider it came from, for display. */
interface CatalogModel extends PlaygroundModel {
  providerLabel: string;
}

const providers = ref<PlaygroundProviderGroup[]>([]);
const loading = ref(false);
const loadError = ref("");
const loadedOnce = ref(false);
const selected = ref<CatalogModel | null>(null);

const messages = ref<PlaygroundChatMessage[]>([]);
const draft = ref("");
const sending = ref(false);
const sendError = ref("");
const log = ref<HTMLElement | null>(null);
const draftTextarea = ref<HTMLTextAreaElement | null>(null);

const allModels = computed<CatalogModel[]>(() =>
  providers.value.flatMap((group) => group.models.map((m) => ({ ...m, providerLabel: group.label }))),
);

function fmtPrice(v: number | null): string {
  if (v == null) return "—";
  return v < 1 ? `$${v.toFixed(3)}` : `$${v.toFixed(2)}`;
}

function fmtContext(n: number | null): string {
  if (n == null) return "—";
  if (n >= 1_000_000) return `${Math.round((n / 1_000_000) * 10) / 10}M`;
  if (n >= 1000) return `${Math.round(n / 1000)}K`;
  return String(n);
}

async function loadModels(refresh = false): Promise<void> {
  loading.value = true;
  loadError.value = "";
  try {
    const res = await api<PlaygroundModelsResponse>(`/api/playground/models${refresh ? "?refresh=1" : ""}`);
    providers.value = res.providers;
    const models = allModels.value;
    if (selected.value) {
      const match = models.find((m) => m.runId === selected.value?.runId);
      selected.value = match ?? selected.value;
    } else if (models.length) {
      selected.value = models[0];
    }
  } catch (err) {
    loadError.value = err instanceof Error ? err.message : "Could not load the model catalog.";
  } finally {
    loading.value = false;
    loadedOnce.value = true;
  }
}

function selectModel(m: CatalogModel): void {
  if (sending.value || selected.value?.runId === m.runId) return;
  selected.value = m;
  messages.value = [];
  sendError.value = "";
  draft.value = "";
}

function clearChat(): void {
  if (sending.value) return;
  messages.value = [];
  sendError.value = "";
  draft.value = "";
}

function scrollToLatest(): void {
  nextTick(() => {
    if (log.value) log.value.scrollTop = log.value.scrollHeight;
  });
}

async function send(text?: string): Promise<void> {
  const content = (text ?? draft.value).trim();
  if (!content || sending.value || !selected.value) return;
  const model = selected.value;
  messages.value = [...messages.value, { role: "user", text: content }];
  draft.value = "";
  sendError.value = "";
  sending.value = true;
  scrollToLatest();
  try {
    const res = await api<PlaygroundChatResponse>(
      "/api/playground/chat",
      JSON_OPTS("POST", { runId: model.runId, messages: messages.value }),
    );
    messages.value = [...messages.value, { role: "assistant", text: res.text }];
  } catch (err) {
    sendError.value = err instanceof Error ? err.message : "The model did not respond.";
  } finally {
    sending.value = false;
    scrollToLatest();
  }
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key !== "Enter" || event.shiftKey || event.isComposing) return;
  event.preventDefault();
  void send();
}

onMounted(() => {
  void loadModels();
});
</script>

<template>
  <div class="playground">
    <aside class="playground-sidebar" aria-label="Models worth trying" :aria-busy="loading">
      <div class="playground-sidebar-head">
        <span class="sec-label"><span class="live-dot"></span>Models worth trying</span>
        <Button variant="outline" size="sm" :disabled="loading" @click="loadModels(true)">
          {{ loading ? "Refreshing…" : "Refresh" }}
        </Button>
      </div>

      <div v-if="loadError" class="playground-error">{{ loadError }}</div>
      <div v-if="loading && !allModels.length" class="playground-skeletons" aria-hidden="true">
        <div v-for="i in 3" :key="i" class="playground-skeleton">
          <div class="playground-skeleton-line w-70"></div>
          <div class="playground-skeleton-line w-90"></div>
          <div class="playground-skeleton-line w-45"></div>
        </div>
      </div>
      <div v-else-if="loadedOnce && !allModels.length && !loadError" class="playground-loading">
        No models available right now.
      </div>

      <template v-for="group in providers" :key="group.id">
        <div v-if="group.models.length || group.error" class="playground-provider-group">
          <div class="playground-provider-label">{{ group.label }}</div>
          <div v-if="group.error" class="playground-provider-error">{{ group.error }}</div>
          <button
            v-for="m in group.models"
            :key="m.runId"
            type="button"
            class="playground-model-card"
            :class="{ active: selected?.runId === m.runId }"
            :disabled="sending && selected?.runId !== m.runId"
            @click="selectModel({ ...m, providerLabel: group.label })"
          >
            <div class="playground-model-name">{{ m.name }}</div>
            <div class="playground-model-reason">{{ m.reason }}</div>
            <div class="playground-model-meta">
              <span>{{ fmtPrice(m.inputPricePerM) }} / {{ fmtPrice(m.outputPricePerM) }} per 1M</span>
              <span v-if="m.contextWindow">{{ fmtContext(m.contextWindow) }} ctx</span>
            </div>
          </button>
        </div>
      </template>
    </aside>

    <section class="playground-chat">
      <template v-if="selected">
        <header class="playground-chat-head">
          <span class="playground-active-dot" aria-hidden="true"></span>
          <div class="playground-active-info">
            <strong>{{ selected.name }}</strong>
            <span>{{ selected.providerLabel }} · active model</span>
          </div>
          <button
            v-if="messages.length"
            type="button"
            class="playground-clear"
            :disabled="sending"
            aria-label="Clear conversation"
            @click="clearChat()"
          >
            Clear
          </button>
        </header>

        <div ref="log" class="playground-log" role="log" aria-live="polite" :aria-label="`Conversation with ${selected.name}`">
          <div v-if="!messages.length" class="playground-welcome">
            <strong>Try {{ selected.name }}</strong>
            <p>{{ selected.reason }}</p>
            <div class="playground-starters">
              <button v-for="p in STARTER_PROMPTS" :key="p" type="button" @click="send(p)">{{ p }}</button>
            </div>
          </div>
          <div v-for="(m, i) in messages" :key="i" class="playground-row" :class="`playground-row-${m.role}`">
            <div class="playground-bubble" :class="`playground-bubble-${m.role}`">
              <div v-if="m.role === 'assistant'" class="playground-markdown" v-html="renderMarkdown(m.text)"></div>
              <span v-else>{{ m.text }}</span>
            </div>
          </div>
          <div v-if="sending" class="playground-thinking" aria-label="Model is responding">
            <span></span><span></span><span></span>
          </div>
          <div v-if="sendError" class="playground-send-error">{{ sendError }}</div>
        </div>

        <form class="playground-compose" @submit.prevent="send()">
          <textarea
            ref="draftTextarea"
            v-model="draft"
            rows="1"
            :disabled="sending"
            :placeholder="`Message ${selected.name}…`"
            :aria-label="`Message ${selected.name}`"
            @keydown="onKeydown"
          ></textarea>
          <button type="submit" :disabled="!draft.trim() || sending" aria-label="Send message">Send</button>
        </form>
      </template>
      <div v-else class="playground-empty">
        <p v-if="!loading">Pick a model from the sidebar to start chatting.</p>
      </div>
    </section>
  </div>
</template>

<style scoped>
.playground{display:flex;align-items:flex-start;gap:16px;padding:16px 18px 20px}
.playground-sidebar{width:320px;flex:none;display:flex;flex-direction:column;gap:10px;max-height:75vh;overflow-y:auto;padding-right:4px}
.playground-sidebar-head{display:flex;align-items:center;justify-content:space-between;gap:8px;position:sticky;top:0;background:var(--bg);z-index:1;padding-bottom:2px}
.playground-error,.playground-loading{font-size:11.5px;color:var(--txt-dim);padding:4px 2px}
.playground-provider-group{display:flex;flex-direction:column;gap:8px}
.playground-provider-label{font:600 10px 'JetBrains Mono',monospace;letter-spacing:.08em;text-transform:uppercase;color:var(--txt-faint);margin:4px 2px 0}
.playground-provider-error{font-size:11px;color:var(--amber);padding:0 2px}
.playground-skeletons{display:flex;flex-direction:column;gap:8px}
.playground-skeleton{display:flex;flex-direction:column;gap:6px;padding:11px;border:1px solid var(--border);border-radius:11px;background:var(--panel)}
.playground-skeleton-line{height:9px;border-radius:5px;background:linear-gradient(90deg,var(--panel) 0%,var(--border) 50%,var(--panel) 100%);background-size:200% 100%;animation:playground-shimmer 1.4s ease-in-out infinite}
.playground-skeleton-line.w-70{width:70%}
.playground-skeleton-line.w-90{width:90%}
.playground-skeleton-line.w-45{width:45%}
.playground-model-card{display:flex;flex-direction:column;gap:4px;text-align:left;padding:10px 11px;border:1px solid var(--border);border-radius:11px;background:var(--panel);color:var(--txt);cursor:pointer;transition:.15s}
.playground-model-card:hover{border-color:var(--border-bright)}
.playground-model-card:disabled{opacity:.5;cursor:default}
.playground-model-card.active{border-color:var(--cyan);box-shadow:var(--card-glow)}
.playground-model-name{font-size:12.5px;font-weight:600}
.playground-model-reason{font-size:11px;color:var(--txt-dim);line-height:1.4}
.playground-model-meta{display:flex;gap:10px;font:500 10px 'JetBrains Mono',monospace;color:var(--txt-faint)}

.playground-chat{flex:1;min-width:0;display:flex;flex-direction:column;border:1px solid var(--border);border-radius:14px;background:var(--panel-solid);overflow:hidden;min-height:460px}
.playground-chat-head{display:flex;align-items:center;gap:9px;padding:12px 14px;border-bottom:1px solid var(--border);background:var(--topbar-bg)}
.playground-active-dot{width:8px;height:8px;border-radius:50%;background:var(--green);box-shadow:0 0 8px var(--green);flex:none}
.playground-active-info{display:flex;flex-direction:column;gap:2px;min-width:0}
.playground-active-info strong{font-size:13px;letter-spacing:-.01em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.playground-active-info span{font:500 10px 'JetBrains Mono',monospace;color:var(--txt-dim)}
.playground-clear{margin-left:auto;flex:none;padding:5px 11px;border:1px solid var(--border);border-radius:8px;background:var(--panel);color:var(--txt-dim);font:500 10.5px var(--font-sans);cursor:pointer;transition:.15s}
.playground-clear:hover{border-color:var(--border-bright);color:var(--txt)}
.playground-clear:disabled{opacity:.5;cursor:default}
.playground-log{flex:1;min-height:280px;max-height:56vh;overflow-y:auto;display:flex;flex-direction:column;gap:11px;padding:16px}
.playground-empty{flex:1;display:grid;place-items:center;color:var(--txt-dim);font-size:12.5px;padding:40px 16px}
.playground-welcome{margin:auto 0;text-align:center;padding:22px 12px;color:var(--txt-dim)}
.playground-welcome strong{display:block;color:var(--txt);font-size:14px;margin-bottom:6px}
.playground-welcome p{font-size:11.5px;line-height:1.55;max-width:320px;margin:0 auto}
.playground-starters{display:flex;justify-content:center;flex-wrap:wrap;gap:7px;margin-top:14px}
.playground-starters button{border:1px solid var(--border);border-radius:999px;padding:6px 10px;background:var(--panel);color:var(--txt-dim);font:500 10.5px var(--font-sans);cursor:pointer}
.playground-starters button:hover{border-color:var(--border-bright);color:var(--txt)}
.playground-row{display:flex}
.playground-row-user{justify-content:flex-end}
.playground-bubble{max-width:84%;padding:9px 11px;border-radius:13px;font-size:12.5px;line-height:1.55;overflow-wrap:anywhere}
.playground-bubble-user{color:var(--btn-primary-color);background:var(--btn-primary-bg);border:1px solid var(--border-bright);border-bottom-right-radius:4px}
.playground-bubble-assistant{color:var(--txt);background:var(--panel);border:1px solid var(--border);border-bottom-left-radius:4px}
.playground-markdown :deep(p){margin:0 0 7px}
.playground-markdown :deep(p:last-child){margin-bottom:0}
.playground-markdown :deep(code){font:10.5px 'JetBrains Mono',monospace;background:var(--md-body-bg);border-radius:4px;padding:1px 4px}
.playground-markdown :deep(pre){overflow:auto;margin:7px 0;padding:8px;background:var(--md-body-bg);border-radius:7px}
.playground-markdown :deep(pre code){padding:0;background:none}
.playground-send-error{align-self:center;font-size:11px;color:var(--red)}
.playground-thinking{display:flex;gap:4px;align-self:flex-start;padding:9px 12px;border:1px solid var(--border);border-radius:13px;background:var(--panel)}
.playground-thinking span{width:5px;height:5px;border-radius:50%;background:var(--txt-faint);animation:playground-bounce 1.2s infinite}
.playground-thinking span:nth-child(2){animation-delay:.15s}
.playground-thinking span:nth-child(3){animation-delay:.3s}
.playground-compose{display:flex;align-items:flex-end;gap:8px;margin:12px;padding:8px 9px 8px 12px;border:1px solid var(--border);border-radius:13px;background:var(--panel)}
.playground-compose:focus-within{border-color:var(--border-bright);box-shadow:0 0 0 3px var(--cyan-dim)}
.playground-compose textarea{flex:1;min-height:24px;max-height:120px;overflow-y:auto;resize:none;border:0;outline:0;background:transparent;color:var(--txt);font:12.5px/1.55 var(--font-sans)}
.playground-compose textarea::placeholder{color:var(--txt-faint)}
.playground-compose textarea:disabled{opacity:.6}
.playground-compose button{flex:none;padding:7px 14px;border:0;border-radius:9px;background:var(--btn-primary-bg);color:var(--cyan);font:600 11.5px var(--font-sans);cursor:pointer}
.playground-compose button:disabled{opacity:.4;cursor:default}
@keyframes playground-bounce{0%,70%,100%{transform:translateY(0);opacity:.4}35%{transform:translateY(-3px);opacity:1}}
@keyframes playground-shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}

@media(max-width:860px){
  .playground{flex-direction:column}
  .playground-sidebar{width:100%;max-height:280px}
  .playground-chat{width:100%;min-height:420px}
}
@media(prefers-reduced-motion:reduce){
  .playground-thinking span{animation:none}
  .playground-skeleton-line{animation:none}
}
</style>
