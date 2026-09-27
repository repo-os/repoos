import { ref } from "vue";

const recentSearches = ref<string[]>([]);

export function useRecentSearches(): {
  recentSearches: typeof recentSearches;
  addRecentSearch: (q: string) => void;
} {
  function addRecentSearch(q: string): void {
    const trimmed = q.trim();
    if (!trimmed) return;
    recentSearches.value = [trimmed, ...recentSearches.value.filter((s) => s !== trimmed)].slice(
      0,
      5,
    );
  }
  return { recentSearches, addRecentSearch };
}
