<script setup lang="ts">
/**
 * The shared tool-call row for every AI chat (#0506).
 *
 * One maximal run of adjacent tool calls, collapsed into a single row:
 *
 *     [ ⚒  6 tool calls        4 ok · 2 failed ]              14:32:07
 *
 * The count badge says how much is hidden before you open it, split by outcome
 * so a failed batch is visible without expanding anything. Expanding lists
 * every call with its own input and result — a read-only rendering of the same
 * entries, so it changes nothing about what is stored, streamed, or exported.
 *
 * Native `<details>`/`<summary>` is the whole expand mechanism on purpose: it
 * is keyboard-activatable for free, and because the row keeps its `:key` while
 * a live run streams more calls into it, the open state survives re-renders and
 * the row never collapses under the reader mid-run.
 *
 * Styling lives in style.css under `.agent-tool*` so every chat's tool rows
 * look identical — see the module docblock in `src/lib/chat-rows.ts` for the
 * grouping rules that produce the `calls` this renders.
 */
import { computed } from "vue";
import { Wrench } from "lucide-vue-next";
import { fmtTime } from "../lib/time";
import { toolCallCountLabel, type ToolCallRow } from "../lib/chat-rows";

const props = defineProps<{
  /** The adjacent tool calls this row groups, in their original order. */
  calls: ToolCallRow[];
  /** Newest timestamp in the run — when the batch actually finished. */
  at?: string;
}>();

const total = computed(() => props.calls.length);
const ok = computed(() => props.calls.filter((call) => !call.error).length);
const failed = computed(() => total.value - ok.value);
const label = computed(() => toolCallCountLabel(total.value));
/** "6 tool calls, 2 failed" for assistive tech, where two coloured counts say little. */
const summary = computed(() =>
  failed.value > 0
    ? `${label.value}, ${ok.value} ok, ${failed.value} failed`
    : `${label.value}, all ok`,
);
</script>

<template>
  <details
    class="agent-tool agent-tool-group"
    :class="{ error: failed > 0 }"
    data-testid="chat-tool-row"
  >
    <summary :title="summary" :aria-label="summary">
      <span class="agent-tool-icon"><Wrench class="size-3" aria-hidden="true" /></span>
      <span class="agent-tool-name" data-testid="chat-tool-total">{{ label }}</span>
      <span class="agent-tool-counts">
        <span class="agent-tool-count ok" data-testid="chat-tool-ok">{{ ok }} ok</span>
        <span v-if="failed > 0" class="agent-tool-count error" data-testid="chat-tool-failed"
          >{{ failed }} failed</span
        >
      </span>
      <span v-if="at" class="agent-tool-time">{{ fmtTime(at) }}</span>
    </summary>
    <div class="agent-tool-calls">
      <div
        v-for="(call, i) in calls"
        :key="i"
        class="agent-tool-call"
        :class="{ error: call.error }"
      >
        <div class="agent-tool-call-head">
          <span class="agent-tool-call-name">{{ call.tool }}</span>
          <span v-if="call.state" class="agent-tool-state" :class="{ error: call.error }">{{
            call.state
          }}</span>
          <span v-if="call.at" class="agent-tool-call-time">{{ fmtTime(call.at) }}</span>
        </div>
        <div v-if="call.input" class="agent-tool-call-io">
          <span class="agent-tool-call-label">input</span>
          <pre class="agent-tool-out">{{ call.input }}</pre>
        </div>
        <div v-if="call.output" class="agent-tool-call-io">
          <span class="agent-tool-call-label">result</span>
          <pre class="agent-tool-out">{{ call.output }}</pre>
        </div>
        <div v-if="!call.input && !call.output" class="agent-tool-call-empty">no output</div>
      </div>
    </div>
  </details>
</template>
