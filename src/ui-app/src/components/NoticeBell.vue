<script setup lang="ts">
/**
 * Top-bar notice bell (#0606): unread badge over a bell button, opening a
 * popover that lists the current release notices plus — reusing the mission-
 * control list — the tasks that need a human. Notices are dismissible and
 * link to the Releases page; "Mark all read" clears the badge.
 *
 * The popover is teleported to <body> and carries `data-overlay-
 * layer="floating"` (AGENTS.md #0575): while any dialog is open Radix puts
 * `pointer-events: none` on <body>, and an unmarked teleported layer would be
 * click-transparent, letting clicks fall through to the panel behind it.
 * Position is measured from the trigger (SidebarGitState's pattern) because a
 * teleported element can't rely on its absolute-in-flow anchor.
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { storeToRefs } from "pinia";
import { useRouter } from "vue-router";
import { Bell } from "lucide-vue-next";
import type { NoticeKind } from "../stores/notices";
import {
  useNoticesStore,
  NOTICE_FEED_LIMIT,
  NOTICE_KIND_COLOR,
  BELL_POPOVER_TEST_ID,
  BELL_TRIGGER_TEST_ID,
} from "../stores/notices";
import { useRepoStore } from "../stores/repo";
import { useUiStore } from "../stores/ui";
import { relTime } from "../lib/time";

const router = useRouter();
const notices = useNoticesStore();
const repo = useRepoStore();
const ui = useUiStore();
const { activeNotices, unreadNotices, dismissedCount } = storeToRefs(notices);
const { humanNeeds } = storeToRefs(repo);

const open = ref(false);
const triggerEl = ref<HTMLButtonElement | null>(null);
const popEl = ref<HTMLElement | null>(null);
const popStyle = ref<Record<string, string>>({ left: "0px", top: "0px" });

/** Badge shows unread notices only — tasks already have the sidebar/panel. */
const unreadCount = computed(() => unreadNotices.value.length);
const badgeLabel = computed(() => (unreadCount.value > 9 ? "9+" : String(unreadCount.value)));

function measure(): void {
  const anchor = triggerEl.value;
  const pop = popEl.value;
  if (!anchor || !pop) return;
  const rect = anchor.getBoundingClientRect();
  const width = Math.min(360, window.innerWidth - 16);
  const left = Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8));
  const height = pop.offsetHeight;
  let top = rect.bottom + 8;
  top = Math.min(top, Math.max(8, window.innerHeight - height - 8));
  popStyle.value = {
    left: `${Math.round(left)}px`,
    top: `${Math.round(top)}px`,
    width: `${width}px`,
  };
}

async function toggle(): Promise<void> {
  open.value = !open.value;
  if (open.value) {
    await nextTick();
    measure();
    popEl.value?.focus({ preventScroll: true });
  }
}

function close(focusTrigger = false): void {
  if (!open.value) return;
  open.value = false;
  if (focusTrigger) nextTick(() => triggerEl.value?.focus());
}

function onDocumentMouseDown(e: MouseEvent): void {
  const target = e.target as HTMLElement;
  if (target.closest(`[data-test-id="${BELL_TRIGGER_TEST_ID}"]`)) return;
  if (target.closest(`[data-test-id="${BELL_POPOVER_TEST_ID}"]`)) return;
  open.value = false;
}

function onKeydown(e: KeyboardEvent): void {
  if (e.key === "Escape") {
    close(true);
    return;
  }
  if (e.key !== "Tab" || !open.value) return;
  // Keep Tab cycling inside the teleported popover.
  const pop = popEl.value;
  if (!pop) return;
  const focusable = Array.from(
    pop.querySelectorAll<HTMLElement>("button, a[href], [tabindex]:not([tabindex='-1'])"),
  ).filter((el) => el.offsetParent !== null);
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    (last as HTMLElement).focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    (first as HTMLElement).focus();
  }
}

onMounted(() => {
  document.addEventListener("mousedown", onDocumentMouseDown);
  document.addEventListener("keydown", onKeydown);
});

onBeforeUnmount(() => {
  document.removeEventListener("mousedown", onDocumentMouseDown);
  document.removeEventListener("keydown", onKeydown);
});

/** Clicking a notice navigates, marks it read and collapses the popover. */
function follow(n: { id: string; link: string }): void {
  notices.markRead(n.id);
  open.value = false;
  if (n.link) void router.push(n.link);
}

/** Open a needs-you task row the same way the mission-control panel does. */
function openTask(t: { id: string }): void {
  open.value = false;
  const task = repo.tasks.find((x) => x.id === t.id);
  if (task) ui.openTask(task);
  else void router.push(`/work?task=${t.id}`);
}

/** Template helper: the dot/accent color for a notice kind. */
const noticeColor = (kind: NoticeKind): string => NOTICE_KIND_COLOR[kind] ?? "var(--cyan)";

const shownNotices = computed(() => activeNotices.value.slice(0, NOTICE_FEED_LIMIT));
const shownTasks = computed(() => humanNeeds.value.slice(0, 4));

function timeOf(iso: string): string {
  return relTime(iso);
}

/** The exact local time, shown in the styled tooltip on hover/focus. */
function fullTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

// Recompute the measured position when the popover opens.
watch(open, (o) => {
  if (o) void nextTick(measure);
});
</script>

<template>
  <button
    ref="triggerEl"
    type="button"
    class="notice-bell-trigger"
    :class="{ on: open }"
    :data-test-id="BELL_TRIGGER_TEST_ID"
    :aria-label="unreadCount ? `Notices, ${unreadCount} unread` : 'Notices'"
    aria-haspopup="dialog"
    :aria-expanded="open"
    title="Notices"
    @click="toggle"
  >
    <Bell :size="15" :stroke-width="1.8" />
    <span v-if="unreadCount" class="notice-bell-badge">{{ badgeLabel }}</span>
  </button>

  <Teleport to="body">
    <div
      v-if="open"
      ref="popEl"
      class="notice-pop"
      :data-test-id="BELL_POPOVER_TEST_ID"
      data-overlay-layer="floating"
      role="dialog"
      aria-label="Notices"
      tabindex="-1"
      :style="popStyle"
    >
      <header class="notice-pop-head">
        <span class="notice-pop-title">Notices</span>
        <button
          v-if="unreadCount"
          type="button"
          class="notice-pop-action"
          @click="notices.markAllRead()"
        >
          Mark all read
        </button>
      </header>

      <div class="notice-pop-body">
        <template v-if="shownNotices.length || shownTasks.length">
          <!-- Release / server notices -->
          <ul v-if="shownNotices.length" class="notice-list">
            <li v-for="n in shownNotices" :key="n.id" class="notice-row">
              <span class="notice-dot" :style="{ background: noticeColor(n.kind) }"></span>
              <button
                type="button"
                class="notice-body"
                :data-tip="fullTime(n.createdAt)"
                @click="follow(n)"
              >
                <span class="notice-title" :class="{ unread: !n.read }">{{ n.title }}</span>
                <span v-if="n.detail" class="notice-detail">{{ n.detail }}</span>
                <span class="notice-time">{{ timeOf(n.createdAt) }}</span>
              </button>
              <button
                type="button"
                class="notice-x"
                aria-label="Dismiss notice"
                @click="notices.dismiss(n.id)"
              >
                ×
              </button>
            </li>
          </ul>
          <p v-else-if="!shownTasks.length" class="notice-empty">
            {{
              dismissedCount
                ? "Nothing to show — dismissed notices stay hidden."
                : "You're all caught up."
            }}
          </p>

          <!-- Task attention rows (reused mission-control list) -->
          <template v-if="shownTasks.length">
            <div class="notice-divider">Tasks needing you</div>
            <ul class="notice-list">
              <li v-for="item in shownTasks" :key="item.task.id" class="notice-row">
                <span
                  class="notice-dot"
                  :style="{ background: repo.statusColor(item.task.status) }"
                ></span>
                <button type="button" class="notice-body" @click="openTask(item.task)">
                  <span class="notice-title unread">#{{ item.task.id }} {{ item.task.title }}</span>
                  <span class="notice-detail">{{ item.reasons.join(", ") }}</span>
                  <span class="notice-time">{{ item.task.status }}</span>
                </button>
              </li>
            </ul>
          </template>
        </template>
        <p v-else class="notice-empty">You're all caught up.</p>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.notice-bell-trigger {
  position: relative;
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  flex-shrink: 0;
  border-radius: 50%;
  border: 1px solid var(--border-bright);
  background: var(--panel-solid);
  color: var(--txt);
  cursor: pointer;
  transition: 0.15s;
}
.notice-bell-trigger:hover {
  color: var(--txt);
  border-color: var(--border-bright);
  background: var(--panel-solid);
}
.notice-bell-badge {
  position: absolute;
  top: -4px;
  right: -4px;
  min-width: 15px;
  height: 15px;
  padding: 0 4px;
  border-radius: 999px;
  display: grid;
  place-items: center;
  font-size: 9.5px;
  font-weight: 800;
  line-height: 1;
  color: var(--amber);
  /* tint layered over a solid base so the badge isn't see-through */
  background: linear-gradient(var(--amber-tint), var(--amber-tint)), var(--panel-solid);
  border: 1px solid var(--amber-border-tint);
}

.notice-pop {
  position: fixed;
  z-index: 90;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--panel-solid);
  box-shadow: 0 12px 30px -16px rgba(0, 0, 0, 0.55);
  padding: 6px;
  max-height: min(420px, calc(100vh - 70px));
  overflow: auto;
}
.notice-pop:focus {
  outline: 2px solid var(--cyan);
  outline-offset: 1px;
}
.notice-pop-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 8px 8px;
  border-bottom: 1px solid var(--border);
  margin-bottom: 4px;
}
.notice-pop-title {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--txt-faint);
}
.notice-pop-action {
  border: none;
  background: none;
  color: var(--cyan);
  font-size: 11.5px;
  cursor: pointer;
  padding: 2px 4px;
  border-radius: 5px;
}
.notice-pop-action:hover {
  color: var(--txt);
  background: var(--nav-hover-bg);
}

.notice-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 2px;
}
.notice-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  border-radius: 8px;
  padding: 4px 4px 4px 6px;
}
.notice-row:hover {
  background: var(--nav-hover-bg);
}
.notice-dot {
  flex: none;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  margin-top: 6px;
}
.notice-body {
  flex: 1;
  min-width: 0;
  display: grid;
  gap: 2px;
  text-align: left;
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
  color: inherit;
}
.notice-title {
  font-size: 12.5px;
  font-weight: 500;
  color: var(--txt-dim);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.notice-title.unread {
  font-weight: 700;
  color: var(--txt);
}
.notice-detail {
  font-size: 11.5px;
  color: var(--txt-faint);
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}
.notice-time {
  font-size: 10.5px;
  color: var(--txt-faint);
  font-family: var(--mono);
}
.notice-x {
  flex: none;
  display: grid;
  place-items: center;
  width: 20px;
  height: 20px;
  border: none;
  background: none;
  color: var(--txt-faint);
  font-size: 14px;
  border-radius: 5px;
  cursor: pointer;
}
.notice-x:hover {
  color: var(--txt);
  background: var(--nav-hover-bg);
}
.notice-empty {
  padding: 14px 8px;
  color: var(--txt-faint);
  font-size: 12px;
  text-align: center;
}
.notice-divider {
  padding: 8px 8px 4px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--txt-faint);
}
</style>
