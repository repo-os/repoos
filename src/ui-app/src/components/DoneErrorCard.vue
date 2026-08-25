<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, useId } from "vue";
import { CircleAlert, ChevronDown, Wrench } from "lucide-vue-next";
import { api, JSON_OPTS } from "../api";

const props = withDefaults(
  defineProps<{
    message: string;
    step?: string;
    conflicts?: string[];
    /** Newline-preserving check/build output shown in full in panel mode. */
    detail?: string;
    /** Guidance paragraph; defaults to the merge-conflict guidance. */
    hint?: string;
    taskId?: string;
    taskTitle?: string;
    /** "card": compact — the message is clamped and clicking it opens the task
     *  panel (`open-panel`), where the full detail lives. "panel": the full
     *  detail is rendered inline, scrollable for long traces. */
    mode?: "card" | "panel";
  }>(),
  { mode: "card" },
);

const emit = defineEmits<{ (e: "open-panel"): void }>();

const fixing = ref(false);
const fixSent = ref(false);
async function fix(): Promise<void> {
  if (fixing.value || !props.taskId) return;
  fixing.value = true;
  try {
    await api("/api/debugger/message", JSON_OPTS("POST", {
      text: [
        `Please investigate this failed Move-to-done operation for task #${props.taskId}: ${props.taskTitle ?? "Untitled task"}.`,
        `Phase: ${props.step ?? "unknown"}.`,
        `Error: ${props.message}`,
        // `message` is a capped headline (0253) — the full output, when there
        // is one, only lives in `detail`.
        ...(props.detail ? [`Full output:\n${props.detail}`] : []),
        "Identify the concrete cause and the smallest safe repair so the task can be retried.",
      ].join("\n"),
    }));
    fixSent.value = true;
    window.dispatchEvent(new CustomEvent("repoos:open-debugger"));
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
// but it can run to hundreds of lines — collapsible so it doesn't dominate
// the task panel once you've seen enough of it (0253).
const outputOpen = ref(true);
</script>

<template>
  <div class="done-error" :class="`done-error--${mode}`" role="alert">
    <button
      v-if="mode === 'card'"
      type="button"
      class="done-error-toggle"
      :title="'Open the task panel to see the full error'"
      @click="showMore"
    >
      <CircleAlert class="done-error-ico" aria-hidden="true" />
      <span ref="msgEl" class="done-error-msg clamped">{{ message }}</span>
      <ChevronDown class="done-error-chev" aria-hidden="true" />
    </button>
    <div v-else class="done-error-static">
      <CircleAlert class="done-error-ico" aria-hidden="true" />
      <span ref="msgEl" class="done-error-msg">{{ message }}</span>
    </div>

    <div v-if="mode === 'panel'" :id="detailId" class="done-error-detail">
      <div class="done-error-head">
        Move to done failed
        <span v-if="step" class="done-error-step">at {{ step }}</span>
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
      <div v-if="conflicts?.length" class="done-error-files">
        <div class="done-error-sub">Conflicting files</div>
        <ul>
          <li v-for="f in conflicts" :key="f" class="mono">{{ f }}</li>
        </ul>
      </div>
      <p class="done-error-hint">
        {{
          hint ??
          "RepoOS couldn't sync this branch with main automatically — resolve the conflicting files in the worktree, then retry."
        }}
      </p>
    </div>

    <button v-if="taskId" type="button" class="done-error-fix" :disabled="fixing || fixSent" @click="fix">
      <Wrench class="size-3.5" />
      {{ fixing ? "Sending…" : fixSent ? "Sent to Debugger" : "Fix" }}
    </button>
  </div>
</template>
