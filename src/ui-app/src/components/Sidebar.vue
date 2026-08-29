<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { storeToRefs } from "pinia";
import { NAV } from "../nav";
import { useRepoStore } from "../stores/repo";
import { useConfigStore } from "../stores/config";
import { relTime } from "../lib/time";
import { CANARY_PROMPT } from "../../../core/canary.js";
import CanaryConfirmDialog from "./CanaryConfirmDialog.vue";

const repo = useRepoStore();
const config = useConfigStore();
const { connected, eventCount, total, health } = storeToRefs(repo);

const canaryDigit = computed(() => health.value?.canaryCounter ?? 0);
const canaryRunning = ref(false);
const canaryOpen = ref(false);
async function runCanary(): Promise<void> {
  if (canaryRunning.value) return;
  canaryRunning.value = true;
  try {
    await repo.createFreeformTask(CANARY_PROMPT);
    canaryOpen.value = false;
    repo.pushToast("Canary task created — watch it move through the flow", "info");
  } catch {
    // createFreeformTask already surfaces a toast on failure
  } finally {
    canaryRunning.value = false;
  }
}

function setUiTheme(t: string): void {
  void config.setUiTheme(t);
}

const now = ref(Date.now());
let tick: ReturnType<typeof setInterval> | null = null;
onMounted(() => {
  tick = setInterval(() => {
    now.value = Date.now();
  }, 1000);
});
onBeforeUnmount(() => {
  if (tick) clearInterval(tick);
});

const version = computed(() => (health.value?.version ? `v${health.value.version}` : ""));
const age = computed(() => relTime(health.value?.buildAt ?? null, new Date(now.value)));
const buildTitle = computed(() =>
  health.value?.buildAt ? `Built ${new Date(health.value.buildAt).toLocaleString()}` : "Build info unavailable",
);
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
      <button
        :class="{ on: config.uiTheme === 'gen z' }"
        type="button"
        :aria-pressed="config.uiTheme === 'gen z'"
        @click="setUiTheme('gen z')"
      >
        Gen Z
      </button>
      <button
        :class="{ on: config.uiTheme === 'jelly' }"
        type="button"
        :aria-pressed="config.uiTheme === 'jelly'"
        @click="setUiTheme('jelly')"
      >
        Jelly
      </button>
    </div>

    <div class="build-widget" :title="buildTitle">
      <span v-if="version" class="build-ver">{{ version }}</span>
      <span class="build-age">{{ age }}</span>
      <button
        type="button"
        class="canary-egg"
        :class="{ busy: canaryRunning }"
        :disabled="canaryRunning"
        title="Run the canary flow test — a trivial task that walks draft → inbox → ready → active → review → done"
        aria-label="Run canary flow test"
        @click="canaryOpen = true"
      >
        {{ canaryDigit }}
      </button>
    </div>

    <CanaryConfirmDialog
      :open="canaryOpen"
      :busy="canaryRunning"
      @update:open="canaryOpen = $event"
      @confirm="runCanary"
    />
  </div>
</template>
