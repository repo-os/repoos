<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch, watchEffect } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useRepoStore } from "../stores/repo";
import { ArrowLeft, ChevronLeft, ChevronRight } from "lucide-vue-next";
import { api } from "../api";

const route = useRoute();
const router = useRouter();
const repo = useRepoStore();

const taskId = computed(() => route.params.taskId as string);
const targetFile = computed(() => (route.query.file as string) ?? "");

onMounted(async () => {
  if (!repo.diffFor(taskId.value)) {
    await repo.loadDiff(taskId.value);
  }
});

const taskDiff = computed(() => repo.diffFor(taskId.value));

interface DiffFile {
  filename: string;
  lines: string[];
  added: number;
  removed: number;
  type: "added" | "deleted" | "modified";
}

const diffFiles = computed<DiffFile[]>(() => {
  if (!taskDiff.value?.patch) return [];
  const sections = taskDiff.value.patch.split(/^diff --git /m);
  const files: DiffFile[] = [];
  for (const section of sections) {
    if (!section.trim()) continue;
    const lines = section.split("\n");
    const diffLines = ["diff --git " + lines[0], ...lines.slice(1)];
    const plusLine = diffLines.find((l) => l.startsWith("+++ "));
    const minusLine = diffLines.find((l) => l.startsWith("--- "));
    const isAdd = diffLines.some((l) => l.startsWith("--- /dev/null"));
    const isDel = diffLines.some((l) => l.startsWith("+++ /dev/null"));
    const plusName = plusLine ? plusLine.slice(6) : "";
    const minusName = minusLine ? minusLine.slice(6) : "";
    const filename = isDel ? minusName : plusName;
    if (!filename || filename === "/dev/null") continue;
    let added = 0;
    let removed = 0;
    for (const l of diffLines) {
      if (l.startsWith("+") && !l.startsWith("+++ ")) added++;
      else if (l.startsWith("-") && !l.startsWith("--- ")) removed++;
    }
    files.push({
      filename,
      lines: diffLines,
      added,
      removed,
      type: isAdd ? "added" : isDel ? "deleted" : "modified",
    });
  }
  return files;
});

const currentFile = computed(
  () => diffFiles.value.find((f) => f.filename === targetFile.value) ?? diffFiles.value[0] ?? null,
);

interface DiffRow {
  leftNum: number | null;
  rightNum: number | null;
  leftText: string | null;
  rightText: string | null;
  leftCls: "ctx" | "rem" | "empty";
  rightCls: "ctx" | "add" | "empty";
  isSep: boolean;
  skipped?: number;
}

function buildPatchRows(file: DiffFile | null): DiffRow[] {
  if (!file) return [];
  const hunkRe = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/;
  const lines = file.lines;
  const rows: DiffRow[] = [];
  let i = 0;
  while (i < lines.length && !lines[i]!.startsWith("@@")) i++;
  let first = true;
  let prevLeftEnd = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    const m = line.match(hunkRe);
    if (!m) {
      i++;
      continue;
    }
    const leftStart = parseInt(m[1]!, 10);
    const rightStart = parseInt(m[2]!, 10);
    if (!first) {
      const skipped = leftStart - prevLeftEnd - 1;
      rows.push({
        leftNum: null,
        rightNum: null,
        leftText: null,
        rightText: null,
        leftCls: "empty",
        rightCls: "empty",
        isSep: true,
        skipped: skipped > 0 ? skipped : undefined,
      });
    }
    first = false;
    i++;
    let leftNum = leftStart;
    let rightNum = rightStart;
    const hunk: string[] = [];
    while (i < lines.length && !lines[i]!.startsWith("@@")) {
      hunk.push(lines[i]!);
      i++;
    }
    let j = 0;
    while (j < hunk.length) {
      const hl = hunk[j]!;
      if (hl === "\\ No newline at end of file") {
        j++;
        continue;
      }
      if (hl.startsWith("-")) {
        const removed: string[] = [];
        const added: string[] = [];
        while (j < hunk.length && hunk[j]!.startsWith("-")) {
          removed.push(hunk[j]!.slice(1));
          j++;
        }
        while (j < hunk.length && hunk[j]!.startsWith("+")) {
          added.push(hunk[j]!.slice(1));
          j++;
        }
        const count = Math.max(removed.length, added.length);
        for (let k = 0; k < count; k++) {
          const l = removed[k];
          const r = added[k];
          rows.push({
            leftNum: l !== undefined ? leftNum++ : null,
            rightNum: r !== undefined ? rightNum++ : null,
            leftText: l ?? null,
            rightText: r ?? null,
            leftCls: l !== undefined ? "rem" : "empty",
            rightCls: r !== undefined ? "add" : "empty",
            isSep: false,
          });
        }
      } else if (hl.startsWith("+")) {
        rows.push({
          leftNum: null,
          rightNum: rightNum++,
          leftText: null,
          rightText: hl.slice(1),
          leftCls: "empty",
          rightCls: "add",
          isSep: false,
        });
        j++;
      } else {
        const text = hl.startsWith(" ") ? hl.slice(1) : hl;
        rows.push({
          leftNum: leftNum++,
          rightNum: rightNum++,
          leftText: text,
          rightText: text,
          leftCls: "ctx",
          rightCls: "ctx",
          isSep: false,
        });
        j++;
      }
    }
    prevLeftEnd = leftNum - 1;
  }
  return rows;
}

interface FileContents {
  before: string;
  after: string;
}

const fileContents = ref<FileContents | null>(null);
const fileContentsLoading = ref(false);
const fileContentsError = ref<string | null>(null);

function linesOf(content: string): string[] {
  if (!content) return [];
  const lines = content.split(/\r?\n/);
  if (lines.at(-1) === "") lines.pop();
  return lines;
}

function addContextRows(
  rows: DiffRow[],
  before: string[],
  after: string[],
  leftStart: number,
  rightStart: number,
  leftCount: number,
  rightCount: number,
): void {
  for (let i = 0; i < Math.max(leftCount, rightCount); i++) {
    const leftNum = leftStart + i;
    const rightNum = rightStart + i;
    const leftText = i < leftCount ? before[leftNum - 1] : undefined;
    const rightText = i < rightCount ? after[rightNum - 1] : undefined;
    rows.push({
      leftNum: leftText !== undefined ? leftNum : null,
      rightNum: rightText !== undefined ? rightNum : null,
      leftText: leftText ?? null,
      rightText: rightText ?? null,
      leftCls: leftText !== undefined ? "ctx" : "empty",
      rightCls: rightText !== undefined ? "ctx" : "empty",
      isSep: false,
    });
  }
}

function buildFullRows(file: DiffFile, contents: FileContents): DiffRow[] {
  const before = linesOf(contents.before);
  const after = linesOf(contents.after);
  const hunkRe = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/;
  const rows: DiffRow[] = [];
  const lines = file.lines;
  let i = 0;
  while (i < lines.length && !lines[i]!.startsWith("@@")) i++;
  let prevLeftEnd = 0;
  let prevRightEnd = 0;

  while (i < lines.length) {
    const match = lines[i]!.match(hunkRe);
    if (!match) {
      i++;
      continue;
    }
    const leftStart = Number(match[1]);
    const rightStart = Number(match[2]);
    const leftGap = Math.max(0, leftStart - prevLeftEnd - 1);
    const rightGap = Math.max(0, rightStart - prevRightEnd - 1);
    addContextRows(rows, before, after, prevLeftEnd + 1, prevRightEnd + 1, leftGap, rightGap);

    i++;
    let leftNum = leftStart;
    let rightNum = rightStart;
    const hunk: string[] = [];
    while (i < lines.length && !lines[i]!.startsWith("@@")) hunk.push(lines[i++]!);
    let j = 0;
    while (j < hunk.length) {
      const line = hunk[j]!;
      if (line === "\\ No newline at end of file") {
        j++;
        continue;
      }
      if (line.startsWith("-")) {
        const removed: string[] = [];
        const added: string[] = [];
        while (j < hunk.length && hunk[j]!.startsWith("-")) removed.push(hunk[j++]!.slice(1));
        while (j < hunk.length && hunk[j]!.startsWith("+")) added.push(hunk[j++]!.slice(1));
        const count = Math.max(removed.length, added.length);
        for (let k = 0; k < count; k++) {
          const leftText = removed[k];
          const rightText = added[k];
          rows.push({
            leftNum: leftText !== undefined ? leftNum++ : null,
            rightNum: rightText !== undefined ? rightNum++ : null,
            leftText: leftText ?? null,
            rightText: rightText ?? null,
            leftCls: leftText !== undefined ? "rem" : "empty",
            rightCls: rightText !== undefined ? "add" : "empty",
            isSep: false,
          });
        }
      } else if (line.startsWith("+")) {
        rows.push({
          leftNum: null,
          rightNum: rightNum++,
          leftText: null,
          rightText: line.slice(1),
          leftCls: "empty",
          rightCls: "add",
          isSep: false,
        });
        j++;
      } else {
        const text = line.startsWith(" ") ? line.slice(1) : line;
        rows.push({
          leftNum: leftNum++,
          rightNum: rightNum++,
          leftText: before[leftNum - 2] ?? text,
          rightText: after[rightNum - 2] ?? text,
          leftCls: "ctx",
          rightCls: "ctx",
          isSep: false,
        });
        j++;
      }
    }
    prevLeftEnd = leftNum - 1;
    prevRightEnd = rightNum - 1;
  }

  addContextRows(
    rows,
    before,
    after,
    prevLeftEnd + 1,
    prevRightEnd + 1,
    before.length - prevLeftEnd,
    after.length - prevRightEnd,
  );
  return rows;
}

watch(
  () => [taskId.value, currentFile.value?.filename] as const,
  async ([id, filename]) => {
    fileContents.value = null;
    fileContentsError.value = null;
    if (!filename) return;
    fileContentsLoading.value = true;
    try {
      const path = encodeURIComponent(filename);
      const [before, after] = await Promise.all([
        api<{ content: string }>(`/api/tasks/${id}/file?path=${path}&version=before`),
        api<{ content: string }>(`/api/tasks/${id}/file?path=${path}&version=after`),
      ]);
      fileContents.value = { before: before.content, after: after.content };
    } catch (err) {
      fileContentsError.value = err instanceof Error ? err.message : String(err);
    } finally {
      fileContentsLoading.value = false;
    }
  },
  { immediate: true },
);

const rows = computed(() =>
  currentFile.value && fileContents.value
    ? buildFullRows(currentFile.value, fileContents.value)
    : buildPatchRows(currentFile.value),
);

// Two independent scroll panels, synced vertically via JS.
const leftEl = ref<HTMLElement | null>(null);
const rightEl = ref<HTMLElement | null>(null);
const canvasEl = ref<HTMLCanvasElement | null>(null);
let syncing = false;

function onLeftScroll(): void {
  if (!syncing && rightEl.value && leftEl.value) {
    syncing = true;
    rightEl.value.scrollTop = leftEl.value.scrollTop;
    syncing = false;
  }
  drawMinimap();
}

function onRightScroll(): void {
  if (!syncing && leftEl.value && rightEl.value) {
    syncing = true;
    leftEl.value.scrollTop = rightEl.value.scrollTop;
    syncing = false;
  }
  drawMinimap();
}

function drawMinimap(): void {
  const canvas = canvasEl.value;
  if (!canvas) return;
  const natural = canvas.clientHeight;
  if (natural > 0) canvas.height = natural;
  const W = canvas.width;
  const H = canvas.height;
  const ctx = canvas.getContext("2d");
  if (!ctx || !H) return;
  ctx.clearRect(0, 0, W, H);
  const r = rows.value;
  if (!r.length) return;
  const rowH = H / r.length;
  for (let idx = 0; idx < r.length; idx++) {
    const row = r[idx]!;
    const y = idx * rowH;
    const h = Math.max(rowH, 1);
    if (row.leftCls === "rem") {
      ctx.fillStyle = "rgba(255,80,80,0.55)";
      ctx.fillRect(0, y, W / 2, h);
    }
    if (row.rightCls === "add") {
      ctx.fillStyle = "rgba(80,210,100,0.55)";
      ctx.fillRect(W / 2, y, W / 2, h);
    }
  }
  const el = leftEl.value;
  if (el && el.scrollHeight > el.clientHeight) {
    const scrollFrac = el.scrollTop / (el.scrollHeight - el.clientHeight);
    const viewFrac = el.clientHeight / el.scrollHeight;
    const vy = scrollFrac * H;
    const vh = Math.max(viewFrac * H, 8);
    ctx.fillStyle = "rgba(255,255,255,0.07)";
    ctx.fillRect(0, vy, W, vh);
    ctx.strokeStyle = "rgba(255,255,255,0.18)";
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, vy + 0.5, W - 1, Math.max(vh - 1, 1));
  }
}

function onMinimapClick(e: MouseEvent): void {
  const canvas = canvasEl.value;
  if (!canvas) return;
  const frac = e.offsetY / canvas.height;
  const el = leftEl.value;
  if (el) el.scrollTop = frac * (el.scrollHeight - el.clientHeight);
  const er = rightEl.value;
  if (er) er.scrollTop = el ? el.scrollTop : 0;
  drawMinimap();
}

watchEffect(() => {
  void rows.value;
  nextTick(() => drawMinimap());
});

function goBack(): void {
  router.back();
}

function switchFile(filename: string): void {
  router.replace({ name: "diff", params: { taskId: taskId.value }, query: { file: filename } });
}

function basename(path: string): string {
  return path.split("/").pop() ?? path;
}

const currentIndex = computed(() =>
  diffFiles.value.findIndex((f) => f.filename === currentFile.value?.filename),
);

function prevFile(): void {
  const i = currentIndex.value;
  if (i > 0) switchFile(diffFiles.value[i - 1]!.filename);
}

function nextFile(): void {
  const i = currentIndex.value;
  if (i < diffFiles.value.length - 1) switchFile(diffFiles.value[i + 1]!.filename);
}
</script>

<template>
  <div class="diff-page">
    <div class="diff-page-topbar">
      <button class="diff-back-btn" type="button" @click="goBack">
        <ArrowLeft class="size-4" />
        <span>Back</span>
      </button>
      <div class="diff-page-file">{{ currentFile?.filename ?? "" }}</div>
      <div v-if="currentFile" class="diff-file-delta">
        <span v-if="currentFile.added > 0" class="diff-file-add">+{{ currentFile.added }}</span>
        <span v-if="currentFile.removed > 0" class="diff-file-rem">−{{ currentFile.removed }}</span>
      </div>
      <span v-if="fileContentsLoading" class="diff-file-status">Loading full file…</span>
      <span v-else-if="fileContentsError" class="diff-file-status diff-file-status-error">{{
        fileContentsError
      }}</span>
    </div>

    <div v-if="diffFiles.length > 1" class="diff-page-filetabs">
      <button
        class="diff-tab-arrow"
        type="button"
        :disabled="currentIndex <= 0"
        title="Previous file"
        @click="prevFile"
      >
        <ChevronLeft class="size-4" />
      </button>
      <button
        class="diff-tab-arrow"
        type="button"
        :disabled="currentIndex >= diffFiles.length - 1"
        title="Next file"
        @click="nextFile"
      >
        <ChevronRight class="size-4" />
      </button>
      <div class="diff-tab-divider"></div>
      <button
        v-for="f in diffFiles"
        :key="f.filename"
        type="button"
        class="diff-page-filetab"
        :class="{ active: f.filename === currentFile?.filename }"
        :title="f.filename"
        @click="switchFile(f.filename)"
      >
        <span class="diff-file-type-badge" :class="f.type">{{
          f.type === "added" ? "+" : f.type === "deleted" ? "−" : "~"
        }}</span>
        {{ basename(f.filename) }}
      </button>
    </div>

    <div class="diff-page-body">
      <div v-if="!taskDiff" class="diff-page-loading">Loading diff…</div>
      <div v-else-if="!currentFile" class="diff-page-loading">No diff available.</div>
      <template v-else>
        <!-- Left panel: before -->
        <div ref="leftEl" class="diff-panel" @scroll.passive="onLeftScroll">
          <div class="diff-panel-header">Before</div>
          <template v-for="(row, i) in rows" :key="'l' + i">
            <div v-if="row.isSep" class="diff-sep-row">
              <span class="diff-ln"></span>
              <span class="diff-sep-cell">{{
                row.skipped != null ? `… ${row.skipped} lines` : "…"
              }}</span>
            </div>
            <div v-else class="diff-row" :class="'diff-row-' + row.leftCls">
              <span class="diff-ln" :class="'diff-ln-' + row.leftCls">{{ row.leftNum ?? "" }}</span>
              <span class="diff-cell" :class="'diff-cell-' + row.leftCls">{{
                row.leftText ?? ""
              }}</span>
            </div>
          </template>
        </div>

        <div class="diff-panel-divider"></div>

        <!-- Right panel: after -->
        <div ref="rightEl" class="diff-panel" @scroll.passive="onRightScroll">
          <div class="diff-panel-header">After</div>
          <template v-for="(row, i) in rows" :key="'r' + i">
            <div v-if="row.isSep" class="diff-sep-row">
              <span class="diff-ln"></span>
              <span class="diff-sep-cell">{{
                row.skipped != null ? `… ${row.skipped} lines` : "…"
              }}</span>
            </div>
            <div v-else class="diff-row" :class="'diff-row-' + row.rightCls">
              <span class="diff-ln" :class="'diff-ln-' + row.rightCls">{{
                row.rightNum ?? ""
              }}</span>
              <span class="diff-cell" :class="'diff-cell-' + row.rightCls">{{
                row.rightText ?? ""
              }}</span>
            </div>
          </template>
        </div>

        <canvas ref="canvasEl" class="diff-minimap" width="60" @click="onMinimapClick"></canvas>
      </template>
    </div>
  </div>
</template>

<style scoped>
.diff-page {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: #0d1117;
  color: #c9d1d9;
  font-family: var(--font-sans);
}

.diff-page-topbar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 16px;
  height: 48px;
  flex: none;
  border-bottom: 1px solid var(--border);
  background: var(--panel-solid);
}

.diff-back-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 10px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: transparent;
  color: var(--txt-dim);
  font: 13px/1 var(--font-sans);
  cursor: pointer;
  transition: 0.15s;
  flex: none;
}
.diff-back-btn:hover {
  background: var(--nav-hover-bg);
  color: var(--txt);
}

.diff-page-file {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font: 600 13px/1 var(--font-sans);
  color: var(--txt);
}

.diff-page-filetabs {
  display: flex;
  gap: 2px;
  padding: 6px 12px;
  flex: none;
  border-bottom: 1px solid var(--border);
  background: var(--panel-solid);
  overflow-x: auto;
}

.diff-tab-arrow {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: 28px;
  height: 28px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: transparent;
  color: var(--txt-dim);
  cursor: pointer;
  transition: 0.12s;
}
.diff-tab-arrow:hover:not(:disabled) {
  background: var(--nav-hover-bg);
  color: var(--txt);
}
.diff-tab-arrow:disabled {
  opacity: 0.3;
  cursor: default;
}

.diff-tab-divider {
  flex: none;
  width: 1px;
  height: 20px;
  background: var(--border);
  margin: 0 4px;
}

.diff-page-filetab {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border: 1px solid transparent;
  border-radius: 6px;
  background: transparent;
  color: var(--txt-dim);
  font: 12px/1.4 var(--font-mono, monospace);
  cursor: pointer;
  white-space: nowrap;
  transition: 0.12s;
}
.diff-page-filetab:hover {
  background: var(--nav-hover-bg);
  color: var(--txt);
}
.diff-page-filetab.active {
  background: var(--nav-hover-bg);
  border-color: var(--border);
  color: var(--txt);
}

.diff-file-type-badge {
  font: 11px/1 monospace;
  opacity: 0.7;
}

.diff-page-body {
  flex: 1;
  min-height: 0;
  display: flex;
  overflow: hidden;
}

.diff-page-loading {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--txt-faint);
  font: 13px/1 var(--font-sans);
}

/* Each panel is exactly 50% of the available width and scrolls independently */
.diff-panel {
  flex: 1 1 0;
  min-width: 0;
  overflow: auto;
  font-family: "SF Mono", "Fira Code", "Fira Mono", Menlo, monospace;
  font-size: 12px;
  line-height: 1.6;
  background: #0d1117;
  color: #c9d1d9;
  display: flex;
  flex-direction: column;
}

.diff-panel-divider {
  flex: none;
  width: 1px;
  background: var(--border);
}

.diff-minimap {
  flex: none;
  width: 60px;
  height: 100%;
  display: block;
  background: #070b12;
  border-left: 1px solid var(--border);
  cursor: pointer;
}

.diff-panel-header {
  position: sticky;
  top: 0;
  left: 0;
  z-index: 1;
  flex: none;
  padding: 6px 12px;
  border-bottom: 1px solid var(--border);
  background: #0d1117;
  color: var(--txt-faint);
  font: 600 10px/1 var(--font-sans);
  letter-spacing: 0.1em;
  text-transform: uppercase;
  white-space: nowrap;
}

.diff-row {
  display: flex;
  min-width: max-content;
}

.diff-sep-row {
  display: flex;
  min-width: max-content;
  border-top: 1px solid rgba(255, 255, 255, 0.05);
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  background: rgba(255, 255, 255, 0.015);
}

.diff-ln {
  flex: none;
  width: 44px;
  text-align: right;
  padding: 0 6px;
  color: rgba(140, 160, 180, 0.4);
  user-select: none;
  white-space: pre;
  font-size: 11px;
  min-height: 1.6em;
}

.diff-cell {
  flex: 1;
  padding: 0 12px;
  white-space: pre;
  min-height: 1.6em;
}

.diff-sep-cell {
  flex: 1;
  padding: 1px 12px;
  color: rgba(140, 160, 180, 0.35);
  font-size: 11px;
}

/* Row backgrounds */
.diff-row-rem {
  background: rgba(255, 80, 80, 0.06);
}
.diff-row-add {
  background: rgba(70, 210, 100, 0.06);
}
.diff-row-empty {
  background: rgba(120, 140, 200, 0.03);
}

/* Line number column colours */
.diff-ln-rem {
  background: rgba(255, 80, 80, 0.12);
  color: rgba(255, 120, 120, 0.65);
}
.diff-ln-add {
  background: rgba(70, 210, 100, 0.1);
  color: rgba(100, 210, 100, 0.65);
}
.diff-ln-empty {
  background: rgba(120, 140, 200, 0.03);
}

/* Cell text colours */
.diff-cell-ctx {
  color: #c9d1d9;
}
.diff-cell-rem {
  color: #ff9090;
}
.diff-cell-add {
  color: #7ee8a2;
}
.diff-cell-empty {
}

.diff-file-delta {
  display: flex;
  gap: 6px;
  flex: none;
}
.diff-file-status {
  flex: none;
  color: var(--txt-faint);
  font: 11px/1 var(--font-sans);
}
.diff-file-status-error {
  max-width: 320px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #ff8b8b;
}
.diff-file-add {
  color: #3fb950;
  font: 600 12px/1 var(--font-sans);
}
.diff-file-rem {
  color: #f85149;
  font: 600 12px/1 var(--font-sans);
}
</style>
