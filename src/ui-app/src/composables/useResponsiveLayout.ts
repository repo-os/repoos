import { onMounted, onUnmounted, readonly, ref } from "vue";

/** The phone shell follows available CSS width, including resize and rotation. */
export function useResponsiveLayout() {
  const isNarrow = ref(false);
  let query: MediaQueryList | undefined;
  let listeningForResize = false;
  let listeningForLegacyChange = false;

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
      if (typeof query.addEventListener === "function") {
        query.addEventListener("change", sync);
      } else if (typeof query.addListener === "function") {
        // Older WebViews may expose the legacy MediaQueryList listener API.
        query.addListener(sync);
        listeningForLegacyChange = true;
      } else {
        // Lightweight test doubles may omit both MediaQueryList APIs.
        onResize();
        window.addEventListener("resize", onResize);
        listeningForResize = true;
      }
    } else {
      onResize();
      window.addEventListener("resize", onResize);
    }
  });
  onUnmounted(() => {
    if (typeof query?.removeEventListener === "function") {
      query.removeEventListener("change", sync);
    }
    if (listeningForLegacyChange) query?.removeListener?.(sync);
    if (listeningForResize || !query) window.removeEventListener("resize", onResize);
  });

  return { isNarrow: readonly(isNarrow) };
}
