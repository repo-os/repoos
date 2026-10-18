<script setup lang="ts">
import { nextTick, ref, watch } from "vue";
import { X } from "lucide-vue-next";
import type { ScreenshotShot } from "../lib/screenshot-viewer";
import Dialog from "./ui/dialog/root.vue";
import DialogClose from "./ui/dialog/close.vue";
import DialogContent from "./ui/dialog/content.vue";
import DialogDescription from "./ui/dialog/description.vue";
import DialogOverlay from "./ui/dialog/overlay.vue";
import DialogTitle from "./ui/dialog/title.vue";

const props = withDefaults(
  defineProps<{
    shots: ScreenshotShot[];
    startIndex?: number;
  }>(),
  { startIndex: 0 },
);

const open = defineModel<boolean>("open", { default: false });
const scroller = ref<HTMLElement | null>(null);

watch(
  () => props.shots.length,
  (n) => {
    if (n === 0) open.value = false;
  },
);

watch(open, async (isOpen) => {
  if (!isOpen) return;
  await nextTick();
  const i = Math.min(Math.max(0, props.startIndex), Math.max(0, props.shots.length - 1));
  const target = scroller.value?.querySelector<HTMLElement>(`[data-shot-index="${i}"]`);
  if (typeof target?.scrollIntoView === "function") {
    target.scrollIntoView({ block: "nearest" });
  }
});
</script>

<template>
  <Dialog :open="open" @update:open="(v) => (open = v)">
    <DialogOverlay class="shot-viewer-overlay" />
    <DialogContent class="shot-viewer" aria-describedby="shot-viewer-desc">
      <div class="shot-viewer-head">
        <div class="shot-viewer-head-text">
          <DialogTitle>Screenshots</DialogTitle>
          <DialogDescription id="shot-viewer-desc" class="shot-viewer-desc">
            {{
              shots.length === 1
                ? "1 image."
                : `${shots.length} images in order. Scroll to see each one.`
            }}
            Wider images scale down to fit the viewer; smaller ones stay at their natural size.
            Press Escape or click outside to close.
          </DialogDescription>
        </div>
        <DialogClose
          class="close-x shot-viewer-close"
          aria-label="Close screenshot viewer"
          @click="open = false"
        >
          <X class="size-4" aria-hidden="true" />
        </DialogClose>
      </div>
      <div ref="scroller" class="shot-viewer-scroll">
        <figure
          v-for="(shot, i) in shots"
          :key="shot.src + i"
          class="shot-viewer-print"
          :data-shot-index="i"
        >
          <!-- #0819: each shot's own header carries the handoff verdict (a green
               check / red cross) and that shot's warning, so the viewer is not a
               bare image with no context. Absent for pending attachments. -->
          <div
            v-if="shot.verdict"
            class="shot-viewer-shot-head"
            :class="{ 'is-check': shot.verdict === 'check' }"
          >
            <span class="shot-row-verdict mono" :data-verdict="shot.verdict">
              {{ shot.verdict === "matches" ? "✓" : "✕" }}
            </span>
            <span class="shot-viewer-verdict">
              {{ shot.warning || (shot.verdict === "matches" ? "matches" : "needs a check") }}
            </span>
          </div>
          <img :src="shot.src" :alt="shot.name" />
          <figcaption class="shot-viewer-caption">{{ shot.name }}</figcaption>
        </figure>
      </div>
    </DialogContent>
  </Dialog>
</template>
