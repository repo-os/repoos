<script setup lang="ts">
import { computed } from "vue";
import { storeToRefs } from "pinia";
import { useRouter } from "vue-router";
import { useRepoStore } from "../stores/repo";
import {
  useNoticesStore,
  NOTICE_KIND_COLOR,
  NOTICE_KIND_LABELS,
  type NoticeItem,
} from "../stores/notices";
import { relTime } from "../lib/time";
import { useUiStore } from "../stores/ui";
import Card from "./ui/card.vue";
import Button from "./ui/button.vue";

const repo = useRepoStore();
const ui = useUiStore();
const notices = useNoticesStore();
const router = useRouter();
const { humanNeeds } = storeToRefs(repo);
const { activeNotices } = storeToRefs(notices);

/** Panel badge: current notices + tasks needing a human. */
const total = computed(() => activeNotices.value.length + humanNeeds.value.length);

/** Follow a notice to its target page (Releases today) and mark it read. */
function follow(n: NoticeItem): void {
  notices.markRead(n.id);
  if (n.link) void router.push(n.link);
}

const noticeColor = (kind: NoticeItem["kind"]): string => NOTICE_KIND_COLOR[kind] ?? "var(--cyan)";
const kindLabel = (kind: NoticeItem["kind"]): string => NOTICE_KIND_LABELS[kind] ?? kind;
const ago = (iso: string): string => relTime(iso);
</script>

<template>
  <Card>
    <div class="panel-head">
      <div class="panel-title">
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M12 3 2 21h20L12 3z"
            stroke="currentColor"
            stroke-width="1.8"
            stroke-linejoin="round"
          />
          <path d="M12 10v5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
          <circle cx="12" cy="17.5" r="1" fill="currentColor" />
        </svg>
        Needs your attention
      </div>
      <span class="tag" style="background: var(--amber-tint); color: var(--amber)">{{
        total
      }}</span>
    </div>

    <div v-if="!activeNotices.length && !humanNeeds.length" class="feed-empty needs-empty">
      <div>Nothing needs your attention right now.</div>
      <Button size="sm" variant="outline" class="needs-cta" @click="ui.openNewTask('human')">
        New task for me
      </Button>
    </div>

    <div v-else class="feed">
      <!-- Release / server notices (0606): dismissible, linked to Releases. -->
      <div
        class="feed-item notice-item"
        v-for="n in activeNotices"
        :key="n.id"
        style="cursor: pointer"
        @click="follow(n)"
      >
        <div class="feed-dot" :style="{ background: noticeColor(n.kind) }"></div>
        <div class="feed-line"></div>
        <div style="flex: 1; min-width: 0">
          <div class="feed-msg" :class="{ 'notice-unread': !n.read }">
            <span class="kind-tag" :style="{ color: noticeColor(n.kind) }">{{
              kindLabel(n.kind)
            }}</span>
            {{ n.title }}
          </div>
          <div v-if="n.detail" class="needs-reasons notice-detail" :title="n.detail">
            {{ n.detail }}
          </div>
          <div class="feed-meta">
            <span>{{ ago(n.createdAt) }}</span>
            <span>{{ n.link }}</span>
          </div>
        </div>
        <button
          type="button"
          class="notice-dismiss"
          aria-label="Dismiss notice"
          @click.stop="notices.dismiss(n.id)"
        >
          ✕
        </button>
      </div>

      <!-- Tasks waiting on a human (unchanged mission-control rows). -->
      <div
        class="feed-item"
        v-for="item in humanNeeds"
        :key="item.task.id"
        style="cursor: pointer"
        @click="ui.openTask(item.task)"
      >
        <div class="feed-dot" :style="{ background: repo.statusColor(item.task.status) }"></div>
        <div class="feed-line"></div>
        <div style="flex: 1; min-width: 0">
          <div class="feed-msg">
            <b>#{{ item.task.id }}</b> {{ item.task.title }}
          </div>
          <div class="needs-reasons">
            <span class="reason-tag" v-for="r in item.reasons" :key="r">{{ r }}</span>
          </div>
          <div class="feed-meta">
            <span :style="{ color: repo.statusColor(item.task.status) }">{{
              item.task.status
            }}</span>
            <span>{{ item.task.area }}</span>
            <span v-if="item.task.branch" style="color: var(--cyan)">{{ item.task.branch }}</span>
          </div>
        </div>
      </div>
    </div>
  </Card>
</template>

<style scoped>
/* Notice rows reuse the feed vocabulary; only the extras are bespoke. */
.notice-unread {
  font-weight: 700;
  color: var(--txt);
}
.kind-tag {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  margin-right: 6px;
}
.notice-detail {
  color: var(--txt-faint);
  font-size: 12px;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}
.notice-dismiss {
  flex: none;
  display: grid;
  place-items: center;
  width: 22px;
  height: 22px;
  margin-left: 8px;
  border: none;
  background: none;
  color: var(--txt-faint);
  font-size: 12px;
  border-radius: 6px;
  cursor: pointer;
}
.notice-dismiss:hover,
.notice-dismiss:focus-visible {
  color: var(--txt);
  background: var(--panel-solid);
  border: 1px solid var(--border);
}
.notice-dismiss:focus-visible {
  outline: 2px solid var(--cyan);
}
</style>
