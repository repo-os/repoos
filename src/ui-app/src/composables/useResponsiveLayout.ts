import { onMounted, onUnmounted, readonly, ref } from "vue";

/** The phone shell follows available CSS width, including resize and rotation. */
export function useResponsiveLayout() {
  const isNarrow = ref(false);
  let query: MediaQueryList | undefined;

  const sync = (): void => {
    isNarrow.value = query?.matches ?? window.innerWidth < 720;
  };

  onMounted(() => {
    query = window.matchMedia("(max-width: 719.98px)");
    sync();
    query.addEventListener("change", sync);
  });
  onUnmounted(() => query?.removeEventListener("change", sync));

  return { isNarrow: readonly(isNarrow) };
}
