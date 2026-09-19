<script setup lang="ts">
/**
 * The shared "Jump to latest" control for every AI chat (#0444).
 *
 * Teleported to <body> on purpose: inside a drawer or floating panel a
 * `position: fixed` child is trapped in that panel's stacking context and ends
 * up unclickable. Because it leaves the chat's DOM, its position is derived
 * from the log element's rect, which keeps it pinned just above the compose row
 * wherever that ends up on screen.
 *
 * Feed it `showJumpToLatest` from `useChatScroll()` and wire `@click` to
 * `scrollToLatest()`.
 */
import { onBeforeUnmount, onMounted, ref, watch } from "vue";

const props = withDefaults(
  defineProps<{
    /** `showJumpToLatest` from useChatScroll(). */
    visible: boolean;
    /** The scrolling log element the button hovers above. */
    anchor: HTMLElement | null;
    label?: string;
  }>(),
  { label: "Jump to latest" },
);

const emit = defineEmits<{ click: [] }>();

const style = ref<Record<string, string>>({});
let observer: ResizeObserver | null = null;
// The log's rect can move without anything resizing — a drawer sliding in, a
// tab transition, a panel being dragged. Re-measuring each frame while the
// button is on screen is one getBoundingClientRect per frame and keeps it
// pinned; the loop stops the moment the button hides.
let frame = 0;

function measure(): void {
  const el = props.anchor;
  if (!el || typeof window === "undefined") return;
  const rect = el.getBoundingClientRect();
  // Derived from the anchor's rect (we're in <body>, not inside the chat), and
  // clamped to the viewport so a yet-to-be-laid-out anchor can't push the
  // button off screen.
  const clamp = (value: number, extent: number): number =>
    Math.min(Math.max(8, Math.round(value)), Math.max(8, extent - 8));
  const next = {
    bottom: `${clamp(window.innerHeight - rect.bottom + 12, window.innerHeight)}px`,
    right: `${clamp(window.innerWidth - rect.right + 14, window.innerWidth)}px`,
  };
  // Assigning every frame would re-render on every frame; only a real move
  // changes anything.
  if (next.bottom !== style.value.bottom || next.right !== style.value.right) style.value = next;
}

/** Re-measure every frame while visible; rect moves are not always resizes. */
function follow(): void {
  if (!props.visible) {
    frame = 0;
    return;
  }
  measure();
  frame = requestAnimationFrame(follow);
}

function startFollowing(): void {
  if (frame !== 0 || typeof requestAnimationFrame === "undefined") return;
  frame = requestAnimationFrame(follow);
}

function stopFollowing(): void {
  if (frame !== 0) {
    cancelAnimationFrame(frame);
    frame = 0;
  }
}

function track(): void {
  observer?.disconnect();
  observer = null;
  const el = props.anchor;
  if (el && typeof ResizeObserver !== "undefined") {
    observer = new ResizeObserver(measure);
    observer.observe(el);
  }
  measure();
}

watch(() => props.anchor, track);
watch(
  () => props.visible,
  (visible) => {
    if (visible) {
      measure();
      startFollowing();
    } else {
      stopFollowing();
    }
  },
);

onMounted(() => {
  track();
  if (props.visible) startFollowing();
  if (typeof window !== "undefined") window.addEventListener("resize", measure);
});

onBeforeUnmount(() => {
  observer?.disconnect();
  observer = null;
  stopFollowing();
  if (typeof window !== "undefined") window.removeEventListener("resize", measure);
});
</script>

<template>
  <Teleport to="body">
    <button
      v-if="visible"
      type="button"
      class="chat-jump-latest"
      data-testid="chat-jump-latest"
      :style="style"
      :aria-label="label"
      @click="emit('click')"
    >
      <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
        <path
          d="M5 8l5 5 5-5"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
      <span>{{ label }}</span>
    </button>
  </Teleport>
</template>
