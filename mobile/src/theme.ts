/**
 * Theme + appearance for the RepoOS Hub native shell — mirrors the web app's
 * design themes and light/dark/system appearance, persisted on device.
 */
import { Preferences } from "@capacitor/preferences";
import { StatusBar, Style as StatusBarStyle } from "@capacitor/status-bar";
import { Capacitor } from "@capacitor/core";

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

export function applyThemesToDocument(design: DesignThemeId, mode: AppearanceMode): ResolvedAppearance {
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

export async function syncNativeChrome(design: DesignThemeId, mode: AppearanceMode): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  const appearance = resolveAppearance(mode);
  try {
    await StatusBar.setStyle({
      style: appearance === "light" ? StatusBarStyle.Light : StatusBarStyle.Dark,
    });
    await StatusBar.setBackgroundColor({ color: themeColorFor(design, appearance) });
  } catch {
    /* status bar plugin unavailable in browser dev */
  }
}

async function prefGet(key: string): Promise<string | null> {
  try {
    const { value } = await Preferences.get({ key });
    return value;
  } catch {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }
}

async function prefSet(key: string, value: string): Promise<void> {
  try {
    await Preferences.set({ key, value });
  } catch {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* in-memory only */
    }
  }
}

export async function loadThemePrefs(): Promise<{
  design: DesignThemeId;
  appearanceMode: AppearanceMode;
}> {
  const [rawDesign, rawAppearance] = await Promise.all([
    prefGet(DESIGN_KEY),
    prefGet(APPEARANCE_KEY),
  ]);
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

export async function saveDesignTheme(design: DesignThemeId): Promise<void> {
  await prefSet(DESIGN_KEY, design);
  mirrorToLocalStorage(DESIGN_KEY, design);
}

export async function saveAppearanceMode(mode: AppearanceMode): Promise<void> {
  await prefSet(APPEARANCE_KEY, mode);
  mirrorToLocalStorage(APPEARANCE_KEY, mode);
}

/** Synchronous read for inline index.html boot — localStorage mirror only. */
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