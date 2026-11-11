<script setup lang="ts">
import { computed } from "vue";
import {
  checkProgressDetailLabel,
  checkProgressPercent,
  type CheckProgress,
} from "../lib/check-progress";

const props = withDefaults(
  defineProps<{
    progress: CheckProgress | null;
    /** Card: `Checks · …`; drawer title: `Running checks · …`. */
    titlePrefix?: "card" | "drawer";
    elapsed?: string | null;
    slow?: boolean;
    stale?: boolean;
    reused?: boolean;
    /** Drawer line 1 when scope is not a full check. */
    scopeLine?: string | null;
    /** Drawer line 3 — host only (never handoff attempt). */
    machineLine?: string | null;
    /** Drawer line 3 — e.g. auto-retry 2 of 3. */
    retryLine?: string | null;
    handoffStep?: string | null;
    /** Canonical Board/Pipeline status line for an active task. */
    statusLine?: string | null;
    variant: "card" | "drawer" | "pipeline";
    /** Pipeline status row — step label beside the bar (e.g. "Running checks 3/680"). */
    pipelineStatusText?: string | null;
    testId?: string;
    /** When false, drawer renders only bar row + footer (title lives in l1). */
    showTitle?: boolean;
  }>(),
  {
    titlePrefix: "card",
    elapsed: null,
    slow: false,
    stale: false,
    reused: false,
    scopeLine: null,
    machineLine: null,
    retryLine: null,
    handoffStep: null,
    statusLine: null,
    pipelineStatusText: null,
    testId: undefined,
    showTitle: true,
  },
);

const fillPercent = computed(() => {
  const p = percent.value;
  if (p == null) return null;
  return Math.min(100, Math.max(p, 2));
});

const percent = computed(() => (props.progress ? checkProgressPercent(props.progress) : null));

const detailLabel = computed(() => {
  if (props.reused) return "reused earlier check";
  if (!props.progress) return props.titlePrefix === "drawer" ? "" : "starting…";
  return checkProgressDetailLabel(props.progress, { filesWord: props.variant === "drawer" });
});

const cardLine = computed(() => {
  if (props.statusLine) return props.statusLine;
  const parts = ["Checks"];
  if (props.reused) parts.push("reused earlier check");
  else if (detailLabel.value && detailLabel.value !== "starting…") parts.push(detailLabel.value);
  else if (props.handoffStep) {
    parts.push(
      props.handoffStep === "check" && !props.progress ? "check" : `checking ${props.handoffStep}`,
    );
  } else parts.push("starting…");
  if (props.elapsed) parts.push(props.elapsed);
  if (props.stale) parts.push("stale");
  else if (props.slow) parts.push("slow");
  return parts.join(" · ");
});

const drawerTitle = computed(() => {
  if (props.scopeLine) return props.scopeLine;
  const elapsed = props.elapsed;
  return elapsed ? `Running checks · ${elapsed}` : "Running checks";
});

const drawerFooter = computed(() => {
  return [props.retryLine, props.machineLine ? `on ${props.machineLine}` : null]
    .filter(Boolean)
    .join(" · ");
});
</script>

<template>
  <div
    class="checks-progress-display"
    :class="`checks-progress-display--${variant}`"
    role="status"
    :data-test-id="testId"
  >
    <template v-if="variant === 'drawer'">
      <div
        v-if="showTitle"
        class="checks-progress-drawer-title"
        data-test-id="checks-progress-drawer-title"
      >
        {{ drawerTitle }}
      </div>
      <div
        v-if="detailLabel || percent != null"
        class="checks-progress-drawer-bar-row"
        data-test-id="checks-progress-drawer-bar-row"
      >
        <span v-if="percent != null" class="check-progress-meter checks-progress-meter--half">
          <span
            class="check-progress-meter__track"
            role="progressbar"
            :aria-valuenow="percent"
            aria-valuemin="0"
            aria-valuemax="100"
            aria-label="Checks running progress"
          >
            <span class="check-progress-meter__fill" :style="{ width: `${fillPercent}%` }" />
          </span>
          <progress
            class="check-progress-meter__native"
            :value="percent"
            max="100"
            tabindex="-1"
            aria-hidden="true"
          />
        </span>
        <span class="checks-progress-drawer-detail">{{ detailLabel }}</span>
      </div>
      <div
        v-if="drawerFooter"
        class="checks-progress-drawer-footer"
        data-test-id="checks-progress-drawer-footer"
      >
        {{ drawerFooter }}
      </div>
    </template>
    <template v-else-if="variant === 'pipeline'">
      <div class="checks-progress-pipeline-row">
        <span v-if="percent != null" class="check-progress-meter checks-progress-meter--half">
          <span
            class="check-progress-meter__track"
            role="progressbar"
            :aria-valuenow="percent"
            aria-valuemin="0"
            aria-valuemax="100"
            aria-label="Check progress"
          >
            <span class="check-progress-meter__fill" :style="{ width: `${fillPercent}%` }" />
          </span>
          <progress
            class="check-progress-meter__native"
            :value="percent"
            max="100"
            tabindex="-1"
            aria-hidden="true"
          />
        </span>
        <span v-if="pipelineStatusText" class="checks-progress-pipeline-status">{{
          pipelineStatusText
        }}</span>
      </div>
    </template>
    <template v-else>
      <span v-if="percent != null" class="check-progress-meter checks-progress-meter--full">
        <span
          class="check-progress-meter__track"
          role="progressbar"
          :aria-valuenow="percent"
          aria-valuemin="0"
          aria-valuemax="100"
          aria-label="Checks running progress"
        >
          <span class="check-progress-meter__fill" :style="{ width: `${fillPercent}%` }" />
        </span>
        <progress
          class="check-progress-meter__native"
          :value="percent"
          max="100"
          tabindex="-1"
          aria-hidden="true"
        />
      </span>
      <span data-test-id="task-card-check-status-line">{{ cardLine }}</span>
    </template>
  </div>
</template>
