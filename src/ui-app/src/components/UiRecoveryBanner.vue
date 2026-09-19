<script setup lang="ts">
import { computed } from "vue";
import { RotateCcw, WifiOff } from "lucide-vue-next";
import { dismissRecovery, reloadNow, uiRecoveryState } from "../lib/uiRecovery";
import Button from "./ui/button.vue";

const recovery = uiRecoveryState();
const title = computed(() =>
  recovery.kind === "stale" ? "New RepoOS build available" : "Server connection issue",
);
const detail = computed(() => {
  if (recovery.kind !== "stale") return recovery.message;

  const build = recovery.newBuild ? `Build ${recovery.newBuild.slice(0, 12)}` : "New build";
  const readyAt = recovery.newBuildAt
    ? new Date(recovery.newBuildAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : null;
  return readyAt ? `${build} ready at ${readyAt}` : `${build} ready`;
});
</script>

<template>
  <Teleport to="body">
    <div v-if="recovery.kind" class="ui-recovery-banner" role="alert">
      <WifiOff v-if="recovery.kind === 'offline'" class="ui-recovery-icon" />
      <RotateCcw v-else class="ui-recovery-icon" />
      <div class="ui-recovery-copy">
        <strong>{{ title }}</strong>
        <small>{{ detail }}</small>
      </div>
      <div class="ui-recovery-actions">
        <Button variant="accent" size="sm" @click="reloadNow">
          {{ recovery.kind === "stale" ? "Reload now" : "Retry / reload" }}
        </Button>
        <Button variant="ghost" size="sm" @click="dismissRecovery">Dismiss</Button>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.ui-recovery-banner {
  position: fixed;
  z-index: 1000;
  top: 16px;
  left: 50%;
  width: min(460px, calc(100vw - 32px));
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 13px 16px;
  border: 1px solid var(--orange, #f0a35b);
  border-radius: 12px;
  background: var(--panel-solid, #171b2b);
  color: var(--txt, #f5f7ff);
  box-shadow: 0 12px 32px #0009;
}
.ui-recovery-icon {
  width: 18px;
  height: 18px;
  flex: none;
}
.ui-recovery-copy {
  display: grid;
  gap: 2px;
  flex: 1;
}
.ui-recovery-copy small {
  color: var(--txt-muted, #b7bdd1);
  font-size: 12px;
}
.ui-recovery-actions {
  display: flex;
  flex: none;
  align-items: center;
  gap: 4px;
}
@media (max-width: 560px) {
  .ui-recovery-banner {
    align-items: flex-start;
    flex-wrap: wrap;
  }
  .ui-recovery-copy {
    min-width: 0;
    flex: 1;
  }
  .ui-recovery-actions {
    width: 100%;
    justify-content: flex-end;
  }
}
</style>
