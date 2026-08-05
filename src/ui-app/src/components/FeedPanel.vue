<script setup lang="ts">
import { storeToRefs } from "pinia";
import { useRepoStore } from "../stores/repo";
import Card from "./ui/card.vue";

const repo = useRepoStore();
const { connected, feed } = storeToRefs(repo);
</script>

<template>
  <Card>
    <div class="panel-head">
      <div class="panel-title">
        <svg viewBox="0 0 24 24" fill="none">
          <path
            d="M3 12h4l3 8 4-16 3 8h4"
            stroke="currentColor"
            stroke-width="1.8"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
        Live activity
      </div>
      <span
        class="tag"
        :style="
          connected
            ? 'background:var(--tag-stream-bg);color:var(--tag-stream-color)'
            : 'background:var(--tag-reconnect-bg);color:var(--tag-reconnect-color)'
        "
      >
        {{ connected ? "streaming" : "reconnecting" }}
      </span>
    </div>
    <div class="feed">
      <div v-if="!feed.length" class="feed-empty">
        No activity yet. Edit a task file or change a status — events stream here in real time.
      </div>
      <div class="feed-item" v-for="f in feed" :key="f.key">
        <div
          class="feed-dot"
          :style="{ background: f.color, boxShadow: '0 0 7px ' + f.color }"
        ></div>
        <div class="feed-line"></div>
        <div style="flex: 1; min-width: 0">
          <div class="feed-msg" v-html="f.msg"></div>
          <div class="feed-meta">
            <span>{{ f.kind }}</span
            ><span>{{ f.time }}</span>
          </div>
        </div>
      </div>
    </div>
  </Card>
</template>
