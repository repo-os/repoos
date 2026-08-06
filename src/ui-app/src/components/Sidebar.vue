<script setup lang="ts">
import { storeToRefs } from "pinia";
import { NAV } from "../nav";
import { useRepoStore } from "../stores/repo";
import { useConfigStore } from "../stores/config";

const repo = useRepoStore();
const config = useConfigStore();
const { connected, eventCount, total, backlogCount } = storeToRefs(repo);

function setUiTheme(t: string): void {
  void config.setUiTheme(t);
}
</script>

<template>
  <div class="sidebar">
    <RouterLink
      v-for="n in NAV"
      :key="n.id"
      :to="n.path"
      class="nav-item"
      active-class="active"
      exact-active-class="active"
    >
      <span v-html="n.icon"></span>{{ n.label }}
      <span v-if="n.id === 'work' && backlogCount" class="nav-badge">{{ backlogCount }}</span>
    </RouterLink>

    <div class="side-foot">
      <div class="row"><span>server</span><b>{{ connected ? "connected" : "—" }}</b></div>
      <div class="row"><span>tasks</span><b>{{ total }}</b></div>
      <div class="row"><span>events</span><b>{{ eventCount }}</b></div>
    </div>

    <div class="theme-switch" role="group" aria-label="Design theme">
      <button
        :class="{ on: config.uiTheme === 'classic' }"
        type="button"
        :aria-pressed="config.uiTheme === 'classic'"
        @click="setUiTheme('classic')"
      >
        Classic
      </button>
      <button
        :class="{ on: config.uiTheme === 'clear' }"
        type="button"
        :aria-pressed="config.uiTheme === 'clear'"
        @click="setUiTheme('clear')"
      >
        Clear
      </button>
    </div>
  </div>
</template>
