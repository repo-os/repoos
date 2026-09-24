<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { X, Paperclip } from "lucide-vue-next";
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
const ui = useUiStore(),
  repo = useRepoStore(),
  fileInput = ref<HTMLInputElement | null>(null),
  open = computed(() => ui.isNewInput),
  /**
   * True once the user submits an input. The form swaps to an acknowledgment
   * panel so they can queue another input or leave while creation finishes in
   * the background (0325) — mirroring the freeform new-task flow (0311).
   */
  submitted = ref(false);
function setOpen(v: boolean): void {
  if (!v) ui.close();
}
watch(open, (v) => {
  if (v) {
    ui.inputText = "";
    submitted.value = false;
    ui.clearScreenshots();
  }
});
function files(e: Event): void {
  ui.addScreenshots(Array.from((e.target as HTMLInputElement).files ?? []));
}
/** Hand the capture to the repo store and acknowledge immediately — the input
 *  and its attachments are created in the background (0325). */
function submit(): void {
  const text = ui.inputText.trim();
  if (!text || submitted.value) return;
  const attachments = [...ui.pendingScreenshots];
  ui.inputText = "";
  ui.clearScreenshots();
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
    ><DialogOverlay /><DialogContent :style="{ width: ui.drawerWidth + 'px', 'max-width': '100vw' }"
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
          <div class="field">
            <label for="new-input-text">What would you like to share?</label>
            <textarea
              id="new-input-text"
              v-model="ui.inputText"
              class="ff-textarea"
              rows="12"
              placeholder="Share an idea, question, bug, observation, or feedback…"
            ></textarea>
          </div>
          <div class="field">
            <label>Attachments</label>
            <div
              class="shot-dropzone"
              role="button"
              tabindex="0"
              @click="fileInput?.click()"
              @keydown.enter="fileInput?.click()"
            >
              <Paperclip class="size-4" />
              <span>{{
                ui.pendingScreenshots.length
                  ? `Add more — ${ui.pendingScreenshots.length} file${ui.pendingScreenshots.length === 1 ? "" : "s"} attached`
                  : "Add screenshot or file"
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
              v-if="ui.pendingScreenshots.length"
              class="ff-pending-files"
              aria-label="Selected attachments"
            >
              <div
                v-for="file in ui.pendingScreenshots"
                :key="file.name + file.size"
                class="ff-pending-file"
              >
                <img v-if="file.mime.startsWith('image/')" :src="file.dataUrl" :alt="file.name" />
                <div v-else class="ff-pending-file-icon"><Paperclip class="size-4" /></div>
                <span class="ff-pending-file-name" :title="file.name">{{ file.name }}</span>
              </div>
            </div>
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
</template>
