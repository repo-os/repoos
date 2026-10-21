<script setup lang="ts">
/**
 * The one screenshot-upload dropzone (#0877).
 *
 * The file picker is opened by the browser's native activation of a real
 * `<input type="file">`, never by a JS `input.click()`. In an installed PWA
 * (Safari "Add to Dock", Chrome standalone) a synthetic click on a visually
 * hidden input is the path that silently does nothing, while the upload
 * controls that already worked (Settings import/export, the bug-report upload)
 * hand the click to the input natively (#0642, #0877).
 *
 * So the input itself is the control: it covers the whole zone at
 * `opacity: 0` and is the tab stop, which makes Enter/Space native too. The
 * surrounding `<label>` keeps the zone's semantics and label activation as a
 * fallback. The input stays rendered — `display: none` also blocks the picker in
 * WKWebView (#0642). Drop handling stays with the host panel, whose
 * `dragenter`/`drop` listeners already cover this zone.
 */
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

function onChange(event: Event): void {
  const el = event.target as HTMLInputElement;
  const files = Array.from(el.files ?? []);
  // Reset so re-picking the same file still fires `change`.
  el.value = "";
  if (files.length) emit("files", files);
}
</script>

<template>
  <label class="shot-dropzone" :class="{ over }">
    <ImagePlus class="size-4" aria-hidden="true" />
    <span><slot /></span>
    <input
      type="file"
      class="shot-input"
      :accept="accept"
      :multiple="multiple"
      @change="onChange"
      @click.stop
    />
  </label>
</template>
