<script setup lang="ts">
import { computed, reactive, watch } from "vue";
import { ChevronsDownUp, Expand } from "lucide-vue-next";
import { diffLineClass, parseDiffFiles, type DiffFile } from "../lib/diff-files";

/**
 * The Changes tab's file list + expandable per-file diffs, shared with the Debug
 * tab's Merge conflict view so both read identically. Pass `expandable` to show
 * the full-screen button (`expand` fires with the file).
 */
const props = defineProps<{
  patch: string;
  truncated?: boolean;
  expandable?: boolean;
  /** Distinguishes section anchors when more than one viewer exists on a page. */
  idPrefix?: string;
}>();
const emit = defineEmits<{ (e: "expand", file: DiffFile): void }>();

const diffFiles = computed(() => parseDiffFiles(props.patch));

/** File ids currently collapsed (all expanded by default). */
const collapsedFiles = reactive(new Set<string>());
function toggleFileCollapse(fileId: string): void {
  if (collapsedFiles.has(fileId)) collapsedFiles.delete(fileId);
  else collapsedFiles.add(fileId);
}
function sectionId(filename: string): string {
  return `${props.idPrefix ?? ""}${filename}`;
}
function scrollToDiffFile(fileId: string): void {
  const el = document.getElementById(sectionId(fileId));
  if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
}
watch(
  () => props.patch,
  () => collapsedFiles.clear(),
);
</script>

<template>
  <div v-if="diffFiles.length > 0" class="diff-file-list">
    <div
      v-for="file in diffFiles"
      :key="file.filename"
      class="diff-file-item"
      role="button"
      tabindex="0"
      @click="scrollToDiffFile(file.filename)"
      @keydown.enter="scrollToDiffFile(file.filename)"
    >
      <span class="diff-file-badge" :class="`diff-file-badge-${file.type}`">{{
        file.type === "added" ? "A" : file.type === "deleted" ? "D" : "M"
      }}</span>
      <span class="diff-file-name" :title="file.filename">{{ file.filename }}</span>
      <span class="diff-file-delta">
        <span v-if="file.added > 0" class="diff-file-add">+{{ file.added }}</span>
        <span v-if="file.removed > 0" class="diff-file-rem">−{{ file.removed }}</span>
      </span>
      <button
        v-if="expandable"
        type="button"
        class="diff-file-expand"
        :aria-label="`Expand diff for ${file.filename}`"
        title="Open full-screen diff"
        @click.stop="emit('expand', file)"
      >
        <Expand class="size-3.5" />
      </button>
    </div>
    <button
      v-if="diffFiles.length > 8"
      type="button"
      class="diff-file-collapse-all"
      @click="
        collapsedFiles.size === diffFiles.length
          ? collapsedFiles.clear()
          : diffFiles.forEach((f) => collapsedFiles.add(f.filename))
      "
    >
      <ChevronsDownUp class="size-3" />
      {{ collapsedFiles.size === diffFiles.length ? "Expand all" : "Collapse all" }}
    </button>
  </div>
  <div v-if="truncated" class="diff-truncated">
    Diff output was truncated — showing the first ~250 kB.
  </div>
  <div class="diff-sections">
    <div
      v-for="file in diffFiles"
      :key="file.filename"
      :id="sectionId(file.filename)"
      class="diff-section"
    >
      <div
        class="diff-section-header"
        role="button"
        tabindex="0"
        @click="toggleFileCollapse(file.filename)"
        @keydown.enter="toggleFileCollapse(file.filename)"
      >
        <svg
          class="diff-section-chevron"
          :class="{ collapsed: collapsedFiles.has(file.filename) }"
          viewBox="0 0 24 24"
          fill="none"
        >
          <path
            d="m6 9 6 6 6-6"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
        <span class="diff-file-badge" :class="`diff-file-badge-${file.type}`">{{
          file.type === "added" ? "A" : file.type === "deleted" ? "D" : "M"
        }}</span>
        <span class="diff-section-name">{{ file.filename }}</span>
        <span class="diff-file-delta">
          <span v-if="file.added > 0" class="diff-file-add">+{{ file.added }}</span>
          <span v-if="file.removed > 0" class="diff-file-rem">−{{ file.removed }}</span>
        </span>
        <button
          v-if="expandable"
          type="button"
          class="diff-file-expand diff-file-expand-inline"
          :aria-label="`Expand diff for ${file.filename}`"
          title="Open full-screen diff"
          @click.stop="emit('expand', file)"
        >
          <Expand class="size-3.5" />
        </button>
      </div>
      <pre
        v-if="!collapsedFiles.has(file.filename)"
        class="diff-section-content"
      ><code><template v-for="(line, i) in file.lines" :key="i"><span :class="diffLineClass(line)">{{ line }}</span>
</template></code></pre>
    </div>
  </div>
</template>

<style scoped>
.diff-truncated {
  padding: 8px 12px;
  margin-bottom: 8px;
  background: var(--amber-tint);
  border: 1px solid var(--amber-border-tint);
  border-radius: 6px;
  color: var(--amber);
  font-size: 12px;
  font-weight: 500;
}

.diff-header {
  /* hardcode-ok: theme-independent accent/status text color, verified by the rendered audit (#0596 triage) */
  color: #8b949e;
}

.diff-hunk {
  /* hardcode-ok: theme-independent accent/status text color, verified by the rendered audit (#0596 triage) */
  color: #79c0ff;
}

.diff-add {
  /* hardcode-ok: theme-independent accent/status text color, verified by the rendered audit (#0596 triage) */
  color: #7ee787;
}

.diff-rem {
  /* hardcode-ok: theme-independent accent/status text color, verified by the rendered audit (#0596 triage) */
  color: #ff7b72;
}

.diff-ctx {
  /* hardcode-ok: theme-independent accent/status text color, verified by the rendered audit (#0596 triage) */
  color: #c9d1d9;
}

/* File list */
.diff-file-list {
  display: flex;
  flex-direction: column;
  max-height: 224px;
  overflow-y: auto;
  margin-bottom: 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--panel);
}

.diff-file-item {
  display: flex;
  align-items: center;
  gap: 7px;
  width: 100%;
  padding: 4px 10px;
  border: none;
  border-bottom: 1px solid var(--border);
  background: transparent;
  color: var(--txt);
  cursor: pointer;
  font: 11.5px/1.5 var(--font-mono);
  text-align: left;
}

.diff-file-item:last-child {
  border-bottom: none;
}

.diff-file-item:hover {
  /* hardcode-ok: translucent surface tint layered over theme surfaces (#0596 triage: hover/decoration, no text sits on it) */
  background: rgba(255, 255, 255, 0.04);
}

.diff-file-expand {
  margin-left: 4px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  flex: none;
  border: 1px solid var(--border);
  border-radius: 6px;
  /* hardcode-ok: translucent surface tint layered over theme surfaces (#0596 triage: hover/decoration, no text sits on it) */
  background: rgba(255, 255, 255, 0.02);
  color: var(--txt-dim);
  cursor: pointer;
  transition:
    border-color 0.15s ease,
    color 0.15s ease,
    background 0.15s ease;
}

.diff-file-expand:hover,
.diff-file-expand:focus-visible {
  border-color: var(--border-bright);
  color: var(--txt);
  background: rgba(57, 224, 255, 0.08);
  outline: none;
}

.diff-file-expand-inline {
  margin-left: 0;
}

.diff-file-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 15px;
  height: 15px;
  flex: none;
  border-radius: 3px;
  font: 600 9px/1 var(--font-mono);
  font-weight: 700;
}

.diff-file-badge-modified {
  background: var(--amber-tint);
  color: var(--amber);
}

.diff-file-badge-added {
  background: var(--green-tint);
  color: var(--green);
}

.diff-file-badge-deleted {
  background: var(--red-tint);
  color: var(--red);
}

.diff-file-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--txt);
}

.diff-file-delta {
  display: flex;
  gap: 4px;
  flex: none;
  font: 600 10px/1 var(--font-mono);
}

.diff-file-add {
  color: var(--green);
}

.diff-file-rem {
  color: var(--red);
}

.diff-file-collapse-all {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 3px 10px;
  border: none;
  border-top: 1px solid var(--border);
  background: transparent;
  color: var(--txt-faint);
  cursor: pointer;
  font: 10px/1 var(--font-sans);
}

.diff-file-collapse-all:hover {
  color: var(--txt);
}

.diff-sections {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.diff-section-header {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 7px 12px;
  cursor: pointer;
  background: var(--panel-solid);
  border: 1px solid var(--border);
  border-radius: 8px;
  user-select: none;
}

.diff-section-header:hover {
  background: color-mix(in srgb, var(--txt) 6%, var(--panel-solid));
}

.diff-section-chevron {
  width: 13px;
  height: 13px;
  flex: none;
  color: var(--txt-faint);
  transition: transform 0.15s ease;
  transform: rotate(0deg);
}

.diff-section-chevron.collapsed {
  transform: rotate(-90deg);
}

.diff-section-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font: 12px/1.4 var(--font-mono);
  color: var(--txt);
}

.diff-section-content {
  padding: 12px;
  /* hardcode-ok: translucent surface tint layered over theme surfaces (#0596 triage: hover/decoration, no text sits on it) */
  background: #0d1117;
  border: 1px solid var(--border);
  border-top: none;
  border-radius: 0 0 8px 8px;
  overflow-x: auto;
  font-family: "SF Mono", "Fira Code", "Fira Mono", Menlo, monospace;
  font-size: 12px;
  line-height: 1.6;
  white-space: pre;
  color: #c9d1d9;
  max-height: 70vh;
  overflow-y: auto;
}
</style>
