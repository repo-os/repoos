import { ref, type Ref } from "vue";

export type RecentSearchScope = "all" | "settings";

const recentByScope: Record<RecentSearchScope, Ref<string[]>> = {
  all: ref<string[]>([]),
  settings: ref<string[]>([]),
};

export function useRecentSearches(scope: RecentSearchScope): {
  recentSearches: Ref<string[]>;
  addRecentSearch: (q: string) => void;
} {
  const recentSearches = recentByScope[scope];
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
