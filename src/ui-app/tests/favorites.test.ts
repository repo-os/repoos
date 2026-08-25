import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { useFavorites } from "../src/composables/useFavorites";

describe("useFavorites", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe("isFavorite", () => {
    it("returns false for non-favorited items", () => {
      const { isFavorite } = useFavorites();
      expect(isFavorite("claude", "opus")).toBe(false);
    });

    it("returns true for favorited items", () => {
      const { isFavorite, toggleFavorite } = useFavorites();
      toggleFavorite("claude", "opus");
      expect(isFavorite("claude", "opus")).toBe(true);
    });
  });

  describe("toggleFavorite", () => {
    it("adds a favorite", () => {
      const { isFavorite, toggleFavorite } = useFavorites();
      toggleFavorite("claude", "opus");
      expect(isFavorite("claude", "opus")).toBe(true);
    });

    it("removes a favorite", () => {
      const { isFavorite, toggleFavorite } = useFavorites();
      toggleFavorite("claude", "opus");
      toggleFavorite("claude", "opus");
      expect(isFavorite("claude", "opus")).toBe(false);
    });

    it("persists to localStorage", () => {
      const { toggleFavorite } = useFavorites();
      toggleFavorite("claude", "opus");

      const stored = JSON.parse(localStorage.getItem("agent-model-favorites") || "[]");
      expect(stored).toHaveLength(1);
      expect(stored[0]).toMatchObject({ cli: "claude", model: "opus" });
      expect(stored[0].addedAt).toBeDefined();
    });

    it("adds addedAt timestamp", () => {
      const { favorites, toggleFavorite } = useFavorites();
      const before = Date.now();
      toggleFavorite("claude", "opus");
      const after = Date.now();

      expect(favorites.value[0].addedAt).toBeGreaterThanOrEqual(before);
      expect(favorites.value[0].addedAt).toBeLessThanOrEqual(after);
    });

    it("allows multiple favorites for same CLI", () => {
      const { toggleFavorite, favorites } = useFavorites();
      toggleFavorite("claude", "opus");
      toggleFavorite("claude", "sonnet");

      expect(favorites.value).toHaveLength(2);
      expect(favorites.value).toContainEqual(
        expect.objectContaining({ cli: "claude", model: "opus" }),
      );
      expect(favorites.value).toContainEqual(
        expect.objectContaining({ cli: "claude", model: "sonnet" }),
      );
    });

    it("allows same model across different CLIs", () => {
      const { toggleFavorite, favorites } = useFavorites();
      toggleFavorite("claude", "opus");
      toggleFavorite("repoos", "opus");

      expect(favorites.value).toHaveLength(2);
    });
  });

  describe("getFavoritesForCli", () => {
    it("returns empty array when no favorites exist", () => {
      const { getFavoritesForCli } = useFavorites();
      expect(getFavoritesForCli("claude")).toEqual([]);
    });

    it("returns only favorites for specified CLI", () => {
      const { toggleFavorite, getFavoritesForCli } = useFavorites();
      toggleFavorite("claude", "opus");
      toggleFavorite("claude", "sonnet");
      toggleFavorite("repoos", "fable");

      const claudeFavs = getFavoritesForCli("claude");
      expect(claudeFavs).toHaveLength(2);
      expect(claudeFavs.every((f) => f.cli === "claude")).toBe(true);

      const repoosFavs = getFavoritesForCli("repoos");
      expect(repoosFavs).toHaveLength(1);
      expect(repoosFavs[0]).toMatchObject({ cli: "repoos", model: "fable" });
    });

    it("returns favorites sorted by most recent first", () => {
      const { toggleFavorite, getFavoritesForCli, favorites } = useFavorites();
      toggleFavorite("claude", "opus");

      // Mock time passage by manually adjusting the first favorite's timestamp
      favorites.value[0].addedAt = Date.now() - 1000;

      toggleFavorite("claude", "sonnet");

      const favs = getFavoritesForCli("claude");
      expect(favs[0].model).toBe("sonnet");
      expect(favs[1].model).toBe("opus");
    });
  });

  describe("hasFavorites", () => {
    it("returns false when no favorites exist", () => {
      const { hasFavorites } = useFavorites();
      expect(hasFavorites.value).toBe(false);
    });

    it("returns true when favorites exist", () => {
      const { toggleFavorite, hasFavorites } = useFavorites();
      toggleFavorite("claude", "opus");
      expect(hasFavorites.value).toBe(true);
    });
  });

  describe("persistence", () => {
    it("loads favorites from localStorage on creation", () => {
      const stored = JSON.stringify([
        { cli: "claude", model: "opus", addedAt: Date.now() },
        { cli: "repoos", model: "fable", addedAt: Date.now() },
      ]);
      localStorage.setItem("agent-model-favorites", stored);

      const { favorites } = useFavorites();
      expect(favorites.value).toHaveLength(2);
      expect(favorites.value[0]).toMatchObject({ cli: "claude", model: "opus" });
    });

    it("handles corrupted localStorage data gracefully", () => {
      localStorage.setItem("agent-model-favorites", "invalid json");
      const { favorites } = useFavorites();
      expect(favorites.value).toEqual([]);
    });

    it("persists updates to localStorage", () => {
      const { toggleFavorite } = useFavorites();
      toggleFavorite("claude", "opus");
      toggleFavorite("claude", "sonnet");

      const stored = JSON.parse(localStorage.getItem("agent-model-favorites") || "[]");
      expect(stored).toHaveLength(2);

      toggleFavorite("claude", "opus");
      const updated = JSON.parse(localStorage.getItem("agent-model-favorites") || "[]");
      expect(updated).toHaveLength(1);
      expect(updated[0].model).toBe("sonnet");
    });
  });
});
