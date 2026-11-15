<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref } from "vue";
import { ChevronRight, MoreVertical, Plus, Radar, Server } from "lucide-vue-next";
import type { ServerEntry, ReachabilityState } from "../types";
import HubLogo from "./HubLogo.vue";
import { impactLight, impactMedium } from "../haptics";

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
  discover: [];
}>();

/** How long a row must be held before it lifts and starts following the finger. */
const HOLD_MS = 350;
/** Movement beyond this before the hold fires is a scroll, not a long press. */
const MOVE_SLOP_PX = 10;
/** How close to the list edge the finger must be before the list auto-scrolls. */
const EDGE_SCROLL_PX = 56;

const listEl = ref<HTMLUListElement | null>(null);
/** The row currently lifted under the finger, if any. */
const draggingId = ref<string | null>(null);
/** Display order while dragging; null means "use the saved order". */
const dragOrder = ref<string[] | null>(null);

const isEmpty = computed(() => props.loaded && props.servers.length === 0);

const displayed = computed<ServerEntry[]>(() => {
  const order = dragOrder.value;
  if (!order) return props.servers;
  const byId = new Map(props.servers.map((server) => [server.id, server]));
  const ordered: ServerEntry[] = [];
  for (const id of order) {
    const server = byId.get(id);
    if (server) ordered.push(server);
  }
  // A server added mid-drag (unlikely) still shows up.
  for (const server of props.servers) {
    if (!order.includes(server.id)) ordered.push(server);
  }
  return ordered;
});

let holdTimer: ReturnType<typeof setTimeout> | null = null;
let pendingId: string | null = null;
let pendingStartX = 0;
let pendingStartY = 0;
let pointerX = 0;
let pointerY = 0;
let scrollFrame: number | null = null;
/** Clicks landing right after a drop must not open the server. */
let ignoreClickUntil = 0;

function hostLabel(url: string): string {
  return url.replace(/^https:\/\//, "");
}

function statusLabel(state: ReachabilityState | undefined): string {
  if (state === "reachable") return "Reachable";
  if (state === "unreachable") return "Unreachable";
  if (state === "checking") return "Checking…";
  return "";
}

function detachPointerListeners() {
  window.removeEventListener("pointermove", onPointerMove);
  window.removeEventListener("pointerup", onPointerUp);
  window.removeEventListener("pointercancel", onPointerCancel);
  window.removeEventListener("touchmove", blockTouchScroll);
}

function cancelPending() {
  if (holdTimer !== null) {
    clearTimeout(holdTimer);
    holdTimer = null;
  }
  pendingId = null;
  detachPointerListeners();
}

function onPointerDown(server: ServerEntry, ev: PointerEvent) {
  if (draggingId.value) return;
  if (ev.pointerType === "mouse" && ev.button !== 0) return;
  // A fresh gesture is a real tap again, even right after a drop.
  ignoreClickUntil = 0;
  cancelPending();
  pendingId = server.id;
  pendingStartX = ev.clientX;
  pendingStartY = ev.clientY;
  pointerX = ev.clientX;
  pointerY = ev.clientY;
  holdTimer = setTimeout(() => beginDrag(), HOLD_MS);
  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", onPointerUp);
  window.addEventListener("pointercancel", onPointerCancel);
}

function beginDrag() {
  holdTimer = null;
  if (!pendingId) return;
  draggingId.value = pendingId;
  dragOrder.value = displayed.value.map((server) => server.id);
  pendingId = null;
  // The browser must not scroll the list from under the held row. The listener
  // is non-passive and added before the first move after the hold, so it can
  // still cancel the gesture the browser would otherwise treat as a pan.
  window.addEventListener("touchmove", blockTouchScroll, { passive: false });
  // Android fires a context menu for a long press on text; the rows already
  // opt out of selection, this covers the rest of the gesture.
  void impactMedium();
  startAutoScroll();
}

function blockTouchScroll(ev: TouchEvent) {
  ev.preventDefault();
}

function moveDraggedOver(overId: string) {
  const draggedId = draggingId.value;
  const order = dragOrder.value;
  if (!draggedId || !order || overId === draggedId) return;
  const from = order.indexOf(draggedId);
  const to = order.indexOf(overId);
  if (from < 0 || to < 0 || from === to) return;
  const next = order.slice();
  next.splice(from, 1);
  next.splice(to, 0, draggedId);
  dragOrder.value = next;
  void impactLight();
}

function rowUnder(x: number, y: number): string | null {
  if (typeof document.elementFromPoint !== "function") return null;
  const el = document.elementFromPoint(x, y);
  if (!(el instanceof Element)) return null;
  const row = el.closest<HTMLElement>("[data-server-id]");
  const id = row?.dataset.serverId;
  return id && id !== draggingId.value ? id : null;
}

function onPointerMove(ev: PointerEvent) {
  pointerX = ev.clientX;
  pointerY = ev.clientY;
  if (!draggingId.value) {
    const dx = ev.clientX - pendingStartX;
    const dy = ev.clientY - pendingStartY;
    if (Math.hypot(dx, dy) > MOVE_SLOP_PX) cancelPending();
    return;
  }
  ev.preventDefault();
  const overId = rowUnder(ev.clientX, ev.clientY);
  if (overId) moveDraggedOver(overId);
}

function onPointerUp() {
  if (!draggingId.value) {
    cancelPending();
    return;
  }
  const id = draggingId.value;
  const to = dragOrder.value?.indexOf(id) ?? -1;
  const from = props.servers.findIndex((server) => server.id === id);
  ignoreClickUntil = Date.now() + 600;
  stopDrag();
  if (to >= 0 && to !== from) {
    emit("reorder", id, to);
    void impactMedium();
  }
}

function onPointerCancel() {
  if (draggingId.value) {
    ignoreClickUntil = Date.now() + 600;
    stopDrag();
    return;
  }
  cancelPending();
}

function stopDrag() {
  stopAutoScroll();
  detachPointerListeners();
  draggingId.value = null;
  pendingId = null;
  // Keep the dragged order on screen until the parent's list catches up.
  void nextTick(() => {
    dragOrder.value = null;
  });
}

function startAutoScroll() {
  if (typeof requestAnimationFrame !== "function") return;
  const step = () => {
    const list = listEl.value;
    if (!draggingId.value || !list) {
      scrollFrame = null;
      return;
    }
    scrollFrame = requestAnimationFrame(step);
    const rect = list.getBoundingClientRect();
    let delta = 0;
    if (pointerY < rect.top + EDGE_SCROLL_PX) {
      delta = -Math.ceil((rect.top + EDGE_SCROLL_PX - pointerY) / 3);
    } else if (pointerY > rect.bottom - EDGE_SCROLL_PX) {
      delta = Math.ceil((pointerY - (rect.bottom - EDGE_SCROLL_PX)) / 3);
    }
    if (delta !== 0) {
      list.scrollTop += Math.max(-18, Math.min(18, delta));
      const overId = rowUnder(pointerX, pointerY);
      if (overId) moveDraggedOver(overId);
    }
  };
  scrollFrame = requestAnimationFrame(step);
}

function stopAutoScroll() {
  if (scrollFrame !== null) {
    cancelAnimationFrame(scrollFrame);
    scrollFrame = null;
  }
}

function onListScroll() {
  // Momentum from an earlier fling must not arm a long press on a moving list.
  if (!draggingId.value && pendingId) cancelPending();
}

function onRowClick(server: ServerEntry) {
  if (Date.now() < ignoreClickUntil) return;
  emit("select", server);
}

onBeforeUnmount(() => {
  cancelPending();
  stopAutoScroll();
});
</script>

<template>
  <div class="server-list-view" data-testid="hub-server-list">
    <div v-if="!loaded" class="state-center muted">Loading…</div>

    <template v-else>
      <div v-if="isEmpty" class="state-center empty-state" data-testid="hub-empty-state">
        <HubLogo :size="56" />
        <h1 class="hero-title">Add your first server</h1>
        <p class="hero-sub">
          Enter the address of a self-hosted RepoOS instance. It's saved on this device only — never
          sent anywhere.
        </p>
      </div>

      <ul
        v-else
        ref="listEl"
        class="server-list"
        :class="{
          'is-ios': platform === 'ios',
          'is-android': platform === 'android',
          'is-dragging': draggingId !== null,
        }"
        @scroll.passive="onListScroll"
        @contextmenu.prevent
      >
        <li
          v-for="server in displayed"
          :key="server.id"
          class="server-card"
          :class="{ selected: selectedId === server.id, dragging: draggingId === server.id }"
          :data-server-id="server.id"
          data-testid="hub-server-card"
        >
          <button
            type="button"
            class="server-row"
            @pointerdown="onPointerDown(server, $event)"
            @click="onRowClick(server)"
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
            <ChevronRight class="chevron" :size="20" />
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

      <div class="picker-actions">
        <button
          type="button"
          class="btn-ghost block"
          data-testid="hub-find-tailnet"
          @click="emit('discover')"
        >
          <Radar :size="18" stroke-width="2.2" />
          Find servers on my tailnet
        </button>
        <button
          type="button"
          class="btn-primary block"
          data-testid="hub-add-server"
          @click="emit('add')"
        >
          <Plus :size="18" stroke-width="2.5" />
          Add server
        </button>
      </div>
    </template>
  </div>
</template>
