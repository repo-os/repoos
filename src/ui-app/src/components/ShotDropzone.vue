<script setup lang="ts">
/**
 * The one screenshot-upload dropzone (#0877).
 *
 * The file input is opened by the browser's native `<label>` activation, not by
 * a JS `input.click()`. In an installed PWA (Safari "Add to Dock", Chrome
 * standalone) a synthetic click on a visually hidden input is the path that
 * silently does nothing, while the upload controls that already worked
 * (Settings import/export, the bug-report upload) are plain labels (#0642,
 * #0877). Keeping the input inside the label means a click anywhere in the
 * zone — or a keyboard activation forwarded below — reaches the picker without
 * a programmatic gesture.
 *
 * The input stays rendered (1x1, `opacity: 0`): `display: none` also blocks the
 * picker in WKWebView (#0642). Drop handling stays with the host panel, whose
 * `dragenter`/`drop` listeners already cover this zone; this component owns the
 * picker trigger only.
 */
import { ref } from "vue";
import { ImagePlus } from "lucide-vue-next";
import { SCREENSHOT_ACCEPT } from "../lib/screenshot-viewer";

defineOptions({ name: "ShotDropzone" });

withDefaults(
  defineProps<{
    /** Paint the drop-target highlight while a drag is over the host panel. */
    over?: boolean;
    /** Accepted file types; screenshots by default. */
    accept?: string;
    multiple?: boolean;
  }>(),
  {
    over: false,
    accept: SCREENSHOT_ACCEPT,
    multiple: true,
  },
);

const emit = defineEmits<{ files: [File[]] }>();

const input = ref<HTMLInputElement | null>(null);

/** Keyboard activation (Enter/Space). A click on the label is native. */
function openPicker(): void {
  input.value?.click();
}

function onChange(event: Event): void {
  const el = event.target as HTMLInputElement;
  const files = Array.from(el.files ?? []);
  // Reset so re-picking the same file still fires `change`.
  el.value = "";
  if (files.length) emit("files", files);
}
</script>

<template>
  <label
    class="shot-dropzone"
    :class="{ over }"
    role="button"
    tabindex="0"
    @keydown.enter.prevent="openPicker"
    @keydown.space.prevent="openPicker"
  >
    <ImagePlus class="size-4" />
    <span><slot /></span>
    <input
      ref="input"
      type="file"
      class="shot-input"
      :accept="accept"
      :multiple="multiple"
      tabindex="-1"
      @change="onChange"
      @click.stop
    />
  </label>
</template>
