<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";
import { useRepoStore } from "../stores/repo";
import { useConfigStore } from "../stores/config";
import RepoGuideChat from "./RepoGuideChat.vue";
import CTOPanel from "./CTOPanel.vue";
import DebuggerChat from "./DebuggerChat.vue";

const repo = useRepoStore();
const config = useConfigStore();

function agentEnabled(head: string): boolean {
  if (head === "cto") {
    return config.agents.some((a) => a.name.toLowerCase() === "cto" && a.enabled);
  }
  if (head === "ross") {
    return config.agents.some((a) => (a.name.toLowerCase() === "ross" || a.name.toLowerCase() === "repoos guide") && a.enabled);
  }
  if (head === "debugger") {
    const data = config.data as Record<string, unknown> | null;
    const agents = data?.builtInAgents as Record<string, { enabled?: boolean }> | undefined;
    return Boolean(agents?.debugger?.enabled);
  }
  return false;
}

const activeHead = ref<string | null>(null);

function toggle(head: string) {
  activeHead.value = activeHead.value === head ? null : head;
}

const openDebugger = () => { activeHead.value = "debugger"; };
onMounted(() => window.addEventListener("repoos:open-debugger", openDebugger));
onBeforeUnmount(() => window.removeEventListener("repoos:open-debugger", openDebugger));
</script>

<template>
  <div class="floating-heads" :class="{ 'any-open': activeHead }">
    <CTOPanel :open="activeHead === 'cto'" @close="activeHead = null" />
    <RepoGuideChat :open="activeHead === 'ross'" @close="activeHead = null" />
    <DebuggerChat :open="activeHead === 'debugger'" @close="activeHead = null" />

    <div class="stack">
      <button
        v-if="agentEnabled('debugger')"
        class="head-btn"
        :class="{ active: activeHead === 'debugger' }"
        title="Debugger — diagnose a bug"
        @click="toggle('debugger')"
      >
        <img src="/assets/repoos-orchestrator-square.webp" alt="Debugger" />
      </button>
      <button
        v-if="agentEnabled('cto')"
        class="head-btn"
        :class="{ active: activeHead === 'cto' }"
        title="CTO Board Monitor"
        @click="toggle('cto')"
      >
        <img src="/assets/repoos-cto-square.webp" alt="CTO" />
        <i v-if="repo.cto.running" class="live-dot"></i>
      </button>
      <button
        v-if="agentEnabled('ross')"
        class="head-btn"
        :class="{ active: activeHead === 'ross' }"
        title="Ross — Repo assistant"
        @click="toggle('ross')"
      >
        <img src="/assets/repoos-ross-from-friends-square.webp" alt="Ross" />
        <i v-if="repo.runningIds.includes('repoos-guide')" class="live-dot"></i>
      </button>
    </div>
  </div>
</template>

<style scoped>
.floating-heads {
  position: fixed;
  right: 22px;
  bottom: 22px;
  z-index: 70;
  pointer-events: none;
}

.floating-heads.any-open {
  bottom: 18px;
}

.stack {
  display: flex;
  flex-direction: column-reverse;
  gap: 8px;
  pointer-events: auto;
}

.head-btn {
  position: relative;
  width: 52px;
  height: 52px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 2px solid var(--border-bright);
  border-radius: 50%;
  background: var(--panel-solid);
  box-shadow: 0 14px 36px rgba(0,0,0,.24);
  cursor: pointer;
  transition: transform .18s ease, box-shadow .18s ease;
  overflow: hidden;
}

.head-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 17px 42px rgba(0,0,0,.3);
}

.head-btn.active {
  border-color: var(--cyan);
  box-shadow: 0 0 0 3px var(--cyan-dim), 0 14px 36px rgba(0,0,0,.24);
}

.head-btn img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 50%;
}

.live-dot {
  position: absolute;
  top: 2px;
  right: 2px;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--green);
  box-shadow: 0 0 8px var(--green);
  animation: head-pulse 1.2s infinite;
  border: 2px solid var(--panel-solid);
}

@keyframes head-pulse {
  50% { opacity: .35 }
}

@media(max-width: 760px) {
  .floating-heads {
    right: 12px;
    bottom: calc(74px + var(--safe-bot));
  }
  .floating-heads.any-open {
    left: 12px;
  }
  .head-btn {
    width: 46px;
    height: 46px;
  }
}

@media(prefers-reduced-motion: reduce) {
  .head-btn, .live-dot {
    animation: none;
    transition: none;
  }
}
</style>
