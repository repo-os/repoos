<script setup lang="ts">
import { storeToRefs } from "pinia";
import { useRepoStore } from "../stores/repo";
import { useUiStore } from "../stores/ui";
import Card from "./ui/card.vue";
import Button from "./ui/button.vue";

const repo = useRepoStore();
const ui = useUiStore();
const { humanNeeds } = storeToRefs(repo);
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
        humanNeeds.length
      }}</span>
    </div>
    <div v-if="!humanNeeds.length" class="feed-empty needs-empty">
      <div>Nothing needs your attention right now.</div>
      <Button size="sm" variant="outline" class="needs-cta" @click="ui.openNewTask('human')">
        New task for me
      </Button>
    </div>
    <div v-else class="feed">
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
