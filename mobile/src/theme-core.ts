/**
 * Pure theme resolution for the Hub shell (no Capacitor imports — safe for
 * main-repo vitest / vue-tsc via test imports).
 */

export type AppearanceMode = "dark" | "light" | "system";
export type ResolvedAppearance = "dark" | "light";

export type DesignThemeId =
  | "classic"
  | "clear"
  | "gen z"
  | "jelly"
  | "gruvbox"
  | "catppuccin"
  | "solarized"
  | "hypercolor";

export interface DesignTheme {
  id: DesignThemeId;
  label: string;
}

export const DESIGN_THEMES: DesignTheme[] = [
  { id: "classic", label: "Classic" },
  { id: "clear", label: "Clear" },
  { id: "gen z", label: "Gen Z" },
  { id: "jelly", label: "Jelly" },
  { id: "gruvbox", label: "Gruvbox" },
  { id: "catppuccin", label: "Catppuccin" },
  { id: "solarized", label: "Solarized" },
  { id: "hypercolor", label: "Hypercolor" },
];

export const APPEARANCE_KEY = "repoos.hub.appearance";
export const DESIGN_KEY = "repoos.hub.uiTheme";

const THEME_COLOR: Record<string, string> = {
  "classic-dark": "#070a12",
  "classic-light": "#f4f6fb",
  "clear-dark": "#0a0c10",
  "clear-light": "#f6f8fc",
  "gen z-dark": "#0d0b14",
  "gen z-light": "#faf8ff",
  "jelly-dark": "#0a0e18",
  "jelly-light": "#f5f7ff",
  "gruvbox-dark": "#282828",
  "gruvbox-light": "#fbf1c7",
  "catppuccin-dark": "#1e1e2e",
  "catppuccin-light": "#eff1f5",
  "solarized-dark": "#002b36",
  "solarized-light": "#fdf6e3",
  "hypercolor-dark": "#0a0a0a",
  "hypercolor-light": "#f8f8f8",
};

export function normalizeDesignThemeId(raw: string | null | undefined): DesignThemeId | null {
  if (raw == null || raw === "") return null;
  const id = raw.trim().toLowerCase();
  const known = DESIGN_THEMES.find((t) => t.id === id);
  return known ? known.id : null;
}

export function normalizeAppearanceMode(raw: string | null | undefined): AppearanceMode | null {
  if (raw == null || raw === "") return null;
  const a = raw.trim().toLowerCase();
  if (a === "dark" || a === "light" || a === "system") return a;
  return null;
}

export function systemAppearance(): ResolvedAppearance {
  if (typeof window === "undefined") return "dark";
  if (typeof window.matchMedia !== "function") return "dark";
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

export function resolveAppearance(mode: AppearanceMode): ResolvedAppearance {
  if (mode === "system") return systemAppearance();
  return mode;
}

export function themeColorFor(design: DesignThemeId, appearance: ResolvedAppearance): string {
  const key = `${design}-${appearance}`;
  return THEME_COLOR[key] ?? THEME_COLOR[`classic-${appearance}`] ?? "#070a12";
}

export function applyThemesToDocument(
  design: DesignThemeId,
  mode: AppearanceMode,
): ResolvedAppearance {
  const el = document.documentElement;
  const appearance = resolveAppearance(mode);
  el.dataset.uiTheme = design;
  el.dataset.theme = appearance;
  el.style.colorScheme = appearance;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", themeColorFor(design, appearance));
  const scheme = document.querySelector('meta[name="color-scheme"]');
  if (scheme) scheme.setAttribute("content", appearance);
  return appearance;
}

export function bootThemeFromStorage(): { design: DesignThemeId; appearanceMode: AppearanceMode } {
  let rawDesign: string | null = null;
  let rawAppearance: string | null = null;
  try {
    rawDesign = localStorage.getItem(DESIGN_KEY);
    rawAppearance = localStorage.getItem(APPEARANCE_KEY);
  } catch {
    /* private mode */
  }
  return {
    design: normalizeDesignThemeId(rawDesign) ?? "classic",
    appearanceMode: normalizeAppearanceMode(rawAppearance) ?? "system",
  };
}

function mirrorToLocalStorage(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* boot script falls back to classic */
  }
}

export function mirrorThemePrefs(design: DesignThemeId, mode: AppearanceMode): void {
  mirrorToLocalStorage(DESIGN_KEY, design);
  mirrorToLocalStorage(APPEARANCE_KEY, mode);
}

export function mirrorDesignTheme(design: DesignThemeId): void {
  mirrorToLocalStorage(DESIGN_KEY, design);
}

export function mirrorAppearanceMode(mode: AppearanceMode): void {
  mirrorToLocalStorage(APPEARANCE_KEY, mode);
}
