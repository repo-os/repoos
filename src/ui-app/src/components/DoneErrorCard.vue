<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, useId, watch } from "vue";
import { CircleAlert, ChevronDown, Wrench } from "lucide-vue-next";
import { api, JSON_OPTS } from "../api";

const props = defineProps<{
  message: string;
  step?: string;
  conflicts?: string[];
  taskId?: string;
  taskTitle?: string;
}>();

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
        "Identify the concrete cause and the smallest safe repair so the task can be retried.",
      ].join("\n"),
    }));
    fixSent.value = true;
    window.dispatchEvent(new CustomEvent("repoos:open-debugger"));
  } finally {
    fixing.value = false;
  }
}

/** True when the collapsed message overflows its two-line clamp. */
const overflow = ref(false);
/** True when the full message and details are revealed. */
const expanded = ref(false);
/** The message element; measured in its collapsed, clamped state. */
const msgEl = ref<HTMLElement | null>(null);

// Unique per instance so the expanded panel's id never collides with another
// card's when several move-to-done errors are visible at once.
const detailId = `done-error-detail-${useId().replaceAll(":", "-")}`;

function measure(): void {
  // Overflow only has meaning against the clamped (collapsed) box — once
  // expanded the full text naturally fits its own height.
  if (expanded.value) return;
  const el = msgEl.value;
  if (!el) return;
  overflow.value = el.scrollHeight > el.clientHeight + 1;
}

function toggle(): void {
  if (!overflow.value) return;
  expanded.value = !expanded.value;
  nextTick(measure);
}

onMounted(() => {
  nextTick(measure);
  window.addEventListener("resize", measure);
});
onBeforeUnmount(() => {
  window.removeEventListener("resize", measure);
});
// Re-measure after the branch swap (static ⇄ button) changes the layout.
watch(overflow, () => nextTick(measure));
// A retry replaces the error message: collapse back to the fresh, clamped
// version instead of leaving a stale expanded state on the new error.
watch(
  () => props.message,
  () => {
    expanded.value = false;
    nextTick(measure);
  },
);

defineExpose({ measure, toggle, overflow, expanded });
</script>

<template>
  <div class="done-error" role="alert">
    <button
      v-if="overflow"
      type="button"
      class="done-error-toggle"
      :aria-expanded="expanded"
      :aria-controls="detailId"
      :title="expanded ? 'Show less' : 'Show more'"
      @click="toggle"
    >
      <CircleAlert class="done-error-ico" aria-hidden="true" />
      <span ref="msgEl" class="done-error-msg" :class="{ clamped: !expanded }">{{ message }}</span>
      <ChevronDown class="done-error-chev" :class="{ open: expanded }" aria-hidden="true" />
    </button>
    <div v-else class="done-error-static">
      <CircleAlert class="done-error-ico" aria-hidden="true" />
      <span ref="msgEl" class="done-error-msg" :class="{ clamped: !expanded }">{{ message }}</span>
    </div>
    <div v-if="expanded" :id="detailId" class="done-error-detail">
      <div class="done-error-head">
        Move to done failed
        <span v-if="step" class="done-error-step">at {{ step }}</span>
      </div>
      <div v-if="conflicts?.length" class="done-error-files">
        <div class="done-error-sub">Conflicting files</div>
        <ul>
          <li v-for="f in conflicts" :key="f" class="mono">{{ f }}</li>
        </ul>
      </div>
      <p class="done-error-hint">
        RepoOS couldn't sync this branch with main automatically — resolve the conflicting files
        in the worktree, then retry.
      </p>
    </div>
    <button v-if="taskId" type="button" class="done-error-fix" :disabled="fixing || fixSent" @click="fix">
      <Wrench class="size-3.5" />
      {{ fixing ? "Sending…" : fixSent ? "Sent to Debugger" : "Fix" }}
    </button>
  </div>
</template>
