<script setup lang="ts">
/**
 * Add / edit a dev target (#0749). The four fields plus the optional label and
 * health check, validated through the shared `parseDevTargets` (never a second
 * copy of the rules) as the user types, so an inline error appears before save.
 *
 * Body-teleported through the shared dialog components, so it never traps a
 * `position: fixed` overlay inside the Settings pane.
 */
import { computed, ref, watch } from "vue";
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
import {
  devTargetError,
  emptyDevTargetDraft,
  type DevTargetDraft,
} from "../lib/dev-targets";

const props = defineProps<{
  open: boolean;
  /** The draft to edit, or null to add a new one. */
  target: DevTargetDraft | null;
  /** Names already used by other rows, so a rename can't collide. */
  takenNames: string[];
  /** True while the save is in flight. */
  busy?: boolean;
}>();

defineOptions({ name: "DevTargetDialog" });

const emit = defineEmits<{
  (e: "update:open", v: boolean): void;
  (e: "submit", draft: DevTargetDraft): void;
}>();

const draft = ref<DevTargetDraft>(emptyDevTargetDraft());
/** Only show validation once the user has tried to submit (or edited a field). */
const touched = ref(false);

watch(
  () => [props.open, props.target] as const,
  ([open, target]) => {
    if (!open) return;
    draft.value = target ? { ...target } : emptyDevTargetDraft();
    touched.value = false;
  },
  { immediate: true },
);

const selfName = computed(() => props.target?.name ?? "");

const error = computed<string | null>(() =>
  devTargetError(draft.value, { takenNames: props.takenNames, selfName: selfName.value }),
);

const isEditing = computed(() => props.target !== null);

/** The command hint changes with the kind — a server runs; an artifact builds. */
const commandPlaceholder = computed(() =>
  draft.value.kind === "server" ? "bun run dev" : "bun run build:android",
);

function submit(): void {
  touched.value = true;
  if (error.value) return;
  emit("submit", { ...draft.value });
}

function close(): void {
  emit("update:open", false);
}
</script>

<template>
  <Dialog :open="open" @update:open="(v) => emit('update:open', v)">
    <DialogOverlay />
    <DialogContent class="dev-target-modal">
      <div class="dev-target-head">
        <div>
          <DialogTitle>{{ isEditing ? "Edit dev target" : "Add dev target" }}</DialogTitle>
          <DialogDescription class="dev-target-desc">
            A thing you run yourself while developing — a local HMR server, a debug build. Only
            the command declared here can be started; RepoOS never runs one typed elsewhere.
          </DialogDescription>
        </div>
        <DialogClose class="close-x" aria-label="Close" :disabled="busy">
          <span aria-hidden="true">×</span>
        </DialogClose>
      </div>

      <form class="dev-target-body" @submit.prevent="submit">
        <div class="field-row">
          <div class="field">
            <label for="dev-target-name">Name</label>
            <input
              id="dev-target-name"
              v-model="draft.name"
              type="text"
              placeholder="web"
              spellcheck="false"
              autocomplete="off"
              :disabled="busy"
              @blur="touched = true"
            />
          </div>
          <div class="field">
            <label for="dev-target-label">Label (optional)</label>
            <input
              id="dev-target-label"
              v-model="draft.label"
              type="text"
              placeholder="Web app"
              :disabled="busy"
            />
          </div>
        </div>

        <div class="field">
          <label for="dev-target-kind">Kind</label>
          <Select v-model="draft.kind" :disabled="busy">
            <SelectTrigger id="dev-target-kind" class="dev-target-select">
              <SelectValue placeholder="Kind" />
            </SelectTrigger>
            <SelectContent position="popper">
              <SelectViewport class="min-w-[var(--radix-select-trigger-width)]">
                <SelectItem value="server">Server — long-lived, has a URL</SelectItem>
                <SelectItem value="artifact">Artifact — a build that produces a file</SelectItem>
              </SelectViewport>
            </SelectContent>
          </Select>
        </div>

        <div class="field">
          <label for="dev-target-command">Command</label>
          <input
            id="dev-target-command"
            v-model="draft.command"
            type="text"
            class="mono"
            :placeholder="commandPlaceholder"
            spellcheck="false"
            autocomplete="off"
            :disabled="busy"
            @blur="touched = true"
          />
          <p class="dev-target-hint">Runs in the project's root checkout, never a task worktree.</p>
        </div>

        <div v-if="draft.kind === 'server'" class="field">
          <label for="dev-target-url">URL</label>
          <input
            id="dev-target-url"
            v-model="draft.url"
            type="text"
            class="mono"
            placeholder="http://localhost:5173"
            spellcheck="false"
            autocomplete="off"
            :disabled="busy"
            @blur="touched = true"
          />
        </div>
        <div v-else class="field">
          <label for="dev-target-artifact">Output path</label>
          <input
            id="dev-target-artifact"
            v-model="draft.artifactPath"
            type="text"
            class="mono"
            placeholder="dist/app-debug.apk"
            spellcheck="false"
            autocomplete="off"
            :disabled="busy"
            @blur="touched = true"
          />
        </div>

        <div class="field">
          <div class="field-header">
            <label for="dev-target-health-url">Health check (optional)</label>
          </div>
          <div v-if="draft.kind === 'server'" class="field-row">
            <input
              id="dev-target-health-url"
              v-model="draft.healthCheckUrl"
              type="text"
              class="mono"
              placeholder="http://localhost:5173/health"
              spellcheck="false"
              autocomplete="off"
              :disabled="busy"
              :aria-label="'Health check URL'"
            />
            <input
              v-model="draft.healthCheckFile"
              type="text"
              class="mono"
              placeholder="or a file that must exist"
              spellcheck="false"
              autocomplete="off"
              :disabled="busy"
              :aria-label="'Health check file'"
            />
          </div>
          <div v-else class="field-row">
            <input
              v-model="draft.healthCheckFile"
              id="dev-target-health-file"
              type="text"
              class="mono"
              placeholder="dist/app-debug.apk (defaults to the output path)"
              spellcheck="false"
              autocomplete="off"
              :disabled="busy"
              :aria-label="'Health check file'"
            />
            <input
              v-model="draft.healthCheckUrl"
              type="text"
              class="mono"
              placeholder="or a URL that must answer"
              spellcheck="false"
              autocomplete="off"
              :disabled="busy"
              :aria-label="'Health check URL'"
            />
          </div>
          <p class="dev-target-hint">
            {{
              draft.kind === "server"
                ? "Polled until it answers before the target is reported running — leave blank to use the URL above."
                : "The path that must exist before the target is reported built."
            }}
          </p>
        </div>

        <div v-if="touched && error" class="ff-error" role="alert">{{ error }}</div>

        <div class="btn-row">
          <Button variant="outline" type="button" :disabled="busy" @click="close">Cancel</Button>
          <Button variant="default" type="submit" :disabled="busy">
            {{ isEditing ? "Save target" : "Add target" }}
          </Button>
        </div>
      </form>
    </DialogContent>
  </Dialog>
</template>

<style scoped>
.dev-target-modal {
  width: min(560px, 92vw);
}
.dev-target-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}
.dev-target-desc {
  margin-top: 4px;
  max-width: 52ch;
}
.dev-target-body {
  margin-top: 14px;
}
.dev-target-select {
  width: 100%;
}
.dev-target-hint {
  margin: 6px 0 0;
  font-size: 11px;
  line-height: 1.5;
  color: var(--txt-faint);
}
</style>
