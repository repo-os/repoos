<script setup lang="ts">
/**
 * The PM conversation surface (#0515) — one component, rendered by both the
 * task panel's PM tab and the story panel's PM tab.
 *
 * Extracted because the two were otherwise ~370 duplicated lines of template
 * and interaction: identical bubbles, compose box, canned prompts, pending
 * screenshots, Enter-to-send and stop button. Sharing only the CSS left the
 * behaviour free to drift, and behaviour drift in a chat is exactly what a user
 * notices ("Shift+Enter works in one panel and not the other"). The styling went
 * global in `style.css` for the same reason (#0515); this is the other half.
 *
 * The component is presentational on purpose. Each host keeps its own state and
 * its own API calls — TaskDrawer owns the per-task PM override autosave and the
 * `ui.pmScreenshots` buffer, StoryPmChat owns a story-local one — so all this
 * needs is data in and events out. Adding a third PM surface is then a matter of
 * rendering this, not of reimplementing the standard.
 *
 * It is the registered surface in `src/ui-app/src/lib/ai-chat.ts`, so
 * `tests/ai-chat-standard.test.ts` holds *it* to the shared contract rather than
 * each host re-deriving it.
 */
import { computed, nextTick, ref, watch } from "vue";
import { ImagePlus, RotateCcw, X } from "lucide-vue-next";
import Button from "./ui/button.vue";
import type { AgentOutputEntry } from "../types";
import { renderChatMarkdown } from "../lib/markdown";
import { fmtTime } from "../lib/time";
import { bubbleRole, toDisplayRows, type DisplayRow } from "../lib/chat-rows";
import { useChatScroll } from "../composables/useChatScroll";
import { useCopyChatMessage } from "../composables/useCopyChatMessage";
import { autoGrowTextarea } from "../utils/textarea-autogrow";
import AiChatThinking from "./AiChatThinking.vue";
import ChatJumpToLatest from "./ChatJumpToLatest.vue";
import ChatDiagnosticRow from "./ChatDiagnosticRow.vue";
import ChatToolCallRow from "./ChatToolCallRow.vue";
import ChatSendButton from "./ChatSendButton.vue";
import ChatQueuedNotice from "./ChatQueuedNotice.vue";
import ScreenshotExpandButton from "./ScreenshotExpandButton.vue";

import type { PendingScreenshot } from "../stores/ui";
import { attachmentUploadPhase } from "../lib/attachment-upload-ui";
import { SCREENSHOT_ACCEPT } from "../lib/screenshot-viewer";
import ActivityIndicator from "./ActivityIndicator.vue";

export type PendingShot = PendingScreenshot;

const props = withDefaults(
  defineProps<{
    /** Stable per-conversation id; the remembered scroll position hangs off it. */
    chatId: string;
    /** The transcript. Any `AgentOutputEntry[]` — the host owns the store. */
    lines: AgentOutputEntry[];
    /** True while a turn is in flight; drives the send/stop swap and the pulse. */
    busy: boolean;
    /** False while the host isn't showing this chat (drives the scroll standard). */
    active?: boolean;
    /** True when the PM agent is unconfigured — disables the composer. */
    disabled?: boolean;
    /** Shown in the composer; hosts word it for their own subject. */
    placeholder?: string;
    /** Heading of the empty-conversation state. */
    welcomeTitle: string;
    /** Body of the empty-conversation state. */
    welcomeBody: string;
    /** Accessible name of the log region. */
    logLabel: string;
    /** Label on the pulsing working indicator. */
    busyLabel?: string;
    /** Suggested prompts; rendered above the composer. */
    canned?: string[];
    /** Open agent questions the human is answering in this compose session. */
    openQuestions?: string[];
    /** Screenshots picked but not yet sent. */
    shots?: PendingShot[];
    /** Hide the attach control (hosts with no attachment path). */
    canAttach?: boolean;
    /** True while a message sent during a running turn waits to be read (#0821). */
    queued?: boolean;
    title?: string;
  }>(),
  {
    active: true,
    disabled: false,
    placeholder: "Ask PM…",
    busyLabel: "PM is thinking",
    canned: () => [],
    openQuestions: () => [],
    shots: () => [],
    canAttach: true,
    queued: false,
    title: undefined,
  },
);

const emit = defineEmits<{
  send: [];
  interrupt: [];
  attach: [files: File[]];
  removeShot: [index: number];
  openShot: [index: number];
  retryShot: [index: number];
}>();

const draft = defineModel<string>("draft", { default: "" });

const log = ref<HTMLElement | null>(null);
const draftTextarea = ref<HTMLTextAreaElement | null>(null);

const hasConversation = computed(() => props.lines.length > 0);
// Rows are grouped by the shared transform (#0506): a run of adjacent tool calls
// is one expandable row with counts and the time it finished, not one line of
// prose per call.
const entries = computed<DisplayRow[]>(() => toDisplayRows(props.lines));

// Chat scroll standard (#0444): open on the newest message, remember the
// reader's position per conversation, and offer a jump back down once they
// scroll away.
const { showJumpToLatest, onScroll, scrollToLatest } = useChatScroll(log, {
  chatId: () => props.chatId,
  contentSize: () => props.lines.length,
  active: () => props.active,
});

const { messageBubbleListeners } = useCopyChatMessage();

/** Canned prompts are a shortcut, not a competitor to typing — hide once used. */
const showCanned = computed(() => props.canned.length > 0 && !draft.value.trim());

const showOpenQuestions = computed(() => props.openQuestions.length > 0);

function sendCanned(text: string): void {
  draft.value = text;
  emit("send");
}

function onShotFiles(e: Event): void {
  const input = e.target as HTMLInputElement;
  const files = Array.from(input.files ?? []);
  input.value = "";
  if (files.length) emit("attach", files);
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key !== "Enter" || event.shiftKey || event.isComposing) return;
  event.preventDefault();
  emit("send");
}

watch(
  () => draft.value,
  () => {
    void nextTick(() => autoGrowTextarea(draftTextarea.value));
  },
);

/**
 * Focus the composer. Hosts need this when they pre-fill a draft and want the
 * caret in it — the task panel's needs-input flow does, so the host can't reach
 * the textarea element directly any more.
 */
function focusDraft(): void {
  draftTextarea.value?.focus();
  autoGrowTextarea(draftTextarea.value);
}

defineExpose({ focusDraft });
</script>

<template>
  <div class="drawer-body drawer-session-body">
    <!-- Host-supplied header (the agent + model selector). Rendered inside the
         same padded body the Dev tab's selector sits in, so the task and story
         PM tabs share one look by construction. -->
    <slot name="header" />
    <div
      ref="log"
      class="agent-log-wrap pm-log-wrap ai-chat-log"
      role="log"
      aria-live="polite"
      :aria-label="logLabel"
      @scroll="onScroll"
    >
      <div v-if="!hasConversation" class="agent-empty pm-empty">
        <div class="pm-welcome-icon">PM</div>
        <strong>{{ welcomeTitle }}</strong>
        <p>{{ welcomeBody }}</p>
      </div>
      <template v-else>
        <template v-for="row in entries" :key="row.key">
          <!-- one row per run of adjacent tool calls (#0506) -->
          <ChatDiagnosticRow
            v-if="row.kind === 'line' && row.s === 'err'"
            :text="row.text"
            :at="row.at"
          />
          <ChatToolCallRow v-else-if="row.kind === 'tools'" :calls="row.calls" :at="row.at" />
          <div v-else-if="bubbleRole(row)" class="pm-row" :class="`pm-row-${bubbleRole(row)}`">
            <div v-if="bubbleRole(row) === 'assistant'" class="pm-mini-avatar">PM</div>
            <div
              class="pm-bubble"
              :class="`pm-bubble-${bubbleRole(row)}`"
              v-on="messageBubbleListeners(row)"
            >
              <div
                v-if="bubbleRole(row) === 'assistant'"
                class="pm-markdown"
                v-html="renderChatMarkdown(row.text)"
              ></div>
              <span v-else>{{ row.text }}</span>
              <!-- Every row carries its last-updated time (#0506), system rows
                   included: a `sys` entry is stamped like any other. -->
              <span v-if="row.at" class="msg-time">{{ fmtTime(row.at) }}</span>
            </div>
          </div>
        </template>
        <AiChatThinking class="ai-chat-avatar-offset" :active="busy" :label="busyLabel" />
      </template>
    </div>

    <ChatJumpToLatest :visible="showJumpToLatest" :anchor="log" @click="scrollToLatest()" />

    <div
      v-if="showOpenQuestions"
      class="pm-open-questions"
      role="region"
      aria-label="Questions for you"
    >
      <div class="pm-open-questions-head">
        <span class="pm-open-questions-badge">Questions for you</span>
      </div>
      <ol class="pm-open-questions-list">
        <li v-for="(question, index) in openQuestions" :key="index">{{ question }}</li>
      </ol>
    </div>

    <div v-if="showCanned" class="pm-canned" role="list" aria-label="Suggested prompts">
      <div
        v-for="(msg, i) in canned"
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

    <!-- 0513: a pending shot opens the full-size viewer. The host owns the
         viewer and the shots it holds; this only asks for an index. -->
    <div v-if="shots.length" class="pm-shots" aria-label="Attached screenshots">
      <div
        v-for="(s, i) in shots"
        :key="s.name + i + (s.uploadPhase ?? '')"
        class="pm-shot"
        :class="{
          'pm-shot--uploading': attachmentUploadPhase(s) === 'uploading',
          'pm-shot--failed': attachmentUploadPhase(s) === 'failed',
        }"
      >
        <img :src="s.dataUrl" :alt="s.name" @click="emit('openShot', i)" />
        <span v-if="attachmentUploadPhase(s) !== 'selected'" class="pm-shot-status" role="status">
          <ActivityIndicator
            v-if="attachmentUploadPhase(s) === 'uploading'"
            size="sm"
            :dots="3"
            label=""
          />
          {{
            attachmentUploadPhase(s) === "uploading"
              ? "Uploading…"
              : s.uploadError || "Upload failed"
          }}
        </span>
        <ScreenshotExpandButton :name="s.name" @click="emit('openShot', i)" />
        <Button
          v-if="attachmentUploadPhase(s) === 'failed'"
          type="button"
          variant="outline"
          size="sm"
          class="pm-shot-retry"
          :aria-label="`Retry upload for ${s.name}`"
          @click.stop="emit('retryShot', i)"
        >
          <RotateCcw class="size-3" />
        </Button>
        <button
          type="button"
          class="pm-shot-remove"
          :aria-label="`Remove ${s.name}`"
          title="Remove screenshot"
          @click.stop="emit('removeShot', i)"
        >
          <X class="size-3" />
        </button>
      </div>
    </div>

    <ChatQueuedNotice :active="queued" />

    <form class="ai-chat-compose" @submit.prevent="emit('send')">
      <label
        v-if="canAttach && !busy"
        class="ai-chat-attach"
        :aria-disabled="disabled ? 'true' : undefined"
        :aria-label="
          disabled ? 'Attach screenshots (unavailable while PM is working)' : 'Attach screenshots'
        "
        title="Attach screenshots — they're added to any task the PM creates from this message"
      >
        <ImagePlus aria-hidden="true" />
        <input
          type="file"
          :accept="SCREENSHOT_ACCEPT"
          :disabled="disabled"
          multiple
          class="pm-shot-input"
          aria-label="Attach screenshots"
          @change="onShotFiles"
          @click.stop
        />
      </label>
      <textarea
        ref="draftTextarea"
        v-model="draft"
        rows="1"
        :disabled="disabled"
        :placeholder="placeholder"
        aria-label="Message PM"
        @keydown="onKeydown"
        @input="autoGrowTextarea(draftTextarea)"
      ></textarea>
      <button
        v-if="busy"
        type="button"
        class="ai-chat-stop pm-stop"
        aria-label="Stop PM response"
        title="Stop response"
        @click="emit('interrupt')"
      >
        <svg viewBox="0 0 20 20" fill="none">
          <rect x="5" y="5" width="10" height="10" rx="1.5" fill="currentColor" />
        </svg>
      </button>
      <!-- Send stays usable while busy (#0821): the message is queued and read
           when the current turn ends, so the human never has to wait. -->
      <ChatSendButton :disabled="!draft.trim() || disabled" />
    </form>
  </div>
</template>
