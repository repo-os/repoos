<script setup lang="ts">
/**
 * The task drawer's Add-shot modal (#0627): plain inputs, never raw JSON.
 * Fields are exactly one declared `## Shots` entry — target (styled dropdown
 * of the configured preview targets), route, label, optional highlight and
 * selector, optional ordered steps.
 *
 * Validation runs on the COMPOSED entry through the shared validator
 * (`parseShotEntry` in `core/shot-plan.ts`) — the same rules `repoos update
 * --shots` enforces server-side and in the CLI, so the modal can never accept
 * something the API would reject (the API re-validates anyway; one validator,
 * no second copy).
 *
 * The capture itself is server-side and takes 5–30s, so the submit button
 * stays disabled with a "Capturing…" label rather than a spinner-less freeze;
 * the server's structured error (busy preview slot, missing Playwright, a
 * route that did not load) lands in the modal and it stays open. A step error
 * that names "step #N" outlines that row too.
 */
import { computed, ref, watch } from "vue";
import { Trash2, ChevronUp, ChevronDown, Plus } from "lucide-vue-next";
import Dialog from "./ui/dialog/root.vue";
import DialogClose from "./ui/dialog/close.vue";
import DialogContent from "./ui/dialog/content.vue";
import DialogDescription from "./ui/dialog/description.vue";
import DialogOverlay from "./ui/dialog/overlay.vue";
import DialogTitle from "./ui/dialog/title.vue";
import Button from "./ui/button.vue";
import Select from "./ui/select/root.vue";
import SelectContent from "./ui/select/content.vue";
import SelectItem from "./ui/select/item.vue";
import SelectTrigger from "./ui/select/trigger.vue";
import SelectValue from "./ui/select/value.vue";
import SelectViewport from "./ui/select/viewport.vue";
import { parseShotEntry, type DeclaredShot } from "../../../core/shot-plan.js";
import type { PreviewTargetOption } from "../types";

const props = defineProps<{
  open: boolean;
  /** Configured preview targets, ranked area-matches-first (#0379). */
  targets: PreviewTargetOption[];
  /** True while the server captures — disables the form and the buttons. */
  busy?: boolean;
  /** Structured error from the last submit attempt (kept in the modal). */
  error?: string;
  /**
   * Set when the shot WAS captured and saved but something needs attention
   * (a highlight/selector matched nothing). The modal stays open to show it;
   * the shot is already added, so submitting again is disabled.
   */
  warning?: string;
}>();

const emit = defineEmits<{
  (e: "update:open", v: boolean): void;
  (e: "submit", entry: DeclaredShot): void;
}>();

const target = ref("");
const route = ref("");
const label = ref("");
const highlight = ref("");
const selector = ref("");

/** One editable step row; composed into a typed `DeclaredStep` on submit. */
interface StepRow {
  kind: "click" | "fill" | "waitFor" | "waitMs";
  selector: string;
  text: string;
  ms: string;
}

const stepKinds: { kind: StepRow["kind"]; label: string }[] = [
  { kind: "click", label: "click" },
  { kind: "fill", label: "fill" },
  { kind: "waitFor", label: "wait for" },
  { kind: "waitMs", label: "wait" },
];

function newStep(): StepRow {
  return { kind: "click", selector: "", text: "", ms: "" };
}

const steps = ref<StepRow[]>([]);
/** 0-based index of the row a validation error pointed at, for the outline. */
const errorStep = ref<number | null>(null);
const error = ref<string | null>(null);

watch(
  () => props.open,
  (open) => {
    // immediate: a modal mounted already-open must still get its defaults.
    target.value = props.targets[0]?.name ?? "";
    route.value = "";
    label.value = "";
    highlight.value = "";
    selector.value = "";
    steps.value = [];
    error.value = null;
    errorStep.value = null;
  },
  { immediate: true },
);

watch(
  () => props.error,
  (v) => {
    error.value = v ?? null;
    const m = /step #(\d+)/.exec(v ?? "");
    errorStep.value = m ? Number(m[1]) - 1 : null;
  },
);

function composeSteps(): unknown[] {
  return steps.value.map((row) => {
    if (row.kind === "click") return { click: row.selector };
    if (row.kind === "fill") return { fill: row.selector, text: row.text };
    if (row.kind === "waitFor") return { waitFor: row.selector };
    return { waitMs: row.ms === "" ? null : Number(row.ms) };
  });
}

/** Validate through the shared core validator; null when the entry is good. */
const validationError = computed<string | null>(() => {
  if (!target.value) return "Pick a preview target";
  const raw: Record<string, unknown> = { target: target.value };
  if (route.value) raw.route = route.value;
  if (label.value) raw.label = label.value;
  if (highlight.value) raw.highlight = highlight.value;
  if (selector.value) raw.selector = selector.value;
  if (steps.value.length) raw.steps = composeSteps();
  const parsed = parseShotEntry(raw);
  return parsed.error ?? null;
});

function removeStep(i: number): void {
  steps.value.splice(i, 1);
}

function moveStep(i: number, delta: -1 | 1): void {
  const j = i + delta;
  if (j < 0 || j >= steps.value.length) return;
  const next = [...steps.value];
  const [row] = next.splice(i, 1);
  next.splice(j, 0, row!);
  steps.value = next;
}

function submit(): void {
  errorStep.value = null;
  const invalid = validationError.value;
  if (invalid) {
    error.value = invalid;
    const m = /step #(\d+)/.exec(invalid);
    errorStep.value = m ? Number(m[1]) - 1 : null;
    return;
  }
  const entry: DeclaredShot = { target: target.value };
  if (route.value) entry.route = route.value;
  if (label.value) entry.label = label.value;
  if (highlight.value) entry.highlight = highlight.value;
  if (selector.value) entry.selector = selector.value;
  if (steps.value.length) {
    // Types are guaranteed by the validator above; cast through unknown once.
    entry.steps = composeSteps() as unknown as DeclaredShot["steps"];
  }
  emit("submit", entry);
}

function close(): void {
  emit("update:open", false);
}
</script>

<template>
  <Dialog :open="open" @update:open="(v) => emit('update:open', v)">
    <DialogOverlay />
    <DialogContent class="add-shot-modal">
      <div class="add-shot-head">
        <div class="add-shot-head-text">
          <DialogTitle>Add shot</DialogTitle>
          <DialogDescription class="add-shot-desc">
            Declares the shot in the task's <code>## Shots</code> list and captures it now — through
            the preview, 5–30s.
          </DialogDescription>
        </div>
        <DialogClose class="close-x" aria-label="Close" :disabled="busy">
          <span aria-hidden="true">×</span>
        </DialogClose>
      </div>
      <form class="add-shot-body" @submit.prevent="submit">
        <div class="field">
          <label :for="'add-shot-target'">Target</label>
          <Select v-model="target" :disabled="busy">
            <SelectTrigger :id="'add-shot-target'" class="add-shot-select">
              <SelectValue placeholder="Preview target" />
            </SelectTrigger>
            <SelectContent position="popper">
              <SelectViewport class="min-w-[var(--radix-select-trigger-width)]">
                <SelectItem v-for="t in targets" :key="t.name" :value="t.name">{{
                  t.name
                }}</SelectItem>
              </SelectViewport>
            </SelectContent>
          </Select>
        </div>
        <div class="field-row">
          <div class="field">
            <label :for="'add-shot-route'">Route</label>
            <input
              id="add-shot-route"
              v-model="route"
              type="text"
              placeholder="/ (preview root)"
              :disabled="busy"
              spellcheck="false"
            />
          </div>
          <div class="field">
            <label :for="'add-shot-label'">Label</label>
            <input
              id="add-shot-label"
              v-model="label"
              type="text"
              placeholder="Task drawer open"
              :disabled="busy"
            />
          </div>
        </div>
        <div class="field-row">
          <div class="field">
            <label :for="'add-shot-highlight'">Highlight selector</label>
            <input
              id="add-shot-highlight"
              v-model="highlight"
              type="text"
              class="mono"
              placeholder="[data-test-id='new-task'] .drawer"
              :disabled="busy"
              spellcheck="false"
            />
          </div>
          <div class="field">
            <label :for="'add-shot-selector'">Selector (element crop)</label>
            <input
              id="add-shot-selector"
              v-model="selector"
              type="text"
              class="mono"
              placeholder="optional"
              :disabled="busy"
              spellcheck="false"
            />
          </div>
        </div>

        <div class="field">
          <div class="field-header">
            <label>Steps</label>
            <Button
              variant="outline"
              size="sm"
              type="button"
              :disabled="busy"
              @click="steps.push(newStep())"
            >
              <Plus aria-hidden="true" /> Add step
            </Button>
          </div>
          <p v-if="steps.length === 0" class="add-shot-steps-empty">
            Optional — ordered actions to reach the state before capture.
          </p>
          <div v-else class="add-shot-steps">
            <div
              v-for="(row, i) in steps"
              :key="i"
              class="add-shot-step"
              :class="{ invalid: errorStep === i }"
            >
              <div class="add-shot-step-kind" role="radiogroup" aria-label="Step kind">
                <button
                  v-for="k in stepKinds"
                  :key="k.kind"
                  type="button"
                  class="add-shot-step-kind-btn"
                  :class="{ active: row.kind === k.kind }"
                  :aria-pressed="row.kind === k.kind"
                  :disabled="busy"
                  @click="row.kind = k.kind"
                >
                  {{ k.label }}
                </button>
              </div>
              <div class="add-shot-step-inputs">
                <template v-if="row.kind === 'waitMs'">
                  <input
                    v-model="row.ms"
                    type="number"
                    min="0"
                    class="mono"
                    placeholder="milliseconds"
                    :disabled="busy"
                    :aria-label="`Step ${i + 1}: wait milliseconds`"
                  />
                </template>
                <template v-else>
                  <input
                    v-model="row.selector"
                    type="text"
                    class="mono"
                    placeholder="CSS selector"
                    :disabled="busy"
                    :aria-label="`Step ${i + 1}: selector`"
                    spellcheck="false"
                  />
                  <input
                    v-if="row.kind === 'fill'"
                    v-model="row.text"
                    type="text"
                    placeholder="text to fill"
                    :disabled="busy"
                    :aria-label="`Step ${i + 1}: text to fill`"
                  />
                </template>
              </div>
              <div class="add-shot-step-actions">
                <button
                  type="button"
                  class="add-shot-step-btn"
                  aria-label="Move step up"
                  :disabled="busy || i === 0"
                  @click="moveStep(i, -1)"
                >
                  <ChevronUp aria-hidden="true" />
                </button>
                <button
                  type="button"
                  class="add-shot-step-btn"
                  aria-label="Move step down"
                  :disabled="busy || i === steps.length - 1"
                  @click="moveStep(i, 1)"
                >
                  <ChevronDown aria-hidden="true" />
                </button>
                <button
                  type="button"
                  class="add-shot-step-btn danger"
                  aria-label="Remove step"
                  :disabled="busy"
                  @click="removeStep(i)"
                >
                  <Trash2 aria-hidden="true" />
                </button>
              </div>
            </div>
          </div>
        </div>

        <p v-if="error" class="ff-error" role="alert">{{ error }}</p>
        <p v-if="warning" class="ff-notice" role="status" data-test-id="add-shot-warning">
          Shot added. {{ warning }}
        </p>

        <div class="btn-row">
          <DialogClose as-child>
            <Button variant="outline" type="button" :disabled="busy">{{
              warning ? "Close" : "Cancel"
            }}</Button>
          </DialogClose>
          <Button variant="default" type="submit" :disabled="busy || !targets.length || !!warning">
            {{ busy ? "Capturing…" : "Add and capture" }}
          </Button>
        </div>
      </form>
    </DialogContent>
  </Dialog>
</template>
