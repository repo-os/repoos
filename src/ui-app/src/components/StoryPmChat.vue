<script setup lang="ts">
/**
 * The story side panel's PM tab (#0515) — the PM conversation about one story.
 *
 * Deliberately the same conversation surface as the task panel's PM tab: same
 * `.pm-*` classes (promoted to `style.css` for exactly this reason), same
 * `useChatScroll` + `ChatJumpToLatest` + `AiChatThinking` hooks, same
 * `toDisplayRows` tool-call grouping, same optimistic-send rollback. A user
 * moving between a task panel and a story panel should not have to learn a
 * second chat.
 *
 * Two things are story-specific and nothing more:
 *   - the session is keyed per story, not per task (`pm-story-v1:<number>`,
 *     built by `storyPmSessionId` so client and server agree without either
 *     knowing the other's internals);
 *   - the conversation is about a story rather than a task, so the canned
 *     prompts ask story questions.
 *
 * The pending-screenshot buffer is local to this component rather than shared
 * from the ui store, which the task panel owns and clears on every task open
 * and close — two independent conversations must not hand each other's picks.
 */
import { computed, nextTick, ref, watch } from "vue";
import { ImagePlus, X } from "lucide-vue-next";
import { api, JSON_OPTS } from "../api";
import { storyPmSessionId } from "../../../core/stories.js";
import type { MergedStoryGroup } from "../../../core/story-display.js";
import type { AgentOutputEntry, Task } from "../types";
import { useAuthStore } from "../stores/auth";
import { useConfigStore } from "../stores/config";
import { useRepoStore } from "../stores/repo";
import { renderMarkdown } from "../lib/markdown";
import { fmtTime } from "../lib/time";
import { bubbleRole, toDisplayRows, type DisplayRow } from "../lib/chat-rows";
import { useChatScroll } from "../composables/useChatScroll";
import { autoGrowTextarea } from "../utils/textarea-autogrow";
import AiChatThinking from "./AiChatThinking.vue";
import ChatJumpToLatest from "./ChatJumpToLatest.vue";
import ChatToolCallRow from "./ChatToolCallRow.vue";

const props = defineProps<{
  /**
   * The story the panel is showing. The host only mounts this component while
   * the PM tab is selected, so "mounted" already means "active" — that is why
   * there is no separate `active` prop for the scroll standard to read.
   */
  story: MergedStoryGroup<Task>;
}>();

const auth = useAuthStore();
const config = useConfigStore();
const repo = useRepoStore();

/** Runner session key for this story's PM conversation — see `storyPmSessionId`. */
const sessionId = computed(() => storyPmSessionId(props.story.key, props.story.number, auth.email));

const lines = computed(() => repo.outputs[sessionId.value] ?? []);
const hasConversation = computed(() => lines.value.length > 0);
const busy = computed(() => submitting.value || repo.runningIds.includes(sessionId.value));

/** Mirrors the task panel: an unconfigured PM agent disables the composer. */
const pmAgentEnabled = computed(() => {
  if (!config.loaded) return true;
  return (config.agents ?? []).some((a) => a.name === "pm" && a.enabled);
});

const draft = ref("");
const draftTextarea = ref<HTMLTextAreaElement | null>(null);
const submitting = ref(false);
const log = ref<HTMLElement | null>(null);
const shotInput = ref<HTMLInputElement | null>(null);

interface PendingShot {
  name: string;
  mime: string;
  dataUrl: string;
}
const shots = ref<PendingShot[]>([]);

// Chat scroll standard (#0444): open on the newest message, remember the
// reader's position per story, and offer a jump back down once they scroll away.
const { showJumpToLatest, onScroll, scrollToLatest } = useChatScroll(log, {
  chatId: () => sessionId.value,
  contentSize: () => lines.value.length,
  // Mounted only while the PM tab is showing, so the surface is always active.
  active: () => true,
});

// The PM conversation as shared display rows (#0506) — same grouping as every
// other chat, so a run of tool calls is one expandable row.
const entries = computed<DisplayRow[]>(() => toDisplayRows(lines.value));

/**
 * Canned prompts, in the task panel's spirit and shape (`pm-canned-messages`):
 * a short list of the questions a user actually opens a story panel to ask,
 * above the compose box, until they start typing their own.
 */
const cannedMessages = computed<string[]>(() => {
  const s = props.story;
  if (s.attention > 0) {
    return [`${s.attention} task(s) in this story need input — what's blocking them?`];
  }
  if (s.total === 0) {
    return ["Break this story down into tasks.", "What would make this story complete?"];
  }
  if (s.complete) {
    return ["Is this story really done, or is anything untagged?"];
  }
  return [
    "Break the remaining work down into tasks.",
    "What's blocking this story?",
    "What should I do next?",
  ];
});

const showCanned = computed(() => cannedMessages.value.length > 0 && !draft.value.trim());

function sendCanned(text: string): void {
  draft.value = text;
  void send();
}

/** Restore the conversation after a browser reload or a server handover. */
async function hydrate(): Promise<void> {
  try {
    const r = await api<{ ok: boolean; lines: AgentOutputEntry[] }>(
      `/api/stories/${encodeURIComponent(props.story.key)}/pm/output`,
    );
    if (r.ok) repo.outputs[sessionId.value] = r.lines;
  } catch {
    // Best-effort — a missing transcript is an empty conversation, not an error
    // the user needs to act on. Same contract as the task panel's loadOutput.
  }
}

function onShotFiles(e: Event): void {
  const input = e.target as HTMLInputElement;
  for (const file of Array.from(input.files ?? [])) {
    if (shots.value.length >= 6) break;
    if (!file.type.startsWith("image/")) continue;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        shots.value.push({ name: file.name, mime: file.type, dataUrl: reader.result });
      }
    };
    reader.readAsDataURL(file);
  }
  input.value = "";
}

async function send(): Promise<void> {
  const text = draft.value.trim();
  if (!text || busy.value || !pmAgentEnabled.value) return;

  submitting.value = true;
  const optimistic: AgentOutputEntry = { type: "human", text, at: new Date().toISOString() };
  const optimisticIndex = lines.value.length;
  repo.outputs[sessionId.value] = [...lines.value, optimistic];
  draft.value = "";
  // Same wire shape as the task panel's attach: base64 without the data-URL
  // prefix. Kept local until the send succeeds so a failure doesn't lose them.
  const images = shots.value.map((s) => ({
    name: s.name,
    mime: s.mime,
    data: s.dataUrl.split(",")[1] ?? "",
  }));
  scrollToLatest("auto");

  try {
    await api(
      `/api/stories/${encodeURIComponent(props.story.key)}/pm/message`,
      JSON_OPTS("POST", { text, images: images.length ? images : undefined }),
    );
    shots.value = [];
  } catch (error) {
    repo.outputs[sessionId.value] = (repo.outputs[sessionId.value] ?? []).filter(
      (_entry, index) => index !== optimisticIndex,
    );
    draft.value = text;
    repo.outputs[sessionId.value] = [
      ...(repo.outputs[sessionId.value] ?? []),
      { type: "sys", d: error instanceof Error ? error.message : String(error) },
    ];
    repo.onError(error);
  } finally {
    submitting.value = false;
  }
}

async function interrupt(): Promise<void> {
  try {
    await api(`/api/stories/${encodeURIComponent(props.story.key)}/pm/interrupt`, {
      method: "POST",
    });
  } catch (error) {
    repo.onError(error);
  }
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key !== "Enter" || event.shiftKey || event.isComposing) return;
  event.preventDefault();
  void send();
}

function adjustDraftHeight(): void {
  autoGrowTextarea(draftTextarea.value);
}

watch(
  () => props.story.key,
  () => {
    void hydrate();
  },
  { immediate: true },
);

watch(
  () => draft.value,
  () => {
    void nextTick(adjustDraftHeight);
  },
);
</script>

<template>
  <div class="drawer-body drawer-session-body">
    <div
      ref="log"
      class="agent-log-wrap pm-log-wrap ai-chat-log"
      role="log"
      aria-live="polite"
      aria-label="Conversation with the PM about this story"
      @scroll="onScroll"
    >
      <div v-if="!hasConversation" class="agent-empty pm-empty">
        <div class="pm-welcome-icon">PM</div>
        <strong>Chat about this story</strong>
        <p>
          Ask the PM to break the story down into tasks, retag or update one, or discuss what is
          blocking it.
        </p>
      </div>
      <template v-else>
        <template v-for="row in entries" :key="row.key">
          <ChatToolCallRow v-if="row.kind === 'tools'" :calls="row.calls" :at="row.at" />
          <div v-else-if="bubbleRole(row)" class="pm-row" :class="`pm-row-${bubbleRole(row)}`">
            <div v-if="bubbleRole(row) === 'assistant'" class="pm-mini-avatar">PM</div>
            <div class="pm-bubble" :class="`pm-bubble-${bubbleRole(row)}`">
              <div
                v-if="bubbleRole(row) === 'assistant'"
                class="pm-markdown"
                v-html="renderMarkdown(row.text)"
              ></div>
              <span v-else>{{ row.text }}</span>
              <span v-if="row.at" class="msg-time">{{ fmtTime(row.at) }}</span>
            </div>
          </div>
        </template>
        <AiChatThinking class="ai-chat-avatar-offset" :active="busy" label="PM is thinking" />
      </template>
    </div>

    <ChatJumpToLatest :visible="showJumpToLatest" :anchor="log" @click="scrollToLatest()" />

    <div v-if="showCanned" class="pm-canned" role="list" aria-label="Suggested prompts">
      <div
        v-for="(msg, i) in cannedMessages"
        :key="i"
        class="pm-canned-item"
        role="button"
        tabindex="0"
        @click="sendCanned(msg)"
        @keydown.enter="sendCanned(msg)"
      >
        <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <path
            d="M8 4L3 10l5 6"
            stroke="currentColor"
            stroke-width="1.7"
            stroke-linejoin="round"
          />
          <path d="M5 10h11" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" />
        </svg>
        <span>{{ msg }}</span>
      </div>
    </div>

    <div v-if="shots.length" class="pm-shots" aria-label="Attached screenshots">
      <div v-for="(s, i) in shots" :key="s.name + i" class="pm-shot">
        <img :src="s.dataUrl" :alt="s.name" />
        <button
          type="button"
          class="pm-shot-remove"
          :aria-label="`Remove ${s.name}`"
          title="Remove screenshot"
          @click="shots.splice(i, 1)"
        >
          <X class="size-3" />
        </button>
      </div>
    </div>

    <form class="pm-compose" @submit.prevent="send">
      <input
        ref="shotInput"
        type="file"
        accept="image/png,image/jpeg,image/gif,image/webp,image/avif,image/bmp"
        multiple
        class="pm-shot-input"
        aria-hidden="true"
        tabindex="-1"
        @change="onShotFiles"
      />
      <button
        v-if="!busy"
        type="button"
        class="pm-attach"
        aria-label="Attach screenshots"
        title="Attach screenshots — they're added to any task the PM creates from this message"
        :disabled="!pmAgentEnabled"
        @click="shotInput?.click()"
      >
        <ImagePlus />
      </button>
      <textarea
        ref="draftTextarea"
        v-model="draft"
        rows="1"
        :disabled="!pmAgentEnabled"
        :placeholder="
          pmAgentEnabled ? 'Ask PM about this story…' : 'Enable PM agent on Agents page'
        "
        aria-label="Message PM"
        @keydown="onKeydown"
        @input="adjustDraftHeight"
      ></textarea>
      <button
        v-if="busy"
        type="button"
        class="pm-stop"
        aria-label="Stop PM response"
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
        :disabled="!draft.trim() || busy || !pmAgentEnabled"
        aria-label="Send message"
      >
        <svg viewBox="0 0 20 20" fill="none">
          <path
            d="M3 10L17 3l-4 14-4-6-6-1z"
            stroke="currentColor"
            stroke-width="1.6"
            stroke-linejoin="round"
          />
        </svg>
      </button>
    </form>
  </div>
</template>
