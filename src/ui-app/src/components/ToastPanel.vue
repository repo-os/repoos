<script setup lang="ts">
import { storeToRefs } from "pinia";
import { X, CheckCircle2, AlertCircle, Info } from "lucide-vue-next";
import { useRepoStore } from "../stores/repo";

const repo = useRepoStore();
const { toasts } = storeToRefs(repo);

const ICONS = {
  error: AlertCircle,
  success: CheckCircle2,
  info: Info,
};

const COLORS: Record<string, { bg: string; border: string; icon: string }> = {
  error: { bg: "var(--red-tint)", border: "var(--red-border-tint)", icon: "var(--red)" },
  success: { bg: "var(--green-tint)", border: "var(--green-border-tint)", icon: "var(--green)" },
  info: { bg: "var(--cyan-dim)", border: "rgba(57,224,255,0.25)", icon: "var(--cyan)" },
};
</script>

<template>
  <TransitionGroup
    tag="div"
    class="toast-panel"
    name="toast"
    aria-live="assertive"
    aria-atomic="true"
  >
    <div
      v-for="toast in toasts"
      :key="toast.id"
      class="toast-item"
      :style="{
        background: COLORS[toast.type].bg,
        borderColor: COLORS[toast.type].border,
      }"
    >
      <component
        :is="ICONS[toast.type]"
        class="toast-icon size-[16px]"
        :style="{ color: COLORS[toast.type].icon }"
      />
      <span class="toast-message">{{ toast.message }}</span>
      <button
        type="button"
        class="toast-close"
        aria-label="Dismiss"
        @click="repo.removeToast(toast.id)"
      >
        <X class="size-[14px]" />
      </button>
    </div>
  </TransitionGroup>
</template>

<style scoped>
.toast-panel {
  position: fixed;
  top: calc(64px + var(--safe-top));
  right: 14px;
  z-index: 100;
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: min(360px, calc(100vw - 28px));
  pointer-events: none;
}
.toast-item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 11px 12px;
  border-radius: 10px;
  border: 1px solid;
  box-shadow: 0 10px 30px -10px rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(10px);
  pointer-events: auto;
}
.toast-message {
  flex: 1;
  font-size: 12.5px;
  line-height: 1.45;
  color: var(--txt);
  word-break: break-word;
}
.toast-close {
  display: grid;
  place-items: center;
  padding: 3px;
  margin: -3px -3px -3px 0;
  border-radius: 6px;
  color: var(--txt-dim);
  background: transparent;
  border: none;
  cursor: pointer;
  transition:
    color 0.15s,
    background-color 0.15s;
}
.toast-close:hover {
  color: var(--txt);
  background: rgba(255, 255, 255, 0.08);
}
.toast-enter-active,
.toast-leave-active {
  transition: all 0.25s ease;
}
.toast-enter-from {
  opacity: 0;
  transform: translateX(20px);
}
.toast-leave-to {
  opacity: 0;
  transform: translateX(20px);
}
</style>
