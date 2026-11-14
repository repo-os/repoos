<script setup lang="ts">
import { computed, ref } from "vue";
import { ChevronRight, GripVertical, MoreVertical, Plus, Server } from "lucide-vue-next";
import type { ServerEntry, ReachabilityState } from "../types";
import HubLogo from "./HubLogo.vue";
import { impactMedium } from "../haptics";

const props = defineProps<{
  servers: ServerEntry[];
  selectedId: string | null;
  reachability: Record<string, ReachabilityState>;
  loaded: boolean;
  platform: "ios" | "android" | "web";
}>();

const emit = defineEmits<{
  select: [server: ServerEntry];
  add: [];
  edit: [server: ServerEntry];
  reorder: [id: string, toIndex: number];
}>();

const editMode = ref(false);
const dragId = ref<string | null>(null);

const isEmpty = computed(() => props.loaded && props.servers.length === 0);

function hostLabel(url: string): string {
  return url.replace(/^https:\/\//, "");
}

function statusLabel(state: ReachabilityState | undefined): string {
  if (state === "reachable") return "Reachable";
  if (state === "unreachable") return "Unreachable";
  if (state === "checking") return "Checking…";
  return "";
}

function onDragStart(id: string, ev: DragEvent) {
  dragId.value = id;
  if (ev.dataTransfer) {
    ev.dataTransfer.effectAllowed = "move";
    ev.dataTransfer.setData("text/plain", id);
  }
}

function onDrop(targetId: string) {
  if (!dragId.value || dragId.value === targetId) return;
  const from = props.servers.findIndex((s) => s.id === dragId.value);
  const to = props.servers.findIndex((s) => s.id === targetId);
  if (from < 0 || to < 0) return;
  emit("reorder", dragId.value, to);
  void impactMedium();
  dragId.value = null;
}

function toggleEdit() {
  editMode.value = !editMode.value;
}
</script>

<template>
  <div class="server-list-view" data-testid="hub-server-list">
    <div v-if="!loaded" class="state-center muted">Loading…</div>

    <div v-else-if="isEmpty" class="state-center empty-state" data-testid="hub-empty-state">
      <HubLogo :size="56" />
      <h1 class="hero-title">Add your first server</h1>
      <p class="hero-sub">
        Enter the address of a self-hosted RepoOS instance. It's saved on this device only — never
        sent anywhere.
      </p>
      <button type="button" class="btn-primary" data-testid="hub-add-server" @click="emit('add')">
        <Plus :size="18" stroke-width="2.5" />
        Add server
      </button>
    </div>

    <template v-else>
      <div class="list-toolbar">
        <button
          type="button"
          class="btn-text"
          :aria-pressed="editMode"
          data-testid="hub-edit-toggle"
          @click="toggleEdit"
        >
          {{ editMode ? "Done" : "Edit" }}
        </button>
      </div>

      <ul
        class="server-list"
        :class="{ 'is-ios': platform === 'ios', 'is-android': platform === 'android' }"
      >
        <li
          v-for="server in servers"
          :key="server.id"
          class="server-card"
          :class="{ selected: selectedId === server.id, 'edit-mode': editMode }"
          :draggable="editMode"
          data-testid="hub-server-card"
          @dragstart="onDragStart(server.id, $event)"
          @dragover.prevent
          @drop.prevent="onDrop(server.id)"
        >
          <button
            v-if="editMode"
            type="button"
            class="drag-handle"
            aria-label="Drag to reorder"
            tabindex="-1"
          >
            <GripVertical :size="20" />
          </button>

          <button
            type="button"
            class="server-row"
            @click="editMode ? undefined : emit('select', server)"
          >
            <span class="server-avatar" aria-hidden="true">
              <Server v-if="platform === 'android'" :size="20" />
              <template v-else>{{ server.name.slice(0, 1).toUpperCase() }}</template>
            </span>
            <span class="server-meta">
              <span class="server-name">{{ server.name }}</span>
              <span class="server-host">{{ hostLabel(server.url) }}</span>
              <span
                v-if="statusLabel(reachability[server.id])"
                class="reachability"
                :class="reachability[server.id]"
              >
                <span class="reach-dot" aria-hidden="true" />
                {{ statusLabel(reachability[server.id]) }}
              </span>
            </span>
            <ChevronRight v-if="!editMode" class="chevron" :size="20" />
          </button>
          <button
            type="button"
            class="more-btn"
            :aria-label="`Edit ${server.name}`"
            data-testid="hub-server-more"
            @click="emit('edit', server)"
          >
            <MoreVertical :size="20" />
          </button>
        </li>
      </ul>

      <button type="button" class="btn-primary block" data-testid="hub-add-server" @click="emit('add')">
        <Plus :size="18" stroke-width="2.5" />
        Add server
      </button>
    </template>
  </div>
</template>