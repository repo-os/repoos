<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, useId } from "vue";
import {
  CircleAlert,
  ChevronDown,
  Wrench,
  LifeBuoy,
  Copy,
  Check,
  X,
  GitMerge,
} from "lucide-vue-next";
import { api, JSON_OPTS } from "../api";
import type { RetryHint } from "../lib/retryHints";
import type { CloseOutFailureAction } from "../lib/closeOutFailure";
import { copyToClipboard } from "../lib/clipboard";
import { fmtTime } from "../lib/time";
import ActivityIndicator from "./ActivityIndicator.vue";

const props = withDefaults(
  defineProps<{
    message: string;
    step?: string;
    conflicts?: string[];
    /** Newline-preserving check/build output shown in full in panel mode. */
    detail?: string;
    /** Repo-relative durable log of the failed check's full output (#0428). */
    logPath?: string;
    /** Guidance paragraph; defaults to the merge-conflict guidance. */
    hint?: string;
    /**
     * The auto-repair hint in flight for this failure, or null when no covered
     * retry is running (#0385). When set, the card explains that the engineer
     * is already resolving it and the button becomes an explicit "start
     * something additional" action instead of the only path forward.
     */
    retryHint?: RetryHint | null;
    taskId?: string;
    taskTitle?: string;
    /** "card": compact — the message is clamped and clicking it opens the task
     *  panel (`open-panel`), where the full detail lives. "panel": the full
     *  detail is rendered inline, scrollable for long traces. */
    mode?: "card" | "panel";
    /** ISO 8601 failure time; panel headline shows a local clock via `fmtTime`. */
    failedAt?: string;
    /** Debugger one-line tl;dr (#0595). Shown in the collapsed line when set. */
    tldr?: string;
    /** Fixed tl;dr for failures the Debugger doesn't diagnose; `tldr` wins. */
    summary?: string;
    /** True while the Debugger is generating `tldr`. */
    tldrDiagnosing?: boolean;
    /** One-click repair for environment failures (#0674). */
    action?: CloseOutFailureAction;
    /** Prior failure while a new close-out runs (#0741). */
    stale?: boolean;
    /** Disable Fix while close-out is in flight for this task (#0741). */
    fixDisabled?: boolean;
    /** Shown when Fix is disabled (e.g. close-out running). */
    fixDisabledTitle?: string;
  }>(),
  { mode: "card" },
);

const tldr = computed(() => props.tldr?.trim() || props.summary?.trim() || undefined);

const staleShort = computed(() => {
  const line = tldr.value ?? props.message;
  const trimmed = line.trim();
  if (trimmed.length <= 72) return trimmed;
  return `${trimmed.slice(0, 69)}…`;
});

const fixTitle = computed(() => {
  if (props.fixDisabled && props.fixDisabledTitle) return props.fixDisabledTitle;
  if (props.retryHint) {
    return "Starts a separate debugger investigation. RepoOS is already repairing this automatically, so this is additional, not a replacement.";
  }
  return undefined;
});

const displayLine = computed(() => {
  if (tldr.value && (props.mode === "card" || collapsed.value)) return tldr.value;
  return props.message;
});

const failedAtLabel = computed(() => fmtTime(props.failedAt));
const headlineTitle = computed(() => {
  if (!props.failedAt) return undefined;
  const d = new Date(props.failedAt);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toLocaleString();
});

const emit = defineEmits<{
  (e: "open-panel"): void;
  (e: "open-debugger"): void;
  (e: "open-support"): void;
  /** Show the branch's conflicting files in the Debug tab's Merge conflict view. */
  (e: "open-conflict"): void;
  /** The user acknowledged the error; the parent hides it (and remembers that). */
  (e: "dismiss"): void;
  /** Refresh main's install and re-queue close-out (#0674). */
  (e: "refresh-install-retry"): void;
}>();
/**
 * Surface the redacted support bundle right on the failed-setup path: a failed
 * close-out/check is exactly when a user needs to hand something to support.
 * The bundle is created on the Support tab, so this is navigation only.
 */
function openSupportBundle(): void {
  emit("open-support");
}

const fixing = ref(false);
const fixSent = ref(false);
async function fix(): Promise<void> {
  if (fixing.value || !props.taskId) return;
  fixing.value = true;
  try {
    await api(
      `/api/tasks/${props.taskId}/debugger/message`,
      JSON_OPTS("POST", {
        text: [
          `Please investigate this failed Move-to-done operation for task #${props.taskId}: ${props.taskTitle ?? "Untitled task"}.`,
          `Phase: ${props.step ?? "unknown"}.`,
          `Error: ${props.message}`,
          // `message` is a capped headline (0253) — the full output, when there
          // is one, only lives in `detail`.
          ...(props.detail ? [`Full output:\n${props.detail}`] : []),
          "Identify the concrete cause and the smallest safe repair so the task can be retried.",
        ].join("\n"),
      }),
    );
    fixSent.value = true;
    // The Debugger is the next focus. Keep the concise failure headline, but
    // collapse raw check output so it cannot crowd the newly opened chat.
    outputOpen.value = false;
    // Hand off to the task's own debugger, not the global one — the parent
    // opens the failing task's Debug tab so the context stays scoped.
    emit("open-debugger");
  } finally {
    fixing.value = false;
  }
}

/**
 * Card mode: the message is clamped and clicking it surfaces the full error in
 * the task panel rather than expanding inline — the card stays compact, the
 * panel is where the detail belongs.
 */
function showMore(): void {
  if (props.mode !== "card") return;
  emit("open-panel");
}

// Unique per instance so the detail block's id never collides with another
// card's when several move-to-done errors are visible at once.
const detailId = `done-error-detail-${useId().replaceAll(":", "-")}`;
const msgEl = ref<HTMLElement | null>(null);

// The raw output is shown open by default (it's the reason the panel exists),
// but it can run to hundreds of lines. It collapses automatically after a
// debugger handoff, while remaining available on demand.
const outputOpen = ref(true);

// Panel mode: the whole card folds to its one-line headline so the tabs and
// actions below get the vertical space back. Independent of `outputOpen`,
// which only folds the raw output inside an expanded card.
const collapsed = ref(false);

// One-click hand-off of the failure to an agent: headline, phase, and the full
// output (the headline is capped; the detail is where the failing test lives).
const copied = ref(false);
let copiedTimer: ReturnType<typeof setTimeout> | undefined;
async function copyError(): Promise<void> {
  const text = [
    props.taskId ? `Move to done failed for task #${props.taskId}` : "Move to done failed",
    ...(props.taskTitle ? [`Task: ${props.taskTitle}`] : []),
    ...(props.step ? [`Phase: ${props.step}`] : []),
    `Error: ${props.message}`,
    ...(props.detail ? [`Full output:\n${props.detail}`] : []),
    ...(props.logPath ? [`Full log: ${props.logPath}`] : []),
  ].join("\n");
  copied.value = await copyToClipboard(text);
  clearTimeout(copiedTimer);
  if (copied.value) copiedTimer = setTimeout(() => (copied.value = false), 1600);
}
onBeforeUnmount(() => clearTimeout(copiedTimer));
</script>

<template>
  <div
    class="done-error"
    :class="[`done-error--${mode}`, stale && mode === 'card' ? 'done-error--stale' : '']"
    role="alert"
  >
    <details v-if="mode === 'card' && stale" class="done-error-stale">
      <summary class="done-error-stale-summary">
        Previous attempt failed: {{ staleShort }}
      </summary>
      <div class="done-error-row">
        <button
          type="button"
          class="done-error-toggle"
          :title="'Open the task panel to see the full error'"
          @click="showMore"
        >
          <CircleAlert class="done-error-ico" aria-hidden="true" />
          <span ref="msgEl" class="done-error-msg clamped">{{ displayLine }}</span>
        </button>
      </div>
    </details>
    <div v-else-if="mode === 'card'" class="done-error-row">
      <button
        type="button"
        class="done-error-toggle"
        :title="'Open the task panel to see the full error'"
        @click="showMore"
      >
        <CircleAlert class="done-error-ico" aria-hidden="true" />
        <span ref="msgEl" class="done-error-msg clamped">{{ displayLine }}</span>
      </button>
    </div>
    <div v-else class="done-error-static">
      <CircleAlert class="done-error-ico" aria-hidden="true" />
      <span ref="msgEl" class="done-error-msg" :class="{ oneline: collapsed }">{{
        displayLine
      }}</span>
      <button
        type="button"
        class="done-error-icon-btn"
        :title="copied ? 'Copied' : 'Copy the full error to the clipboard'"
        :aria-label="copied ? 'Copied' : 'Copy error'"
        @click="copyError"
      >
        <Check v-if="copied" class="size-3.5" />
        <Copy v-else class="size-3.5" />
      </button>
      <button
        type="button"
        class="done-error-icon-btn"
        :title="collapsed ? 'Expand the error' : 'Collapse the error to one line'"
        :aria-label="collapsed ? 'Expand error' : 'Collapse error'"
        :aria-expanded="!collapsed"
        @click="collapsed = !collapsed"
      >
        <ChevronDown class="size-3.5 done-error-chev-flip" :class="{ open: !collapsed }" />
      </button>
      <button
        type="button"
        class="done-error-icon-btn"
        title="Dismiss this error"
        aria-label="Dismiss error"
        @click="emit('dismiss')"
      >
        <X class="size-3.5" />
      </button>
    </div>

    <!-- Panel mode only: the board card already renders this same hint as its
         own `.tc-hint` chip above, so repeating it inside the compact card
         would be noise. The drawer has no such chip, so the banner carries the
         framing there (#0385). -->
    <div
      v-if="retryHint && mode === 'panel' && !collapsed"
      class="done-error-retry"
      role="status"
      :title="retryHint.title"
    >
      <ActivityIndicator />
      <span class="done-error-retry-body">
        <span class="done-error-retry-label">{{ retryHint.label }}</span>
        <span class="done-error-retry-note">{{ retryHint.title }}</span>
      </span>
    </div>

    <div v-if="mode === 'panel' && !collapsed" :id="detailId" class="done-error-detail">
      <div v-if="tldr || tldrDiagnosing" class="debug-tldr done-error-tldr" role="status">
        <div class="debug-tldr-body">
          <div class="debug-tldr-label">tl;dr — what happened</div>
          <div v-if="tldr" class="debug-tldr-sentence">{{ tldr }}</div>
          <div v-else class="debug-tldr-diagnosing">Diagnosing…</div>
        </div>
      </div>
      <div class="done-error-head" :title="headlineTitle">
        Move to done failed
        <span v-if="step" class="done-error-step">at {{ step }}</span
        ><span v-if="failedAtLabel" class="done-error-step"> · {{ failedAtLabel }}</span>
      </div>
      <div v-if="detail" class="done-error-output">
        <button
          type="button"
          class="done-error-output-toggle"
          :aria-expanded="outputOpen"
          @click="outputOpen = !outputOpen"
        >
          <span class="done-error-sub">Check output</span>
          <ChevronDown class="done-error-chev" :class="{ open: outputOpen }" aria-hidden="true" />
        </button>
        <pre v-if="outputOpen" class="done-error-pre mono">{{ detail }}</pre>
      </div>
      <div v-if="logPath" class="done-error-log">
        <span class="done-error-sub">Full check output saved to</span>
        <code class="mono">{{ logPath }}</code>
      </div>
      <div v-if="conflicts?.length" class="done-error-files">
        <div class="done-error-sub">Conflicting files</div>
        <ul>
          <li v-for="f in conflicts" :key="f" class="mono">{{ f }}</li>
        </ul>
        <button type="button" class="done-error-support" @click="emit('open-conflict')">
          <GitMerge class="size-3.5" />
          View the conflicts
        </button>
      </div>
      <p class="done-error-hint">
        {{
          hint ??
          "RepoOS couldn't sync this branch with main automatically — resolve the conflicting files in the worktree, then retry."
        }}
      </p>
      <button type="button" class="done-error-support" @click="openSupportBundle">
        <LifeBuoy class="size-3.5" />
        Create a redacted support bundle
      </button>
      <button
        v-if="action === 'refresh-install-retry' && taskId"
        type="button"
        class="done-error-support"
        @click="emit('refresh-install-retry')"
      >
        Refresh install and retry
      </button>
    </div>

    <button
      v-if="taskId && !collapsed"
      type="button"
      class="done-error-fix"
      :disabled="fixing || fixSent || fixDisabled"
      :title="fixTitle"
      @click="fix"
    >
      <Wrench class="size-3.5" />
      {{
        fixing
          ? "Sending…"
          : fixSent
            ? "Sent to Debugger"
            : retryHint
              ? "Investigate anyway"
              : "Fix"
      }}
    </button>
  </div>
</template>
