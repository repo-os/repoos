<script setup lang="ts">
/**
 * Sidebar git-state row (#0584): the repo root checkout's branch and its
 * clean / dirty / unknown state, always visible under the `events` row, plus
 * an info popover with the changed files and the three most recent commits.
 *
 * The data is server-owned (`GET /api/repo/status`, pushed as SSE
 * `repo.status`) — this component only renders it, and degrades honestly:
 * an unreadable or stale snapshot shows `unknown`, never `clean`.
 *
 * The popover is teleported to <body> with `data-overlay-layer="floating"`
 * (AGENTS.md): inside the sidebar it would be clipped by the sidebar's own
 * overflow and stacking context, and an unmarked layer is click-transparent
 * while a dialog holds `<body>`.
 */
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import { storeToRefs } from "pinia";
import { useRepoStore } from "../stores/repo";
import { relTime } from "../lib/time";
import { authorInitials } from "../lib/repo-history";

/** A snapshot older than this is history, not state — show `unknown`. */
const STALE_MS = 90_000;
/** Changed files listed before the list is capped. */
const MAX_FILES = 8;
/** Grace period so a pointer can travel from the icon into the popover. */
const CLOSE_DELAY_MS = 200;
/** How long after a pointer press on the icon a focus event is "its own". */
const POINTER_FOCUS_GRACE_MS = 600;
const POPOVER_WIDTH = 300;

const repo = useRepoStore();
const { gitStatus } = storeToRefs(repo);

const now = ref(Date.now());
let nowTimer: ReturnType<typeof setInterval> | null = null;
nowTimer = setInterval(() => {
  now.value = Date.now();
}, 1000);
onBeforeUnmount(() => {
  if (nowTimer) clearInterval(nowTimer);
});

/** Milliseconds since the server computed the snapshot (Infinity when absent). */
const ageMs = computed(() => {
  const status = gitStatus.value;
  if (!status) return Infinity;
  const at = Date.parse(status.computedAt);
  return Number.isNaN(at) ? Infinity : now.value - at;
});

/** Readable AND fresh — the only condition under which we may say `clean`. */
const live = computed(() => gitStatus.value?.ok === true && ageMs.value < STALE_MS);

const branchLabel = computed(() => {
  const status = gitStatus.value;
  if (!live.value || !status) return "unknown";
  return status.detached ? "detached" : (status.branch ?? "unknown");
});

/** Not on the base branch, or detached: the "am I still on main?" warning. */
const branchWarn = computed(() => {
  const status = gitStatus.value;
  if (!live.value || !status) return false;
  return status.detached || (status.baseBranch !== null && status.branch !== status.baseBranch);
});

const branchTitle = computed(() => {
  const status = gitStatus.value;
  if (!status) return "Repo root checkout: no git state yet";
  if (!live.value) return "Repo root checkout: git state unknown";
  if (status.detached)
    return `Repo root checkout: HEAD is detached (base branch ${status.baseBranch ?? "?"})`;
  if (branchWarn.value) {
    return `Repo root checkout is on ${status.branch}, not the base branch ${status.baseBranch}`;
  }
  return `Repo root checkout is on ${status.branch}`;
});

const dirtyCount = computed(() => (live.value ? (gitStatus.value?.dirty.length ?? 0) : 0));

const stateLabel = computed(() => {
  if (!live.value) return "unknown";
  return dirtyCount.value > 0 ? "dirty" : "clean";
});

const stateClass = computed(() => {
  if (!live.value) return "unknown";
  return dirtyCount.value > 0 ? "warn" : "ok";
});

/** `dirty (3)` — the count lives in its own chip so the word stays scannable. */
const stateSub = computed(() => (dirtyCount.value > 0 ? String(dirtyCount.value) : ""));

/** "checked 12s ago" — the popup's freshness stamp. */
const checkedLabel = computed(() =>
  gitStatus.value
    ? `checked ${relTime(gitStatus.value.computedAt, new Date(now.value))}`
    : "not checked yet",
);

const pathLabel = computed(() => gitStatus.value?.path ?? "");

/** The popup's explanation of a non-live state, or "" when everything is fine. */
const statusNote = computed(() => {
  const status = gitStatus.value;
  if (!status) return "No git status yet — the row shows unknown until the first check lands.";
  if (!status.ok) return "Git status could not be read — shown as unknown, never as clean.";
  if (ageMs.value >= STALE_MS) {
    return `Last checked ${relTime(status.computedAt, new Date(now.value))} — too old to trust, so shown as unknown.`;
  }
  return "";
});

const files = computed(() => (live.value ? (gitStatus.value?.dirty ?? []) : []));
const shownFiles = computed(() => files.value.slice(0, MAX_FILES));
const hiddenFiles = computed(() => Math.max(0, files.value.length - MAX_FILES));

const commits = computed(() => (live.value ? (gitStatus.value?.recentCommits ?? []) : []));

/** Porcelain `XY` → the short chip drawn next to a path (`??`, `M`, `A`, …). */
function statusLetter(code: string): string {
  if (code === "??") return "??";
  if (code.includes("U")) return "UU";
  const x = (code[0] ?? "").trim();
  if (x && x !== "?") return x;
  const y = (code[1] ?? "").trim();
  return y || "?";
}

/** The same code as the word a person reads: modified, added, untracked, … */
function statusWord(code: string): string {
  if (code === "??") return "untracked";
  if (code.includes("U")) return "conflicted";
  const words: Record<string, string> = {
    A: "added",
    D: "deleted",
    M: "modified",
    R: "renamed",
    C: "copied",
  };
  return words[statusLetter(code)] ?? "changed";
}

// --- popover open/close: hover, keyboard focus and touch all open it -------
const open = ref(false);
const infoEl = ref<HTMLButtonElement | null>(null);
const popupEl = ref<HTMLElement | null>(null);
const popupStyle = ref<Record<string, string>>({ left: "0px", top: "0px" });
let closeTimer: ReturnType<typeof setTimeout> | null = null;
/** When the icon was last pressed by a pointer — see `onFocus`. */
let lastPointerAt = 0;

/** Touch devices get no hover, so the icon's click toggles instead of opens. */
const canHover = (): boolean => {
  try {
    return (
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(hover: hover)").matches
    );
  } catch {
    return false;
  }
};

function measure(): void {
  const anchor = infoEl.value;
  const popup = popupEl.value;
  if (!anchor || !popup) return;
  const rect = anchor.getBoundingClientRect();
  const height = popup.offsetHeight;
  const left = Math.max(8, Math.min(rect.right + 8, window.innerWidth - POPOVER_WIDTH - 8));
  // The side-foot sits at the bottom of the sidebar, so open upwards when
  // there is no room below the row — clamped so it never leaves the viewport.
  let top = rect.top - height - 10;
  if (top < 8) top = rect.bottom + 10;
  top = Math.min(top, Math.max(8, window.innerHeight - height - 8));
  popupStyle.value = { left: `${Math.round(left)}px`, top: `${Math.round(top)}px` };
}

function cancelClose(): void {
  if (closeTimer) {
    clearTimeout(closeTimer);
    closeTimer = null;
  }
}

function scheduleClose(delay = CLOSE_DELAY_MS): void {
  cancelClose();
  closeTimer = setTimeout(() => {
    closeTimer = null;
    open.value = false;
  }, delay);
}

function closeNow(): void {
  cancelClose();
  open.value = false;
}

async function show(): Promise<void> {
  cancelClose();
  if (open.value) return;
  open.value = true;
  // The popover's whole value is that it is current: ask for a fresh
  // snapshot on open rather than trusting the last pushed one.
  void repo.refreshGitStatus();
  await nextTick();
  measure();
}

function onEnter(): void {
  void show();
}

/** A pointer press on the icon: the click handler will open (or toggle) it. */
function notePointer(): void {
  lastPointerAt = Date.now();
}

function onFocus(): void {
  // Keyboard focus opens the popover; focus that this button's own pointer
  // press produced does not — otherwise the click handler's toggle would
  // close what focus just opened, in the same interaction. This is what keeps
  // hover, keyboard and touch from fighting each other.
  if (Date.now() - lastPointerAt < POINTER_FOCUS_GRACE_MS) return;
  void show();
}

function onClick(): void {
  if (!canHover()) {
    if (open.value) closeNow();
    else void show();
    return;
  }
  void show();
}

function onDocPointerDown(event: Event): void {
  const target = event.target as Node | null;
  if (!target) return;
  if (popupEl.value?.contains(target) || infoEl.value?.contains(target)) return;
  closeNow();
}

function onDocKeydown(event: KeyboardEvent): void {
  if (event.key === "Escape") closeNow();
}

watch(open, (isOpen) => {
  if (isOpen) {
    document.addEventListener("pointerdown", onDocPointerDown, true);
    document.addEventListener("keydown", onDocKeydown);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
  } else {
    document.removeEventListener("pointerdown", onDocPointerDown, true);
    document.removeEventListener("keydown", onDocKeydown);
    window.removeEventListener("resize", measure);
    window.removeEventListener("scroll", measure, true);
    cancelClose();
  }
});

// The popover grows when a pushed status adds files or commits — re-measure
// so a taller list cannot push it past the bottom of the viewport.
watch(gitStatus, async () => {
  if (!open.value) return;
  await nextTick();
  measure();
});

onBeforeUnmount(() => {
  document.removeEventListener("pointerdown", onDocPointerDown, true);
  document.removeEventListener("keydown", onDocKeydown);
  window.removeEventListener("resize", measure);
  window.removeEventListener("scroll", measure, true);
  cancelClose();
});
</script>

<template>
  <div class="row side-git">
    <span class="side-git-branch" :class="{ warn: branchWarn }" :title="branchTitle">
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="7" cy="5.5" r="2.4" stroke="currentColor" stroke-width="1.8" />
        <circle cx="7" cy="18.5" r="2.4" stroke="currentColor" stroke-width="1.8" />
        <circle cx="17" cy="8.5" r="2.4" stroke="currentColor" stroke-width="1.8" />
        <path
          d="M7 8v8M17 11c0 3-2.4 3.6-6 4.2"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
        />
      </svg>
      <span class="side-git-name">{{ branchLabel }}</span>
    </span>
    <span class="side-git-tail">
      <b class="side-git-state" :class="stateClass">
        {{ stateLabel }}<i v-if="stateSub">{{ stateSub }}</i>
      </b>
      <button
        ref="infoEl"
        type="button"
        class="side-git-info"
        :class="{ on: open }"
        :aria-expanded="open"
        aria-label="Git state details: changed files and recent commits"
        title="Changed files and recent commits"
        @mouseenter="onEnter"
        @mouseleave="scheduleClose()"
        @pointerdown="notePointer"
        @focus="onFocus"
        @focusout="scheduleClose()"
        @click.stop="onClick"
      >
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.8" />
          <path d="M12 11v5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
          <circle cx="12" cy="7.8" r="1.1" fill="currentColor" />
        </svg>
      </button>
    </span>
  </div>

  <Teleport to="body">
    <div
      v-if="open"
      ref="popupEl"
      class="side-git-pop"
      data-overlay-layer="floating"
      role="dialog"
      aria-label="Repo git state"
      :style="popupStyle"
      @mouseenter="cancelClose"
      @mouseleave="scheduleClose()"
      @focusin="cancelClose"
      @focusout="scheduleClose()"
    >
      <header class="side-git-pop-head">
        <span class="side-git-pop-title">Repo root checkout</span>
        <span class="side-git-pop-path" :title="pathLabel">{{ pathLabel }}</span>
      </header>

      <p class="side-git-pop-summary">
        <span class="side-git-pop-branch" :class="{ warn: branchWarn }">{{ branchLabel }}</span>
        <span class="side-git-pop-state" :class="stateClass">{{ stateLabel }}</span>
        <span class="side-git-pop-checked">{{ checkedLabel }}</span>
      </p>

      <section v-if="statusNote" class="side-git-pop-note">{{ statusNote }}</section>

      <section v-if="files.length" class="side-git-pop-sec">
        <h3>Changed files</h3>
        <ul class="side-git-files">
          <li v-for="f in shownFiles" :key="f.path">
            <span
              class="side-git-chip"
              :title="statusWord(f.status)"
              :aria-label="statusWord(f.status)"
              >{{ statusLetter(f.status) }}</span
            >
            <span class="side-git-file-path" :title="f.path">{{ f.path }}</span>
          </li>
          <li v-if="hiddenFiles" class="side-git-more">+{{ hiddenFiles }} more</li>
        </ul>
      </section>

      <section class="side-git-pop-sec">
        <h3>Recent commits</h3>
        <ul v-if="commits.length" class="side-git-commits">
          <li v-for="c in commits" :key="c.sha">
            <span class="side-git-avatar" :title="c.authorName">{{
              authorInitials(c.authorName)
            }}</span>
            <span class="side-git-commit">
              <span class="side-git-subject" :title="c.subject">{{ c.subject }}</span>
              <span class="side-git-meta">
                <span class="side-git-sha">{{ c.shortSha }}</span>
                <time :datetime="c.date">{{ relTime(c.date) }}</time>
              </span>
            </span>
          </li>
        </ul>
        <p v-else class="side-git-pop-note">No commits to show.</p>
      </section>

      <footer class="side-git-pop-foot">
        <RouterLink class="side-git-history" to="/repo?tab=history" @click="closeNow"
          >View history</RouterLink
        >
      </footer>
    </div>
  </Teleport>
</template>
