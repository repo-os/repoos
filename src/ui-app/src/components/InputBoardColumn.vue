<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import type { Input } from "../../../core/input.js";
import InputCard from "./InputCard.vue";
import { isInputColumnCollapsed, toggleInputColumnCollapsed } from "../lib/inputsBoardCollapse";

export interface InputColumn {
  id: string;
  label: string;
  color: string;
}

const props = withDefaults(
  defineProps<{
    col: InputColumn;
    items: Input[];
    emptyText?: string;
    inputLabel: (input: Input) => string;
    nextStatus: (status: Input["status"]) => Input["status"] | null;
  }>(),
  { emptyText: "—" },
);

const emit = defineEmits<{
  open: [input: Input];
  moveNext: [input: Input];
}>();

const collapsed = computed(() => isInputColumnCollapsed(props.col.id));

const bodyEl = ref<HTMLElement | null>(null);
const scrollable = ref(false);

let mo: MutationObserver | null = null;
let ro: ResizeObserver | null = null;

const checkScroll = () => {
  const el = bodyEl.value;
  scrollable.value = !!(el && el.scrollHeight > el.clientHeight + 1);
};

onMounted(() => {
  const el = bodyEl.value;
  if (!el) return;
  checkScroll();
  mo = new MutationObserver(() => checkScroll());
  mo.observe(el, { childList: true, subtree: true });
  if ("ResizeObserver" in window) {
    ro = new ResizeObserver(() => checkScroll());
    ro.observe(el);
  }
  window.addEventListener("resize", checkScroll);
});
onUnmounted(() => {
  mo?.disconnect();
  ro?.disconnect();
  window.removeEventListener("resize", checkScroll);
});
watch(collapsed, () => nextTick(checkScroll));

const fillFraction = computed(() => {
  const n = props.items.length;
  if (n <= 0) return 0;
  return Math.min(1, 0.15 + Math.log10(n + 1) * 0.42);
});

const capStyle = computed(() =>
  collapsed.value
    ? { "--cap-color": props.col.color, "--cap-fill": String(fillFraction.value) }
    : undefined,
);

const barTextColor = computed(() => {
  const hex = props.col.color.replace("#", "");
  if (hex.length < 6) return "#ffffff";
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return 0.299 * r + 0.587 * g + 0.114 * b > 140 ? "#0e1220" : "#ffffff";
});

const toggle = () => toggleInputColumnCollapsed(props.col.id);
</script>

<template>
  <div class="board-col" :class="{ collapsed, scrollable }">
    <div
      class="col-head"
      role="button"
      tabindex="0"
      :aria-expanded="!collapsed"
      :style="capStyle"
      @click="toggle"
      @keydown.enter="toggle"
      @keydown.space.prevent="toggle"
    >
      <div v-if="collapsed" class="col-cap">
        <span class="col-cap-count" :style="{ color: barTextColor }">{{ items.length }}</span>
      </div>
      <span
        v-else
        class="cdot"
        :style="{ background: col.color, boxShadow: '0 0 6px ' + col.color }"
      ></span>
      <span class="col-label">{{ col.label }}</span>
      <span v-if="!collapsed" class="col-count">{{ items.length }}</span>
      <svg class="col-chev" viewBox="0 0 24 24" fill="none">
        <path
          d="m6 9 6 6 6-6"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
    </div>
    <div ref="bodyEl" class="col-body">
      <InputCard
        v-for="i in items"
        :key="i.id"
        :input="i"
        :input-label="inputLabel(i)"
        :next-status="nextStatus(i.status)"
        @open="emit('open', i)"
        @move-next="emit('moveNext', i)"
      />
      <div v-if="!items.length" class="col-empty">{{ emptyText }}</div>
    </div>
  </div>
</template>
