<script setup lang="ts">
import { computed, ref } from "vue";
import { Copy, LoaderCircle, RotateCcw, WifiOff } from "lucide-vue-next";
import { dismissRecovery, reloadNow, uiRecoveryState } from "../lib/uiRecovery";
import Button from "./ui/button.vue";

const recovery = uiRecoveryState();
const server = computed(() => {
  const name = recovery.projectName ? `${recovery.projectName} server` : "RepoOS server";
  return recovery.origin ? `${name} at ${recovery.origin}` : name;
});
const title = computed(() => {
  if (recovery.kind === "stale") return "New RepoOS build available";
  // #0959: a refused connection and a timeout are different problems.
  if (recovery.offlineReason === "down") return `${server.value} is not running`;
  if (recovery.offlineReason === "slow") return `${server.value} is not responding`;
  return "Server connection issue";
});
const lastReached = computed(() =>
  recovery.lastReachedAt
    ? `Last reached at ${new Date(recovery.lastReachedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}.`
    : null,
);
const showRestart = computed(
  () =>
    recovery.kind === "offline" && recovery.offlineReason !== "slow" && !!recovery.restartCommand,
);
const copied = ref(false);
async function copyRestart(): Promise<void> {
  if (!recovery.restartCommand) return;
  try {
    await navigator.clipboard.writeText(recovery.restartCommand);
    copied.value = true;
    setTimeout(() => (copied.value = false), 1500);
  } catch {
    /* clipboard blocked: the command stays visible to copy by hand */
  }
}
const detail = computed(() => {
  if (recovery.reloading) return recovery.message;
  if (recovery.kind !== "stale") {
    if (recovery.offlineReason === "down")
      return "The connection was refused: nothing is listening on this port. Restart the server, then retry.";
    if (recovery.offlineReason === "slow")
      return "It is running but did not answer in time. It may be busy; retry in a moment.";
    return recovery.message;
  }

  const build = recovery.newBuild ? recovery.newBuild.slice(0, 12) : "New build";
  const readyAt = recovery.newBuildAt
    ? new Date(recovery.newBuildAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : null;
  return readyAt ? `${build} ready at ${readyAt}` : `${build} ready`;
});
</script>

<template>
  <Teleport to="body">
    <div v-if="recovery.kind" class="ui-recovery-banner" data-overlay-layer="floating" role="alert">
      <LoaderCircle v-if="recovery.reloading" class="ui-recovery-icon ui-recovery-spinner" />
      <WifiOff v-else-if="recovery.kind === 'offline'" class="ui-recovery-icon" />
      <RotateCcw v-else class="ui-recovery-icon" />
      <div class="ui-recovery-copy">
        <strong>{{ title }}</strong>
        <small>{{ detail }}</small>
        <small v-if="recovery.kind === 'offline' && lastReached">{{ lastReached }}</small>
        <small
          v-if="recovery.kind === 'offline' && recovery.probeResult"
          data-test-id="ui-recovery-probe"
          >{{ recovery.probeResult }}</small
        >
        <div v-if="showRestart" class="ui-recovery-restart" data-test-id="ui-recovery-restart">
          <code>{{ recovery.restartCommand }}</code>
          <Button variant="ghost" size="sm" @click="void copyRestart()">
            <Copy class="size-3.5" />{{ copied ? "Copied" : "Copy" }}
          </Button>
        </div>
      </div>
      <div class="ui-recovery-actions">
        <Button variant="accent" size="sm" :disabled="recovery.reloading" @click="void reloadNow()">
          {{
            recovery.reloading
              ? "Please wait…"
              : recovery.kind === "stale"
                ? "Reload"
                : "Retry / reload"
          }}
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
  width: min(560px, calc(100vw - 32px));
  transform: translateX(-50%);
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 13px 16px;
  /* hardcode-ok: var() fallback for a theme token — renders only when that token is undefined */
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
  min-width: 0;
}
.ui-recovery-copy strong,
.ui-recovery-copy small {
  white-space: normal;
  overflow-wrap: anywhere;
}
.ui-recovery-copy small {
  /* hardcode-ok: var() fallback for a theme token — renders only when that token is undefined */
  color: var(--txt-muted, #b7bdd1);
  font-size: 12px;
  line-height: 1.35;
}
.ui-recovery-restart {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 4px;
  min-width: 0;
}
.ui-recovery-restart code {
  flex: 1;
  min-width: 0;
  overflow-wrap: anywhere;
  font-size: 12px;
  padding: 4px 6px;
  border-radius: 6px;
  /* hardcode-ok: var() fallback for a theme token — renders only when that token is undefined */
  background: var(--bg-2, #0f1220);
}
.ui-recovery-actions {
  display: flex;
  flex: none;
  align-items: center;
  gap: 4px;
}
.ui-recovery-spinner {
  animation: ui-recovery-spin 0.9s linear infinite;
}
@keyframes ui-recovery-spin {
  to {
    transform: rotate(360deg);
  }
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
  .ui-recovery-copy strong,
  .ui-recovery-copy small {
    white-space: normal;
  }
  .ui-recovery-actions {
    width: 100%;
    justify-content: flex-end;
  }
}
</style>
