import { ref, type Ref } from "vue";

/** One list shared by the global bar and the settings-scoped overlay (per spec). */
const recentSearches = ref<string[]>([]);

export type RecentSearchScope = "all" | "settings";

export function useRecentSearches(_scope: RecentSearchScope): {
  recentSearches: Ref<string[]>;
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
