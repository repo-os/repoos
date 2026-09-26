<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { api, ApiError } from "../api";
import { relTime } from "../lib/time";
import {
  authorInitials,
  groupCommitsByDay,
  splitTaskSubject,
  type HistoryCommit,
} from "../lib/repo-history";
import { useRepoStore } from "../stores/repo";
import { useUiStore } from "../stores/ui";
import Button from "./ui/button.vue";
import Input from "./ui/input.vue";
import Select from "./ui/select/root.vue";
import SelectContent from "./ui/select/content.vue";
import SelectItem from "./ui/select/item.vue";
import SelectTrigger from "./ui/select/trigger.vue";
import SelectValue from "./ui/select/value.vue";
import SelectViewport from "./ui/select/viewport.vue";

interface LogPage {
  ok: boolean;
  error?: string;
  commits?: HistoryCommit[];
  nextCursor?: string | null;
  branch?: string;
  defaultBranch?: string;
}

interface BranchPage {
  ok: boolean;
  error?: string;
  defaultBranch?: string;
  branches?: string[];
}

interface CommitFile {
  path: string;
  additions: number;
  deletions: number;
  status: string;
}

interface CommitDetail extends HistoryCommit {
  files: CommitFile[];
  patch: string;
  truncated: boolean;
}

const router = useRouter();
const repo = useRepoStore();
const ui = useUiStore();

const branches = ref<string[]>([]);
const defaultBranch = ref("main");
const branch = ref("");
const pathFilter = ref("");
const pathApplied = ref("");
const commits = ref<HistoryCommit[]>([]);
const nextCursor = ref<string | null>(null);
const loading = ref(false);
const loadingMore = ref(false);
const error = ref("");
const notGit = ref(false);
const expanded = ref<string | null>(null);
const details = ref<Record<string, CommitDetail>>({});
const detailError = ref<Record<string, string>>({});
const copied = ref<string | null>(null);
let copiedTimer: ReturnType<typeof setTimeout> | undefined;
const filtersReady = ref(false);

const groups = computed(() => groupCommitsByDay(commits.value));

onMounted(async () => {
  await loadBranches();
  if (!notGit.value) await loadPage(false);
  filtersReady.value = true;
});

watch(branch, () => {
  if (!filtersReady.value) return;
  void loadPage(false);
});

async function loadBranches(): Promise<void> {
  try {
    const data = await api<BranchPage>("/api/repo/branches");
    if (!data.ok) {
      notGit.value = true;
      error.value = data.error || "This folder is not a git repository.";
      return;
    }
    defaultBranch.value = data.defaultBranch || "main";
    branches.value = data.branches?.length ? data.branches : [defaultBranch.value];
    if (!branch.value) branch.value = defaultBranch.value;
  } catch (err) {
    error.value = err instanceof Error ? err.message : "Could not load branches.";
  }
}

function logUrl(before?: string | null): string {
  const q = new URLSearchParams();
  if (branch.value) q.set("branch", branch.value);
  if (pathApplied.value) q.set("path", pathApplied.value);
  q.set("limit", "50");
  if (before) q.set("before", before);
  return `/api/repo/log?${q.toString()}`;
}

async function loadPage(more: boolean): Promise<void> {
  if (more) loadingMore.value = true;
  else {
    loading.value = true;
    commits.value = [];
    nextCursor.value = null;
    expanded.value = null;
  }
  error.value = "";
  notGit.value = false;
  try {
    const data = await api<LogPage>(logUrl(more ? nextCursor.value : null));
    if (!data.ok) {
      notGit.value = /not a git/i.test(data.error ?? "");
      error.value = data.error || "Could not load history.";
      return;
    }
    const page = data.commits ?? [];
    commits.value = more ? [...commits.value, ...page] : page;
    nextCursor.value = data.nextCursor ?? null;
  } catch (err) {
    if (err instanceof ApiError && err.status === 400) {
      error.value = err.message;
    } else {
      error.value = err instanceof Error ? err.message : "Could not load history.";
    }
  } finally {
    loading.value = false;
    loadingMore.value = false;
  }
}

function applyPath(): void {
  pathApplied.value = pathFilter.value.trim().replace(/\/+$/, "");
  void loadPage(false);
}

async function toggleCommit(commit: HistoryCommit): Promise<void> {
  if (expanded.value === commit.sha) {
    expanded.value = null;
    return;
  }
  expanded.value = commit.sha;
  if (details.value[commit.sha]) return;
  try {
    const data = await api<{ ok: boolean; error?: string } & Partial<CommitDetail>>(
      `/api/repo/commits/${encodeURIComponent(commit.sha)}`,
    );
    if (!data.ok) {
      detailError.value = {
        ...detailError.value,
        [commit.sha]: data.error || "Could not load commit.",
      };
      return;
    }
    details.value = { ...details.value, [commit.sha]: data as CommitDetail };
  } catch (err) {
    detailError.value = {
      ...detailError.value,
      [commit.sha]: err instanceof Error ? err.message : "Could not load commit.",
    };
  }
}

async function copySha(sha: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(sha);
  } catch {
    /* clipboard may be denied in tests / insecure contexts */
  }
  copied.value = sha;
  clearTimeout(copiedTimer);
  copiedTimer = setTimeout(() => {
    if (copied.value === sha) copied.value = null;
  }, 1200);
}

async function openLinkedTask(id: string): Promise<void> {
  const known = repo.tasks.find((t) => t.id === id);
  if (known) {
    await ui.openTask(known);
    return;
  }
  try {
    const task = await repo.fetchTask(id);
    await ui.openTask(task);
  } catch {
    error.value = `Task #${id} is not on this board.`;
  }
}

function subjectParts(c: HistoryCommit) {
  return splitTaskSubject(c.subject);
}

function openDiff(sha: string, file?: string): void {
  void router.push({
    name: "commit-diff",
    params: { sha },
    query: file ? { file } : {},
  });
}
</script>

<template>
  <div class="hist">
    <div class="hist-toolbar">
      <label class="hist-field">
        <span class="hist-label">Branch</span>
        <Select v-model="branch">
          <SelectTrigger class="h-[34px] min-w-[180px] rounded-[9px] px-[11px]" aria-label="Branch">
            <SelectValue :placeholder="defaultBranch" />
          </SelectTrigger>
          <SelectContent position="popper">
            <SelectViewport class="min-w-[var(--radix-select-trigger-width)]">
              <SelectItem v-for="b in branches" :key="b" :value="b">{{ b }}</SelectItem>
            </SelectViewport>
          </SelectContent>
        </Select>
      </label>
      <form class="hist-path" @submit.prevent="applyPath">
        <label class="hist-field hist-field-grow">
          <span class="hist-label">Path</span>
          <Input
            v-model="pathFilter"
            class="h-[34px] py-0"
            placeholder="Filter by path, e.g. src/ui-app"
            title="A trailing slash is ignored. Paths must be relative (no ..)."
            aria-label="Path filter"
          />
        </label>
        <Button type="submit" variant="ghost" size="sm" class="hist-apply">Apply</Button>
      </form>
    </div>

    <div v-if="loading" class="hist-state">Loading history…</div>
    <div v-else-if="notGit" class="hist-state hist-empty">
      This folder is not a git repository, so there is no commit history to show.
    </div>
    <div v-else-if="error && !commits.length" class="hist-state hist-error">{{ error }}</div>
    <div v-else-if="!commits.length" class="hist-state hist-empty">
      {{
        pathApplied
          ? "No commits touch that path on this branch."
          : "No commits on this branch yet."
      }}
    </div>

    <div v-else class="hist-rail" role="list">
      <div v-if="error" class="hist-state hist-error">{{ error }}</div>
      <section v-for="group in groups" :key="group.key" class="hist-day">
        <header class="hist-day-head">
          <span class="hist-tick" aria-hidden="true"></span>
          <h2>{{ group.label }}</h2>
        </header>
        <article
          v-for="c in group.commits"
          :key="c.sha"
          class="hist-commit"
          role="listitem"
          :class="{ open: expanded === c.sha }"
        >
          <button class="hist-row" type="button" @click="toggleCommit(c)">
            <span class="hist-node" aria-hidden="true"></span>
            <span class="hist-avatar" :title="c.authorName">{{
              authorInitials(c.authorName)
            }}</span>
            <span class="hist-main">
              <span class="hist-subject">
                <template v-if="subjectParts(c).taskId">
                  <span class="hist-type">{{ subjectParts(c).type }}(</span>
                  <a
                    class="hist-task"
                    href="#"
                    @click.prevent.stop="openLinkedTask(subjectParts(c).taskId!)"
                    >{{ subjectParts(c).taskId }}</a
                  >
                  <span class="hist-type">):</span>
                  {{ subjectParts(c).rest }}
                </template>
                <template v-else>{{ c.subject }}</template>
              </span>
              <span class="hist-meta">
                <span
                  v-for="ref in c.refs"
                  :key="ref"
                  class="hist-ref"
                  :class="{ head: ref === 'HEAD' }"
                  >{{ ref }}</span
                >
                <span v-if="c.check" class="hist-badge" :class="c.check.passed ? 'pass' : 'fail'">{{
                  c.check.passed ? "checks passed" : "checks failed"
                }}</span>
              </span>
            </span>
            <span class="hist-aside">
              <button
                type="button"
                class="hist-sha"
                :title="copied === c.sha ? 'Copied' : c.sha"
                @click.stop="copySha(c.sha)"
              >
                {{ copied === c.sha ? "copied" : c.shortSha }}
              </button>
              <time class="hist-when" :datetime="c.date" :title="c.date">{{
                relTime(c.date)
              }}</time>
            </span>
          </button>
          <div v-if="expanded === c.sha" class="hist-detail">
            <p v-if="c.body" class="hist-body">{{ c.body }}</p>
            <p v-else class="hist-body hist-body-empty">No commit message body.</p>
            <div v-if="detailError[c.sha]" class="hist-state hist-error">
              {{ detailError[c.sha] }}
            </div>
            <ul v-else-if="details[c.sha]" class="hist-files">
              <li v-for="f in details[c.sha]!.files" :key="f.path">
                <button type="button" class="hist-file" @click="openDiff(c.sha, f.path)">
                  <span class="hist-file-path">{{ f.path }}</span>
                  <span class="hist-file-add">+{{ f.additions }}</span>
                  <span class="hist-file-del">−{{ f.deletions }}</span>
                </button>
              </li>
              <li v-if="!details[c.sha]!.files.length" class="hist-body-empty">No file changes.</li>
            </ul>
            <p v-else class="hist-state">Loading changes…</p>
            <Button variant="accent" size="sm" class="hist-open-diff" @click="openDiff(c.sha)"
              >Open diff</Button
            >
          </div>
        </article>
      </section>
      <div class="hist-more">
        <Button v-if="nextCursor" variant="ghost" :disabled="loadingMore" @click="loadPage(true)">
          {{ loadingMore ? "Loading…" : "Load more" }}
        </Button>
        <span v-else class="hist-end">End of history</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.hist {
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
}
.hist-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 12px 16px;
  align-items: flex-end;
  padding: 4px 4px 14px;
  border-bottom: 1px solid var(--border);
}
.hist-field {
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.hist-field-grow {
  flex: 1;
  min-width: 160px;
}
.hist-label {
  font-family: "JetBrains Mono", monospace;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--txt-faint);
}
.hist-path {
  display: flex;
  flex: 1;
  gap: 8px;
  align-items: flex-end;
  min-width: 220px;
}
.hist-apply {
  margin-bottom: 1px;
}
.hist-state {
  padding: 28px 12px;
  color: var(--txt-muted);
  font-size: 13px;
}
.hist-empty {
  max-width: 46ch;
}
.hist-error {
  color: var(--txt);
  background: var(--red-tint);
  border: 1px solid var(--red-border-tint);
  border-radius: 8px;
  margin: 8px;
  padding: 10px 12px;
}
.hist-rail {
  flex: 1;
  overflow: auto;
  padding: 0 8px 24px 4px;
}
.hist-day {
  position: relative;
}
.hist-day-head {
  position: sticky;
  top: 0;
  z-index: 2;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 0 8px;
  background: color-mix(in srgb, var(--panel) 92%, transparent);
  backdrop-filter: blur(8px);
}
.hist-day-head h2 {
  margin: 0;
  font-family: "JetBrains Mono", monospace;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--txt-dim);
}
.hist-tick {
  width: 9px;
  height: 9px;
  border-radius: 2px;
  background: var(--violet);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--violet) 25%, transparent);
  flex-shrink: 0;
  margin-left: 6px;
}
.hist-commit {
  position: relative;
  padding-left: 20px;
}
.hist-commit::before {
  content: "";
  position: absolute;
  left: 10px;
  top: 0;
  bottom: 0;
  width: 1px;
  background: var(--border);
}
.hist-node {
  position: absolute;
  left: 7px;
  top: 18px;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--panel);
  border: 1.5px solid var(--txt-faint);
}
.hist-commit.open .hist-node {
  border-color: var(--violet);
  background: var(--violet);
}
.hist-row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  width: 100%;
  padding: 8px 8px 8px 4px;
  border: 0;
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
  border-radius: 8px;
  font: inherit;
}
.hist-row:hover {
  background: var(--bg-overlay);
}
.hist-row:focus-visible {
  outline: 2px solid var(--violet);
  outline-offset: 1px;
}
.hist-avatar {
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  margin-top: 1px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.04em;
  color: var(--txt);
  background: var(--bg-accent-soft);
  border: 1px solid var(--border);
}
.hist-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.hist-subject {
  color: var(--txt);
  font-size: 13.5px;
  line-height: 1.4;
}
.hist-type {
  color: var(--txt-muted);
  font-family: "JetBrains Mono", monospace;
  font-size: 12px;
}
.hist-task {
  color: var(--violet);
  font-family: "JetBrains Mono", monospace;
  font-size: 12px;
  font-weight: 700;
  text-decoration: none;
}
.hist-task:hover {
  text-decoration: underline;
}
.hist-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.hist-ref,
.hist-badge {
  font-family: "JetBrains Mono", monospace;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.02em;
  padding: 1px 6px;
  border-radius: 999px;
  border: 1px solid var(--border);
  color: var(--txt-dim);
}
.hist-ref.head {
  border-color: var(--violet);
  color: var(--txt);
}
.hist-badge.pass {
  color: var(--green);
  border-color: color-mix(in srgb, var(--green) 45%, var(--border));
}
.hist-badge.fail {
  color: var(--red);
  border-color: color-mix(in srgb, var(--red) 45%, var(--border));
}
.hist-aside {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
  flex-shrink: 0;
}
.hist-sha {
  font-family: "JetBrains Mono", monospace;
  font-size: 11px;
  color: var(--txt-muted);
  background: transparent;
  border: 0;
  padding: 0;
  cursor: pointer;
}
.hist-sha:hover {
  color: var(--txt);
}
.hist-when {
  font-size: 11px;
  color: var(--txt-faint);
  white-space: nowrap;
}
.hist-detail {
  padding: 0 8px 14px 42px;
  display: grid;
  gap: 10px;
}
.hist-body {
  margin: 0;
  white-space: pre-wrap;
  color: var(--txt-muted);
  font-size: 13px;
  line-height: 1.5;
  max-width: 72ch;
}
.hist-body-empty {
  color: var(--txt-faint);
  font-size: 12px;
}
.hist-files {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 2px;
}
.hist-file {
  display: flex;
  width: 100%;
  gap: 10px;
  align-items: baseline;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: pointer;
  padding: 4px 6px;
  border-radius: 6px;
  text-align: left;
}
.hist-file:hover {
  background: var(--bg-overlay);
}
.hist-file-path {
  flex: 1;
  font-family: "JetBrains Mono", monospace;
  font-size: 12px;
  color: var(--txt-dim);
}
.hist-file-add {
  font-family: "JetBrains Mono", monospace;
  font-size: 11px;
  color: var(--green);
}
.hist-file-del {
  font-family: "JetBrains Mono", monospace;
  font-size: 11px;
  color: var(--red);
}
.hist-open-diff {
  justify-self: start;
}
.hist-more {
  display: flex;
  justify-content: center;
  padding: 16px 0 8px;
}
.hist-end {
  font-size: 12px;
  color: var(--txt-faint);
}
@media (max-width: 860px) {
  .hist-toolbar {
    flex-direction: column;
    align-items: stretch;
  }
  .hist-path {
    min-width: 0;
  }
  .hist-aside {
    min-width: 72px;
  }
  .hist-detail {
    padding-left: 8px;
  }
}
@media (prefers-reduced-motion: reduce) {
  .hist-day-head {
    backdrop-filter: none;
  }
}
</style>
