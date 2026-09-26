<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { X, Paperclip, ImagePlus } from "lucide-vue-next";
import { useUiStore } from "../stores/ui";
import { useRepoStore } from "../stores/repo";
import Button from "./ui/button.vue";
import ActivityIndicator from "./ActivityIndicator.vue";
import Dialog from "./ui/dialog/root.vue";
import DialogClose from "./ui/dialog/close.vue";
import DialogContent from "./ui/dialog/content.vue";
import DialogDescription from "./ui/dialog/description.vue";
import DialogOverlay from "./ui/dialog/overlay.vue";
import DialogTitle from "./ui/dialog/title.vue";
import ScreenshotViewer from "./ScreenshotViewer.vue";
import ScreenshotExpandButton from "./ScreenshotExpandButton.vue";
import { isImageMime, pendingToShots, shotIndex } from "../lib/screenshot-viewer";
const ui = useUiStore(),
  repo = useRepoStore(),
  fileInput = ref<HTMLInputElement | null>(null),
  open = computed(() => ui.isNewInput),
  /**
   * True once the user submits an input. The form swaps to an acknowledgment
   * panel so they can queue another input or leave while creation finishes in
   * the background (0325) — mirroring the freeform new-task flow (0311).
   */
  submitted = ref(false),
  /** Depth counter: dragenter/leave fire once per element boundary. */
  dragDepth = ref(0),
  inputViewerOpen = ref(false),
  inputViewerStart = ref(0),
  inputViewerShots = computed(() =>
    pendingToShots(ui.inputScreenshots.filter((s) => isImageMime(s.mime))),
  );
function openInputViewer(src: string): void {
  inputViewerStart.value = shotIndex(inputViewerShots.value, src);
  inputViewerOpen.value = true;
}
function setOpen(v: boolean): void {
  if (!v) ui.close();
}
watch(open, (v) => {
  if (v) submitted.value = false;
});
function files(e: Event): void {
  const input = e.target as HTMLInputElement;
  if (input.files) ui.addInputScreenshots(Array.from(input.files));
  input.value = "";
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
/** Hand the capture to the repo store and acknowledge immediately — the input
 *  and its attachments are created in the background (0325). */
function submit(): void {
  const text = ui.inputText.trim();
  if (!text || submitted.value) return;
  const attachments = [...ui.inputScreenshots];
  ui.clearInputDraft();
  submitted.value = true;
  void repo.submitInput(text, attachments);
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
        <div v-if="submitted" class="ff-done">
          <div class="ff-done-head">
            <ActivityIndicator />
            <span>Creating your input</span>
          </div>
          <p class="ff-done-copy">
            This usually takes a few seconds. Your input is being created in the background and will
            be ready shortly. You can create another input or go do something else — nothing is
            lost.
          </p>
          <div class="btn-row" style="margin-top: 18px">
            <Button variant="default" @click="createAnotherInput">Create another input</Button>
            <Button variant="outline" @click="done">Done</Button>
          </div>
        </div>
        <template v-else>
          <div class="field" style="margin-top: 4px">
            <label>Screenshots</label>
            <div
              class="shot-dropzone"
              :class="{ over: dragDepth > 0 }"
              role="button"
              tabindex="0"
              @click="fileInput?.click()"
              @keydown.enter="fileInput?.click()"
            >
              <ImagePlus class="size-4" />
              <span>{{
                ui.inputScreenshots.length
                  ? `Add more — ${ui.inputScreenshots.length} screenshot${ui.inputScreenshots.length === 1 ? "" : "s"} added`
                  : "Click to add screenshots, or drop them anywhere on this panel"
              }}</span>
              <input
                id="new-input-file"
                ref="fileInput"
                type="file"
                multiple
                class="shot-input"
                @change="files"
                @click.stop
              />
            </div>
            <div
              v-if="ui.inputScreenshots.length"
              class="ff-pending-files"
              aria-label="Selected attachments"
            >
              <div
                v-for="(file, i) in ui.inputScreenshots"
                :key="file.name + file.size + i"
                class="ff-pending-file"
              >
                <img
                  v-if="isImageMime(file.mime)"
                  :src="file.dataUrl"
                  :alt="file.name"
                  @click="openInputViewer(file.dataUrl)"
                />
                <div v-else class="ff-pending-file-icon"><Paperclip class="size-4" /></div>
                <span class="ff-pending-file-name" :title="file.name">{{ file.name }}</span>
                <ScreenshotExpandButton
                  v-if="isImageMime(file.mime)"
                  :name="file.name"
                  @click="openInputViewer(file.dataUrl)"
                />
                <button
                  type="button"
                  class="ff-pending-file-remove"
                  :aria-label="`Remove ${file.name}`"
                  title="Remove attachment"
                  @click.stop="ui.removeInputScreenshot(i)"
                >
                  <X class="size-3.5" />
                </button>
              </div>
            </div>
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
              v-model="ui.inputText"
              class="ff-textarea"
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
