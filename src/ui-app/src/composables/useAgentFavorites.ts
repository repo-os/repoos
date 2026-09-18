import { computed, ref } from "vue";

/**
 * Persistent localStorage-backed store for favorited coding agents (CLIs).
 *
 * This is separate from `useFavorites` (which stores agent+model pairs) — it
 * stores which *agent CLIs* the user has starred in the Detected Agents tab.
 * When at least one CLI is starred, the Agent+Model selector modal narrows
 * its CLI list to only the starred ones.
 */

const AGENT_FAVORITES_KEY = "agent-cli-favorites";

function loadAgentFavorites(): string[] {
  try {
    const stored = localStorage.getItem(AGENT_FAVORITES_KEY);
    return stored ? (JSON.parse(stored) as string[]) : [];
  } catch {
    return [];
  }
}

function saveAgentFavorites(ids: string[]): void {
  try {
    localStorage.setItem(AGENT_FAVORITES_KEY, JSON.stringify(ids));
  } catch (e) {
    const err = e instanceof Error ? e.message : String(e);
    console.warn(`[useAgentFavorites] Failed to persist agent favorites: ${err}`);
  }
}

export function useAgentFavorites() {
  const favoritedIds = ref<string[]>(loadAgentFavorites());

  function isAgentFavorite(id: string): boolean {
    return favoritedIds.value.includes(id);
  }

  function toggleAgentFavorite(id: string): void {
    if (isAgentFavorite(id)) {
      favoritedIds.value = favoritedIds.value.filter((f) => f !== id);
    } else {
      favoritedIds.value = [...favoritedIds.value, id];
    }
    saveAgentFavorites(favoritedIds.value);
  }

  /** True when the user has starred at least one agent CLI. */
  const hasAgentFavorites = computed(() => favoritedIds.value.length > 0);

  return {
    favoritedIds,
    isAgentFavorite,
    toggleAgentFavorite,
    hasAgentFavorites,
  };
}
