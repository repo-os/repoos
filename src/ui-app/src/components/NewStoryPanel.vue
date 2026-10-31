<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch } from "vue";
import { randomId } from "../lib/random-id";
import { X } from "lucide-vue-next";
import { useUiStore } from "../stores/ui";
import { useRepoStore } from "../stores/repo";
import { useConfigStore } from "../stores/config";
import Button from "./ui/button.vue";
import Input from "./ui/input.vue";
import ActivityIndicator from "./ActivityIndicator.vue";
import VoiceDictate from "./VoiceDictate.vue";
import AgentModelControl from "./AgentModelControl.vue";
import Dialog from "./ui/dialog/root.vue";
import DialogClose from "./ui/dialog/close.vue";
import DialogContent from "./ui/dialog/content.vue";
import DialogDescription from "./ui/dialog/description.vue";
import DialogOverlay from "./ui/dialog/overlay.vue";
import DialogTitle from "./ui/dialog/title.vue";
import { autoGrowTextarea } from "../utils/textarea-autogrow";
import ShotDropzone from "./ShotDropzone.vue";
import PendingAttachmentList from "./PendingAttachmentList.vue";
import { markAttachmentUploading, markAttachmentUploadFailed } from "../lib/attachment-upload-ui";
import type { PendingScreenshot } from "../stores/ui";

const ui = useUiStore();
const repo = useRepoStore();
const config = useConfigStore();

const open = computed(() => ui.isNewStory);
function setOpen(v: boolean): void {
  if (!v) ui.close();
}

const storyName = ref("");
const description = ref("");
const formError = ref("");
interface PendingStoryScreenshot extends PendingScreenshot {
  /** The story that owns this queued retry; never retarget a failed upload. */
  uploadStoryKey?: string;
}
const pendingScreenshots = ref<PendingStoryScreenshot[]>([]);
const dragDepth = ref(0);
const freeformRunning = ref(false);
const freeformRunId = ref<string | null>(null);
/**
 * True once the story is saved. The form swaps to an acknowledgment panel so
 * the user can start another story or leave while the PM agent fleshes it out
 * in the background — the same flow as a freeform New task (0311).
 */
const submitted = ref(false);
/** Whether the PM agent is fleshing the submitted story out (false: saved as-is). */
const submittedPending = ref(false);

const pmAgentReady = computed(() => {
  if (!config.loaded) return true;
  return (config.agents ?? []).some((a) => a.name === "pm" && a.enabled);
});

const cliOptions = computed(() => config.agentsMeta.clis ?? []);
const modelOptions = computed(() =>
  config.modelsFor(freeformOverride.cli, freeformOverride.model || undefined),
);

const freeformPmBase = computed(() => {
  const list = config.agents?.length ? config.agents : [];
  return list.find((a) => a.enabled && a.name === "pm") ?? null;
});

const freeformOverride = reactive({
  agent: "",
  cli: "",
  model: "",
});

function initFreeformOverrides(): void {
  const base = freeformPmBase.value;
  freeformOverride.agent = base?.name || "";
  freeformOverride.cli = base?.cli || "";
  freeformOverride.model = base?.model || "";
}

watch(
  () => ui.isNewStory,
  (isOpen) => {
    if (!isOpen) return;
    storyName.value = "";
    description.value = "";
    formError.value = "";
    pendingScreenshots.value = [];
    resetRun();
    initFreeformOverrides();
  },
);

const freeformIsCustom = computed(() => {
  const base = freeformPmBase.value;
  if (!base) return false;
  return (
    freeformOverride.agent !== base.name ||
    freeformOverride.cli !== base.cli ||
    freeformOverride.model !== base.model
  );
});

const freeformLines = computed<{ s: "out" | "err"; d: string }[]>(() => {
  const raw = freeformRunId.value ? (repo.outputs[freeformRunId.value] ?? []) : [];
  return raw
    .map((e): { s: "out" | "err"; d: string } => {
      if ("type" in e) {
        return { s: "out", d: e.type === "text" ? e.text : ((e as { d?: string }).d ?? "") };
      }
      return { s: e.s === "err" ? "err" : "out", d: e.d };
    })
    .filter((l) => l.d.trim() !== "");
});

const ffLogEl = ref<HTMLElement | null>(null);
watch(freeformLines, () => {
  nextTick(() => {
    const el = ffLogEl.value;
    if (el) el.scrollTop = el.scrollHeight;
  });
});

const descriptionTextarea = ref<HTMLTextAreaElement | null>(null);

function adjustDescriptionHeight(): void {
  autoGrowTextarea(descriptionTextarea.value, 420);
}

watch(description, adjustDescriptionHeight, { flush: "post" });

function onDescriptionTranscribed(text: string): void {
  if (descriptionTextarea.value) {
    const el = descriptionTextarea.value;
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? el.value.length;
    el.value = el.value.slice(0, start) + text + el.value.slice(end);
    description.value = el.value;
  }
}

/** Drop the acknowledgment state and the previous run's buffered output. */
function resetRun(): void {
  submitted.value = false;
  submittedPending.value = false;
  if (freeformRunId.value) repo.clearOutput(freeformRunId.value);
  freeformRunId.value = null;
}

function addShotFiles(files: File[]): void {
  for (const file of files) {
    if (pendingScreenshots.value.length >= 12) break;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string")
        pendingScreenshots.value.push({
          name: file.name,
          mime: file.type,
          dataUrl: reader.result,
          size: file.size,
        });
    };
    reader.readAsDataURL(file);
  }
}
function onDragEnter(): void {
  dragDepth.value++;
}
function onDragLeave(): void {
  dragDepth.value = Math.max(0, dragDepth.value - 1);
}
function onDrop(event: DragEvent): void {
  dragDepth.value = 0;
  if (event.dataTransfer?.files.length) addShotFiles(Array.from(event.dataTransfer.files));
}
async function uploadScreenshots(key: string): Promise<void> {
  for (const shot of [...pendingScreenshots.value]) {
    if (shot.uploadStoryKey && shot.uploadStoryKey !== key) continue;
    shot.uploadStoryKey = key;
    markAttachmentUploading(shot);
    try {
      await repo.uploadStoryScreenshot(key, shot);
      pendingScreenshots.value.splice(pendingScreenshots.value.indexOf(shot), 1);
    } catch (error) {
      markAttachmentUploadFailed(shot, error);
    }
  }
}
async function retryScreenshot(index: number): Promise<void> {
  const shot = pendingScreenshots.value[index];
  const key = shot?.uploadStoryKey;
  if (!key || !shot) return;
  markAttachmentUploading(shot);
  try {
    await repo.uploadStoryScreenshot(key, shot);
    pendingScreenshots.value.splice(index, 1);
  } catch (error) {
    markAttachmentUploadFailed(shot, error);
  }
}
const submittedStoryKey = ref("");

async function createStory(): Promise<void> {
  const desc = description.value.trim();
  if (!desc || freeformRunning.value) return;
  ui.saving = true;
  freeformRunning.value = true;
  formError.value = "";
  resetRun();
  freeformRunId.value = randomId();
  try {
    const overrides = freeformIsCustom.value
      ? { agent: freeformOverride.agent, cli: freeformOverride.cli, model: freeformOverride.model }
      : undefined;
    // Returns as soon as the story is saved; the PM runs on in the background.
    const res = await repo.createFreeformStory(
      { name: storyName.value.trim(), description: desc },
      freeformRunId.value,
      overrides,
    );
    submittedStoryKey.value = res.definition?.key ?? "";
    if (submittedStoryKey.value) await uploadScreenshots(submittedStoryKey.value);
    submittedPending.value = res.pending === true;
    submitted.value = true;
    storyName.value = "";
    description.value = "";
  } catch (err) {
    formError.value = err instanceof Error ? err.message : String(err);
  } finally {
    freeformRunning.value = false;
    ui.saving = false;
  }
}

/** Back to a fresh form; the submitted story keeps being fleshed out. */
function createAnotherStory(): void {
  clearResolvedScreenshots();
  submittedStoryKey.value = "";
  resetRun();
  requestAnimationFrame(() => document.getElementById("ns-story-name")?.focus());
}

/** Keep failed picks attached to their original story; discard anything resolved. */
function clearResolvedScreenshots(): void {
  for (let i = pendingScreenshots.value.length - 1; i >= 0; i--) {
    const shot = pendingScreenshots.value[i];
    if (shot?.uploadPhase !== "failed") pendingScreenshots.value.splice(i, 1);
  }
}

/** Acknowledge the in-flight creation and leave the pane. */
function done(): void {
  resetRun();
  ui.close();
}

function onOpenAutoFocus(e: Event): void {
  if (ui.isNewStory) {
    e.preventDefault();
    requestAnimationFrame(() => document.getElementById("ns-story-name")?.focus());
  }
}
</script>

<template>
  <Dialog :open="open" @update:open="setOpen">
    <DialogOverlay />
    <DialogContent
      :style="{ width: ui.drawerWidth + 'px', 'max-width': '100vw' }"
      @open-auto-focus="onOpenAutoFocus"
      @dragenter.prevent="onDragEnter"
      @dragleave.prevent="onDragLeave"
      @dragover.prevent
      @drop.prevent="onDrop"
    >
      <div class="drawer-resize" @mousedown.prevent="ui.startResize"></div>
      <div class="drawer-head">
        <div class="drawer-head-title">
          <DialogTitle>New story</DialogTitle>
          <DialogDescription class="sr-only"
            >Capture a delivery slice before breaking it into tasks</DialogDescription
          >
        </div>
        <DialogClose class="close-x"><X class="size-[15px]" /></DialogClose>
      </div>
      <div class="drawer-body">
        <div v-if="submitted" class="ff-done">
          <div class="ff-done-head">
            <ActivityIndicator v-if="submittedPending" activity="agent" />
            <span>{{ submittedPending ? "Creating your story" : "Story saved" }}</span>
          </div>
          <p v-if="submittedPending" class="ff-done-copy">
            This may take a few minutes. Your story is saved and the PM agent is fleshing it out in
            the background — naming it, writing up the scope, and adding any existing tasks that
            belong to it. The Stories page updates automatically when it's ready. You can keep
            working, or start another story while you wait — nothing is lost.
          </p>
          <p v-else class="ff-done-copy">
            Your story was saved as written. It's on the Stories page now.
          </p>
          <PendingAttachmentList
            v-if="pendingScreenshots.length"
            :items="pendingScreenshots"
            aria-label="Story screenshot uploads"
            :allow-remove="false"
            @retry="(i) => void retryScreenshot(i)"
          />
          <div class="btn-row" style="margin-top: 18px">
            <Button variant="default" @click="createAnotherStory">Create another story</Button>
            <Button variant="outline" @click="done">Done</Button>
          </div>
          <div v-if="freeformLines.length" class="ff-stream" style="margin-top: 16px">
            <div class="ff-stream-head">
              <ActivityIndicator activity="agent" />
              PM agent
            </div>
            <div ref="ffLogEl" class="ff-stream-log">
              <div
                v-for="(line, i) in freeformLines"
                :key="i"
                class="ff-stream-line"
                :class="line.s === 'err' ? 'err' : ''"
              >
                {{ line.d }}
              </div>
            </div>
          </div>
        </div>
        <template v-else>
          <div class="field">
            <label>Screenshots</label>
            <ShotDropzone :over="dragDepth > 0" @files="addShotFiles">{{
              pendingScreenshots.length
                ? `Add more — ${pendingScreenshots.length} screenshot${pendingScreenshots.length === 1 ? "" : "s"} added`
                : "Click to add screenshots, or drop them anywhere on this panel"
            }}</ShotDropzone>
            <PendingAttachmentList
              v-if="pendingScreenshots.length"
              :items="pendingScreenshots"
              @remove="(i) => pendingScreenshots.splice(i, 1)"
              @retry="(i) => void retryScreenshot(i)"
            />
            <div
              v-if="pendingScreenshots.some((s) => s.uploadPhase === 'failed')"
              class="ff-notice"
              role="status"
            >
              Some screenshots failed to upload. Retry them above.
            </div>
          </div>
          <div class="field">
            <label for="ns-story-name">Story name</label>
            <Input
              id="ns-story-name"
              v-model="storyName"
              placeholder="Project updates email"
              :disabled="freeformRunning"
            />
          </div>
          <div class="field">
            <div class="field-header">
              <label for="ns-story-desc">Description</label>
              <VoiceDictate @transcribed="onDescriptionTranscribed" />
            </div>
            <textarea
              id="ns-story-desc"
              ref="descriptionTextarea"
              v-model="description"
              class="ff-textarea ff-textarea-autogrow"
              rows="10"
              placeholder="Describe the outcome, areas involved, and constraints — the PM agent will flesh this out."
              :disabled="freeformRunning"
            ></textarea>
          </div>
          <div class="ff-agent-bar">
            <div class="agent-pick-grid">
              <div class="agent-field" style="grid-column: 1 / -1">
                <AgentModelControl
                  :cli-options="cliOptions"
                  :model-options="modelOptions"
                  memory-key="panel:new-story"
                  v-model:cli="freeformOverride.cli"
                  v-model:model="freeformOverride.model"
                  :disabled="freeformRunning"
                />
              </div>
            </div>
          </div>
          <div v-if="!pmAgentReady" class="ff-notice">
            No PM agent is configured.
            <router-link :to="{ name: 'agents' }" @click="ui.close()">
              Set one up on the Agents page
            </router-link>
            — your description will be saved as-is.
          </div>
          <div v-if="formError" class="ff-error">{{ formError }}</div>
          <div class="btn-row" style="margin-top: 20px">
            <Button variant="outline" @click="ui.close()">Cancel</Button>
            <Button
              variant="default"
              :disabled="ui.saving || !description.trim()"
              @click="createStory"
            >
              <ActivityIndicator v-if="freeformRunning" activity="agent" />
              {{ freeformRunning ? "Saving…" : "Create story" }}
            </Button>
          </div>
        </template>
      </div>
    </DialogContent>
  </Dialog>
</template>
