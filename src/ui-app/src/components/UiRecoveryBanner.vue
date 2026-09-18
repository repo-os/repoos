<script setup lang="ts">
import { computed } from "vue";
import { RotateCcw, WifiOff } from "lucide-vue-next";
import { dismissRecovery, reloadNow, uiRecoveryState } from "../lib/uiRecovery";

const recovery = uiRecoveryState();
const title = computed(() =>
  recovery.kind === "stale" ? "New RepoOS build detected" : "Server connection issue",
);
</script>

<template>
  <div v-if="recovery.kind" class="ui-recovery-banner" role="alert">
    <WifiOff v-if="recovery.kind === 'offline'" class="size-[18px]" />
    <RotateCcw v-else class="size-[18px]" />
    <div class="ui-recovery-copy">
      <strong>{{ title }}</strong>
      <span>{{ recovery.message }}</span>
      <small v-if="recovery.newBuild">Build {{ recovery.newBuild.slice(0, 12) }} is ready.</small>
    </div>
    <button type="button" class="ui-recovery-action" @click="reloadNow">
      {{ recovery.kind === "stale" ? "Reload now" : "Retry / reload" }}
    </button>
    <button type="button" class="ui-recovery-dismiss" @click="dismissRecovery">Dismiss</button>
  </div>
</template>

<style scoped>
.ui-recovery-banner {
  position: fixed;
  z-index: 1000;
  inset: 12px 16px auto;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 13px 16px;
  border: 1px solid var(--orange, #f0a35b);
  border-radius: 10px;
  background: var(--panel, #171b2b);
  color: var(--txt, #f5f7ff);
  box-shadow: 0 8px 30px #0008;
}
.ui-recovery-copy {
  display: grid;
  gap: 2px;
  flex: 1;
}
.ui-recovery-copy span {
  color: var(--txt-muted, #b7bdd1);
}
.ui-recovery-copy small {
  color: var(--txt-faint, #8e96af);
}
.ui-recovery-action {
  white-space: nowrap;
}
.ui-recovery-dismiss {
  white-space: nowrap;
  color: var(--txt-muted, #b7bdd1);
}
</style>
