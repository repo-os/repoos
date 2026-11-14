import { onMounted, onUnmounted, readonly, ref } from "vue";

/** The phone shell follows available CSS width, including resize and rotation. */
export function useResponsiveLayout() {
  const isNarrow = ref(false);
  let query: MediaQueryList | undefined;

  const sync = (): void => {
    isNarrow.value = query?.matches ?? window.innerWidth < 720;
  };
  const onResize = (): void => {
    isNarrow.value = window.innerWidth < 720;
  };

  onMounted(() => {
    if (typeof window.matchMedia === "function") {
      query = window.matchMedia("(max-width: 719.98px)");
      sync();
      query.addEventListener("change", sync);
    } else {
      onResize();
      window.addEventListener("resize", onResize);
    }
  });
  onUnmounted(() => {
    query?.removeEventListener("change", sync);
    window.removeEventListener("resize", onResize);
  });

  return { isNarrow: readonly(isNarrow) };
}
