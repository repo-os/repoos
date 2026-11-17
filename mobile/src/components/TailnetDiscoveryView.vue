<script setup lang="ts">
import { computed } from "vue";
import { Check, ChevronLeft, Radar, Server } from "lucide-vue-next";
import type { DiscoveredServer } from "../tailnet";

const props = defineProps<{
  busy: boolean;
  trustedName: string;
  trustedUrl: string;
  message: string;
  error: string;
  servers: DiscoveredServer[];
  selected: string[];
  platform: "ios" | "android" | "web";
}>();

const emit = defineEmits<{
  back: [];
  toggle: [key: string];
  add: [];
  manual: [];
}>();

const selectableCount = computed(() => props.servers.filter((server) => server.selectable).length);
const failedServers = computed(() =>
  props.servers.filter((server) => server.note?.startsWith("Unreachable")),
);
const projectServers = computed(() =>
  props.servers.filter((server) => !server.note?.startsWith("Unreachable")),
);

function isSelected(key: string): boolean {
  return props.selected.includes(key);
}
</script>

<template>
  <div class="form-view" data-testid="hub-tailnet-discovery">
    <header class="subhead" :class="{ 'is-ios': platform === 'ios' }">
      <button type="button" class="back-btn" data-testid="hub-discovery-back" @click="emit('back')">
        <ChevronLeft :size="22" />
        <span>Servers</span>
      </button>
      <h1 class="subhead-title">Find servers on my tailnet</h1>
    </header>

    <div class="settings-scroll discovery-scroll">
      <div class="discovery-trust">
        <Radar :size="18" aria-hidden="true" />
        <div class="discovery-trust-copy">
          <p class="hint">
            Asks <strong>{{ trustedName || "your trusted server" }}</strong> for the RepoOS servers
            it can see on your tailnet. Your phone doesn't scan or broadcast anything.
          </p>
          <span class="discovery-trust-host">{{ trustedUrl }}</span>
        </div>
      </div>

      <div v-if="busy" class="state-center discovery-state" data-testid="hub-discovery-busy">
        <Radar class="discovery-spin" :size="34" aria-hidden="true" />
        <p class="hero-sub">
          {{ servers.length ? "Saving the servers you picked…" : "Looking for RepoOS servers…" }}
        </p>
      </div>

      <template v-else>
        <p v-if="message" class="discovery-message" data-testid="hub-discovery-message">
          {{ message }}
        </p>
        <p v-if="error" class="warn" data-testid="hub-discovery-error">{{ error }}</p>

        <ul v-if="projectServers.length" class="discovery-list">
          <li v-for="server in projectServers" :key="server.key">
            <button
              type="button"
              class="discovery-card"
              :class="{
                selected: isSelected(server.key),
                saved: server.saved,
                'not-selectable': !server.selectable,
              }"
              :disabled="!server.selectable || busy"
              :aria-pressed="isSelected(server.key)"
              data-testid="hub-tailnet-result"
              @click="emit('toggle', server.key)"
            >
              <span v-if="platform === 'android'" class="discovery-avatar" aria-hidden="true">
                <Server :size="20" />
              </span>
              <span v-else class="discovery-avatar" aria-hidden="true">
                {{ server.name.slice(0, 1).toUpperCase() }}
              </span>
              <span class="server-meta">
                <span class="server-name">{{ server.name }}</span>
                <span class="server-host">{{ server.url || server.host }}</span>
                <span
                  v-if="server.note"
                  class="reachability"
                  :class="server.saved ? 'reachable' : 'unreachable'"
                >
                  <span class="reach-dot" aria-hidden="true" />
                  {{ server.note }}
                </span>
              </span>
              <span
                class="discovery-check"
                :class="{ checked: isSelected(server.key), saved: server.saved }"
                aria-hidden="true"
              >
                <Check v-if="isSelected(server.key) || server.saved" :size="16" />
              </span>
            </button>
          </li>
        </ul>

        <details
          v-if="failedServers.length"
          class="discovery-failures"
          data-testid="hub-tailnet-failures"
        >
          <summary>Couldn't check these machines ({{ failedServers.length }})</summary>
          <ul class="discovery-list">
            <li v-for="server in failedServers" :key="server.key" class="discovery-failure-row">
              <span class="server-meta">
                <span class="server-name">{{ server.name }}</span>
                <span class="reachability unreachable">{{
                  server.note?.replace(/^Unreachable\s*—?\s*/, "")
                }}</span>
              </span>
            </li>
          </ul>
        </details>

        <p v-else-if="!message && !error" class="hint">
          No RepoOS servers answered from this server's tailnet.
        </p>
      </template>
    </div>

    <div v-if="!busy" class="discovery-actions">
      <button
        v-if="projectServers.length"
        type="button"
        class="btn-primary block"
        :disabled="selected.length === 0"
        data-testid="hub-add-discovered"
        @click="emit('add')"
      >
        {{ selected.length ? `Add ${selected.length} selected` : "Select servers to add" }}
      </button>
      <button
        v-else
        type="button"
        class="btn-ghost block"
        data-testid="hub-discovery-add-manual"
        @click="emit('manual')"
      >
        Add server by URL
      </button>
      <p v-if="projectServers.length && !selectableCount" class="hint discovery-footnote">
        Nothing left to add. Saved and non-HTTPS servers stay listed so you can see why.
      </p>
    </div>
  </div>
</template>
