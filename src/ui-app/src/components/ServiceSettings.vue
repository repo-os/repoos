<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { api } from "../api";
import Button from "../components/ui/button.vue";
import Card from "../components/ui/card.vue";
import Switch from "../components/ui/switch.vue";

interface ServiceInfo {
  id: string;
  root: string;
  port: number;
  platform: string;
  label: string;
  autoStart: boolean;
  status: "running" | "stopped" | "error" | "unknown" | "disabled";
  lastHealthCheck: string | null;
  healthError: string | null;
  createdAt: string;
}

const service = ref<ServiceInfo | null>(null);
const loading = ref(true);
const actionPending = ref<string | null>(null);
const errorMsg = ref("");
const lingerEnabled = ref<boolean | null>(null);

async function refreshStatus(): Promise<void> {
  loading.value = true;
  errorMsg.value = "";
  try {
    const res = (await api("/api/service/status")) as { ok: boolean; service: ServiceInfo | null };
    service.value = res.service ?? null;
  } catch {
    service.value = null;
  } finally {
    loading.value = false;
  }
}

async function refreshLinger(): Promise<void> {
  try {
    const res = (await api("/api/service/list")) as { lingerEnabled: boolean | null };
    lingerEnabled.value = res.lingerEnabled;
  } catch {
    lingerEnabled.value = null;
  }
}

async function install(): Promise<void> {
  actionPending.value = "install";
  errorMsg.value = "";
  try {
    const res = (await api("/api/service/install", { method: "POST" })) as {
      ok: boolean;
      service?: ServiceInfo;
      error?: string;
    };
    if (!res.ok) {
      errorMsg.value = res.error ?? "Install failed";
      return;
    }
    service.value = res.service ?? null;
  } catch (e) {
    errorMsg.value = e instanceof Error ? e.message : "Install failed";
  } finally {
    actionPending.value = null;
  }
}

async function start(): Promise<void> {
  actionPending.value = "start";
  errorMsg.value = "";
  try {
    await api("/api/service/start", { method: "POST" });
    await refreshStatus();
  } catch (e) {
    errorMsg.value = e instanceof Error ? e.message : "Start failed";
  } finally {
    actionPending.value = null;
  }
}

async function stop(): Promise<void> {
  actionPending.value = "stop";
  errorMsg.value = "";
  try {
    await api("/api/service/stop", { method: "POST" });
    await refreshStatus();
  } catch (e) {
    errorMsg.value = e instanceof Error ? e.message : "Stop failed";
  } finally {
    actionPending.value = null;
  }
}

async function restart(): Promise<void> {
  actionPending.value = "restart";
  errorMsg.value = "";
  try {
    await api("/api/service/restart", { method: "POST" });
    await refreshStatus();
  } catch (e) {
    errorMsg.value = e instanceof Error ? e.message : "Restart failed";
  } finally {
    actionPending.value = null;
  }
}

async function toggleAutoStart(checked: boolean): Promise<void> {
  actionPending.value = checked ? "enable" : "disable";
  errorMsg.value = "";
  try {
    await api(checked ? "/api/service/enable" : "/api/service/disable", { method: "POST" });
    await refreshStatus();
  } catch (e) {
    errorMsg.value = e instanceof Error ? e.message : "Failed to toggle auto-start";
  } finally {
    actionPending.value = null;
  }
}

async function remove(): Promise<void> {
  if (
    !window.confirm("Remove the background service? This stops it and deletes all service files.")
  )
    return;
  actionPending.value = "remove";
  errorMsg.value = "";
  try {
    await api("/api/service/remove", { method: "POST" });
    service.value = null;
  } catch (e) {
    errorMsg.value = e instanceof Error ? e.message : "Remove failed";
  } finally {
    actionPending.value = null;
  }
}

async function runHealthCheck(): Promise<void> {
  actionPending.value = "health";
  errorMsg.value = "";
  try {
    await api("/api/service/health", { method: "POST" });
    await refreshStatus();
  } catch (e) {
    errorMsg.value = e instanceof Error ? e.message : "Health check failed";
  } finally {
    actionPending.value = null;
  }
}

const statusColor = computed(() => {
  switch (service.value?.status) {
    case "running":
      return "var(--green)";
    case "stopped":
    case "disabled":
      return "var(--txt-dim)";
    case "error":
      return "var(--red)";
    default:
      return "var(--txt-faint)";
  }
});

const statusLabel = computed(() => {
  switch (service.value?.status) {
    case "running":
      return "Running";
    case "stopped":
      return "Stopped";
    case "disabled":
      return "Disabled";
    case "error":
      return "Needs attention";
    default:
      return "Not installed";
  }
});

const isBusy = computed(() => actionPending.value !== null);

onMounted(() => {
  refreshStatus();
  refreshLinger();
});
</script>

<template>
  <Card style="padding: 0 18px 6px; margin-bottom: 16px">
    <div class="setting-group">
      <div class="sec-label" style="padding-top: 16px; margin-bottom: 0">
        <span class="live-dot"></span>Background Service
      </div>

      <div v-if="loading" class="setting-row">
        <div class="setting-info">
          <div class="setting-desc">Loading service status…</div>
        </div>
      </div>

      <template v-else>
        <!-- Not installed -->
        <div v-if="!service" class="setting-row">
          <div class="setting-info">
            <div class="setting-label">Run this repo in the background</div>
            <div class="setting-desc">
              Install a background service so this repo's server starts automatically and survives
              terminal close, reboot, and crashes. Off by default — each repo must be explicitly
              enabled.
            </div>
          </div>
          <div class="setting-input">
            <Button size="sm" variant="outline" :disabled="isBusy" @click="install">
              {{ actionPending === "install" ? "Installing…" : "Install service" }}
            </Button>
          </div>
        </div>

        <!-- Installed -->
        <template v-else>
          <div class="setting-row">
            <div class="setting-info">
              <div class="setting-label">
                Service status:
                <span :style="{ color: statusColor }">{{ statusLabel }}</span>
              </div>
              <div class="setting-desc">
                {{ service.root }} · port {{ service.port }} · {{ service.platform }}
              </div>
              <div v-if="service.healthError" class="setting-desc" style="color: var(--red)">
                {{ service.healthError }}
              </div>
            </div>
            <div class="setting-input svc-actions">
              <Button
                v-if="service.status !== 'running'"
                size="sm"
                variant="outline"
                :disabled="isBusy"
                @click="start"
              >
                {{ actionPending === "start" ? "Starting…" : "Start" }}
              </Button>
              <Button
                v-if="service.status === 'running'"
                size="sm"
                variant="outline"
                :disabled="isBusy"
                @click="stop"
              >
                {{ actionPending === "stop" ? "Stopping…" : "Stop" }}
              </Button>
              <Button
                v-if="service.status === 'running'"
                size="sm"
                variant="outline"
                :disabled="isBusy"
                @click="restart"
              >
                {{ actionPending === "restart" ? "Restarting…" : "Restart" }}
              </Button>
              <Button size="sm" variant="ghost" :disabled="isBusy" @click="refreshStatus">
                Refresh
              </Button>
            </div>
          </div>

          <div class="setting-row">
            <div class="setting-info">
              <div class="setting-label">Start at login</div>
              <div class="setting-desc">
                When enabled, the service starts automatically when you log in. This uses
                {{
                  service.platform === "launchd" ? "a macOS LaunchAgent" : "a systemd user unit"
                }}.
              </div>
            </div>
            <div class="setting-input">
              <Switch
                :checked="service.autoStart"
                :disabled="isBusy"
                @update:checked="toggleAutoStart"
              />
            </div>
          </div>

          <div class="setting-row">
            <div class="setting-info">
              <div class="setting-label">Service details</div>
              <div class="setting-desc">
                <span class="mono">{{ service.label }}</span>
                <span v-if="service.lastHealthCheck" style="margin-left: 8px">
                  Last health check: {{ new Date(service.lastHealthCheck).toLocaleString() }}
                </span>
              </div>
            </div>
            <div class="setting-input svc-actions">
              <Button size="sm" variant="ghost" :disabled="isBusy" @click="runHealthCheck">
                {{ actionPending === "health" ? "Checking…" : "Health check" }}
              </Button>
              <Button size="sm" variant="destructive" :disabled="isBusy" @click="remove">
                {{ actionPending === "remove" ? "Removing…" : "Remove service" }}
              </Button>
            </div>
          </div>
        </template>

        <!-- Linux linger guidance -->
        <div
          v-if="service && service.platform === 'systemd' && lingerEnabled === false"
          class="setting-row"
        >
          <div class="setting-info">
            <div class="setting-label" style="color: var(--yellow)">⚠ Linger not enabled</div>
            <div class="setting-desc">
              Systemd user services stop on logout unless lingering is enabled. To keep this service
              running after you close your terminal or log out:
              <code>loginctl enable-linger {{ "$USER" }}</code>
            </div>
          </div>
        </div>

        <div v-if="errorMsg" class="setting-desc" style="color: var(--red); padding-bottom: 10px">
          {{ errorMsg }}
        </div>
      </template>
    </div>
  </Card>
</template>

<style scoped>
.svc-actions {
  display: flex;
  gap: 6px;
  align-items: center;
  flex-wrap: wrap;
}
</style>
