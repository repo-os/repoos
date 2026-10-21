<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import { X } from "lucide-vue-next";
import { useUiStore } from "../stores/ui";
import { useRepoStore, type InputAttachmentUploadJob } from "../stores/repo";
import { randomId } from "../lib/random-id";
import Button from "./ui/button.vue";
import ActivityIndicator from "./ActivityIndicator.vue";
import Dialog from "./ui/dialog/root.vue";
import DialogClose from "./ui/dialog/close.vue";
import DialogContent from "./ui/dialog/content.vue";
import DialogDescription from "./ui/dialog/description.vue";
import DialogOverlay from "./ui/dialog/overlay.vue";
import DialogTitle from "./ui/dialog/title.vue";
import ScreenshotViewer from "./ScreenshotViewer.vue";
import PendingAttachmentList from "./PendingAttachmentList.vue";
import ShotDropzone from "./ShotDropzone.vue";
import { isImageMime, pendingToShots, shotIndex } from "../lib/screenshot-viewer";
import { autoGrowTextarea } from "../utils/textarea-autogrow";
const ui = useUiStore(),
  repo = useRepoStore(),
  open = computed(() => ui.isNewInput),
  /**
   * True once the user submits an input. The form swaps to an acknowledgment
   * panel so they can queue another input or leave while creation finishes in
   * the background (0325) — mirroring the freeform new-task flow (0311).
   */
  submitted = ref(false),
  /** Upload batch for the latest submit — scopes the ack panel (#0664 r2). */
  activeSubmitBatchId = ref<string | null>(null),
  /** Depth counter: dragenter/leave fire once per element boundary. */
  dragDepth = ref(0),
  inputViewerOpen = ref(false),
  inputViewerStart = ref(0),
  inputViewerShots = computed(() =>
    pendingToShots(ui.inputScreenshots.filter((s) => isImageMime(s.mime))),
  ),
  currentBatchJobs = computed(() =>
    activeSubmitBatchId.value ? repo.inputAttachmentUploadsForBatch(activeSubmitBatchId.value) : [],
  ),
  outstandingInputUploadJobs = computed(() => repo.outstandingInputAttachmentUploads());
function openInputViewer(src: string): void {
  inputViewerStart.value = shotIndex(inputViewerShots.value, src);
  inputViewerOpen.value = true;
}
function setOpen(v: boolean): void {
  if (!v) ui.close();
}
watch(open, (v) => {
  if (!v) return;
  submitted.value = false;
  activeSubmitBatchId.value = null;
  // The panel reuses the draft, so size its remounted textarea immediately.
  void nextTick(adjustInputHeight);
});
function addFiles(files: File[]): void {
  ui.addInputScreenshots(files);
}
function onDragEnter(): void {
  if (submitted.value) return;
  dragDepth.value++;
}
function onDragLeave(): void {
  if (submitted.value) return;
  dragDepth.value = Math.max(0, dragDepth.value - 1);
}
function onDrop(e: DragEvent): void {
  if (submitted.value) return;
  dragDepth.value = 0;
  const files = e.dataTransfer?.files;
  if (files?.length) ui.addInputScreenshots(Array.from(files));
}
function clearDraft(): void {
  ui.clearInputDraft();
}

const inputTextarea = ref<HTMLTextAreaElement | null>(null);
function adjustInputHeight(): void {
  autoGrowTextarea(inputTextarea.value, 420);
}
watch(() => ui.inputText, adjustInputHeight, { flush: "post" });
/** Hand the capture to the repo store and acknowledge immediately — the input
 *  and its attachments are created in the background (0325). */
function submit(): void {
  const text = ui.inputText.trim();
  if (!text || submitted.value) return;
  const attachments = [...ui.inputScreenshots];
  const batchId = randomId();
  activeSubmitBatchId.value = batchId;
  ui.clearInputDraft();
  submitted.value = true;
  void repo.submitInput(text, attachments, batchId);
}
function retryInputJob(job: InputAttachmentUploadJob): void {
  void repo.retryInputAttachmentUpload(job);
}
function dismissInputJob(job: InputAttachmentUploadJob): void {
  repo.dismissInputAttachmentUpload(job);
}
/** Reset to a fresh form; the in-flight input keeps creating in the background. */
function createAnotherInput(): void {
  submitted.value = false;
  requestAnimationFrame(() => {
    document.getElementById("new-input-text")?.focus();
  });
}
/** Acknowledge the in-flight creation and leave the new-input pane. */
function done(): void {
  submitted.value = false;
  activeSubmitBatchId.value = null;
  ui.close();
}
</script>
<template>
  <Dialog :open="open" @update:open="setOpen"
    ><DialogOverlay /><DialogContent
      :style="{ width: ui.drawerWidth + 'px', 'max-width': '100vw' }"
      @dragenter.prevent="onDragEnter"
      @dragover.prevent
      @dragleave.prevent="onDragLeave"
      @drop.prevent="onDrop"
      ><div class="drawer-resize" @mousedown.prevent="ui.startResize"></div>
      <div class="drawer-head">
        <div class="drawer-head-title">
          <DialogTitle>New input</DialogTitle>
          <DialogDescription class="sr-only"
            >Submit an idea, question, bug, or other input</DialogDescription
          >
        </div>
        <DialogClose class="close-x"><X class="size-[15px]" /></DialogClose>
      </div>
      <div class="drawer-body">
        <div
          v-if="outstandingInputUploadJobs.length"
          class="field ff-upload-followup"
          role="region"
          aria-label="Attachment uploads in progress"
        >
          <label>Attachment uploads</label>
          <p class="ff-notice">
            These uploads belong to earlier inputs. Retry or dismiss each one when it fails.
          </p>
          <PendingAttachmentList
            :items="outstandingInputUploadJobs.map((j) => j.attachment)"
            :allow-remove="false"
            aria-label="Outstanding input attachment uploads"
            @retry="(i) => retryInputJob(outstandingInputUploadJobs[i]!)"
          />
          <div class="btn-row" style="margin-top: 8px">
            <Button
              v-for="(job, i) in outstandingInputUploadJobs.filter(
                (j) => j.attachment.uploadPhase === 'failed',
              )"
              :key="job.inputId + job.attachment.name + i"
              variant="ghost"
              size="sm"
              @click="dismissInputJob(job)"
            >
              Dismiss {{ job.attachment.name }}
            </Button>
          </div>
        </div>
        <div v-if="submitted" class="ff-done">
          <div class="ff-done-head">
            <ActivityIndicator activity="agent" />
            <span>Creating your input</span>
          </div>
          <p class="ff-done-copy">
            This usually takes a few seconds. Your input is being created in the background and will
            be ready shortly. You can create another input or go do something else — nothing is
            lost.
          </p>
          <PendingAttachmentList
            v-if="currentBatchJobs.length"
            :items="currentBatchJobs.map((j) => j.attachment)"
            :allow-remove="false"
            aria-label="Uploading input attachments for this submit"
            @retry="(i) => retryInputJob(currentBatchJobs[i]!)"
          />
          <div class="btn-row" style="margin-top: 18px">
            <Button variant="default" @click="createAnotherInput">Create another input</Button>
            <Button variant="outline" @click="done">Done</Button>
          </div>
        </div>
        <template v-else>
          <div class="field" style="margin-top: 4px">
            <label>Screenshots</label>
            <ShotDropzone :over="dragDepth > 0" @files="addFiles">{{
              ui.inputScreenshots.length
                ? `Add more — ${ui.inputScreenshots.length} screenshot${ui.inputScreenshots.length === 1 ? "" : "s"} added`
                : "Click to add screenshots, or drop them anywhere on this panel"
            }}</ShotDropzone>
            <PendingAttachmentList
              v-if="ui.inputScreenshots.length"
              :items="ui.inputScreenshots"
              @open-shot="(i) => openInputViewer(ui.inputScreenshots[i]!.dataUrl)"
              @remove="(i) => ui.removeInputScreenshot(i)"
            />
          </div>
          <div class="field">
            <div class="field-header">
              <label for="new-input-text">What would you like to share?</label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label="Clear draft"
                :disabled="!ui.inputText.trim() && !ui.inputScreenshots.length"
                @click="clearDraft"
                >Clear</Button
              >
            </div>
            <textarea
              id="new-input-text"
              ref="inputTextarea"
              v-model="ui.inputText"
              class="ff-textarea ff-textarea-autogrow"
              rows="12"
              placeholder="Share an idea, question, bug, observation, or feedback…"
            ></textarea>
          </div>
          <div class="btn-row" style="margin-top: 20px">
            <Button variant="outline" @click="ui.close">Cancel</Button>
            <Button variant="default" :disabled="!ui.inputText.trim()" @click="submit"
              >Submit input</Button
            >
          </div>
        </template>
      </div></DialogContent
    ></Dialog
  >
  <ScreenshotViewer
    v-model:open="inputViewerOpen"
    :shots="inputViewerShots"
    :start-index="inputViewerStart"
  />
</template>
