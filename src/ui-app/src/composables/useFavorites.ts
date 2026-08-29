import { computed, ref } from "vue";

export interface Favorite {
  cli: string;
  model: string;
  addedAt: number;
}

const FAVORITES_STORAGE_KEY = "agent-model-favorites";

function loadFavorites(): Favorite[] {
  try {
    const stored = localStorage.getItem(FAVORITES_STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function saveFavorites(favorites: Favorite[]): void {
  try {
    localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(favorites));
  } catch (e) {
    // localStorage quota exceeded or unavailable; data loss is silent but graceful
    // (favs persist in memory for this session only)
    const err = e instanceof Error ? e.message : String(e);
    console.warn(`[useFavorites] Failed to persist favorites: ${err}`);
  }
}

export function useFavorites() {
  const favorites = ref<Favorite[]>(loadFavorites());

  function isFavorite(cli: string, model: string): boolean {
    return favorites.value.some((f) => f.cli === cli && f.model === model);
  }

  function toggleFavorite(cli: string, model: string): void {
    if (isFavorite(cli, model)) {
      favorites.value = favorites.value.filter((f) => !(f.cli === cli && f.model === model));
    } else {
      favorites.value.push({
        cli,
        model,
        addedAt: Date.now(),
      });
    }
    saveFavorites(favorites.value);
  }

  function getFavoritesForCli(cli: string): Favorite[] {
    return favorites.value.filter((f) => f.cli === cli).sort((a, b) => b.addedAt - a.addedAt);
  }

  const hasFavorites = computed(() => favorites.value.length > 0);

  return {
    favorites,
    isFavorite,
    toggleFavorite,
    getFavoritesForCli,
    hasFavorites,
  };
}
