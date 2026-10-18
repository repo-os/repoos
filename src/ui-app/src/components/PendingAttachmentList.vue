<script setup lang="ts">
import { Paperclip, RotateCcw, X } from "lucide-vue-next";
import type { PendingScreenshot } from "../stores/ui";
import { isImageMime } from "../lib/screenshot-viewer";
import { attachmentUploadPhase, pendingAttachmentRowClass } from "../lib/attachment-upload-ui";
import ActivityIndicator from "./ActivityIndicator.vue";
import ScreenshotExpandButton from "./ScreenshotExpandButton.vue";
import Button from "./ui/button.vue";

defineOptions({ name: "PendingAttachmentList" });

const props = withDefaults(
  defineProps<{
    items: PendingScreenshot[];
    /** Hide remove while an upload is in flight. */
    allowRemove?: boolean;
    ariaLabel?: string;
  }>(),
  {
    allowRemove: true,
    ariaLabel: "Selected attachments",
  },
);

const emit = defineEmits<{
  remove: [index: number];
  openShot: [index: number];
  retry: [index: number];
}>();

function canRemove(s: PendingScreenshot): boolean {
  return props.allowRemove && attachmentUploadPhase(s) !== "uploading";
}

function statusLabel(s: PendingScreenshot): string | null {
  const phase = attachmentUploadPhase(s);
  if (phase === "uploading") return "Uploading…";
  if (phase === "failed") return s.uploadError || "Upload failed";
  return null;
}
</script>

<template>
  <div class="ff-pending-files" :aria-label="ariaLabel">
    <div
      v-for="(s, i) in items"
      :key="s.name + s.size + i + (s.uploadPhase ?? '')"
      class="ff-pending-file"
      :class="pendingAttachmentRowClass(s)"
    >
      <img v-if="isImageMime(s.mime)" :src="s.dataUrl" :alt="s.name" @click="emit('openShot', i)" />
      <div v-else class="ff-pending-file-icon"><Paperclip class="size-4" /></div>
      <div class="ff-pending-file-meta">
        <span class="ff-pending-file-name" :title="s.name">{{ s.name }}</span>
        <span v-if="statusLabel(s)" class="ff-pending-file-status" role="status">
          <ActivityIndicator
            v-if="attachmentUploadPhase(s) === 'uploading'"
            size="sm"
            :dots="3"
            label=""
          />
          {{ statusLabel(s) }}
        </span>
      </div>
      <div class="shot-row-actions">
        <ScreenshotExpandButton
          v-if="isImageMime(s.mime)"
          :name="s.name"
          @click="emit('openShot', i)"
        />
        <Button
          v-if="attachmentUploadPhase(s) === 'failed'"
          type="button"
          variant="outline"
          size="sm"
          class="ff-pending-file-retry"
          :aria-label="`Retry upload for ${s.name}`"
          @click.stop="emit('retry', i)"
        >
          <RotateCcw class="size-3.5" />
          Retry
        </Button>
        <button
          v-if="canRemove(s)"
          type="button"
          class="ff-pending-file-remove"
          :aria-label="`Remove ${s.name}`"
          title="Remove attachment"
          @click.stop="emit('remove', i)"
        >
          <X class="size-3.5" />
        </button>
      </div>
    </div>
  </div>
</template>
