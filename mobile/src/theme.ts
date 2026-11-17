/**
 * Theme persistence + native chrome (Capacitor). App code imports this module;
 * cross-repo tests import `theme-core.ts` only.
 */
import { Preferences } from "@capacitor/preferences";
import { StatusBar, Style as StatusBarStyle } from "@capacitor/status-bar";
import { Capacitor, registerPlugin } from "@capacitor/core";
import {
  APPEARANCE_KEY,
  DESIGN_KEY,
  applyThemesToDocument,
  mirrorAppearanceMode,
  mirrorDesignTheme,
  normalizeAppearanceMode,
  normalizeDesignThemeId,
  resolveAppearance,
  themeColorFor,
  type AppearanceMode,
  type DesignThemeId,
} from "./theme-core";

export * from "./theme-core";

interface HubSystemChromePlugin {
  setWindowBackgroundColor(options: { color: string }): Promise<void>;
}

const HubSystemChrome = registerPlugin<HubSystemChromePlugin>("HubSystemChrome");

export async function syncNativeChrome(design: DesignThemeId, mode: AppearanceMode): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  const appearance = resolveAppearance(mode);
  const backgroundColor = themeColorFor(design, appearance);
  try {
    if (Capacitor.getPlatform() === "android") {
      // Android 16 ignores statusBarColor for target SDK 36. The transparent
      // status-bar region reveals the Activity window background instead.
      await HubSystemChrome.setWindowBackgroundColor({ color: backgroundColor });
    }
    await StatusBar.setStyle({
      style: appearance === "light" ? StatusBarStyle.Light : StatusBarStyle.Dark,
    });
    await StatusBar.setBackgroundColor({ color: backgroundColor });
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

export async function saveDesignTheme(design: DesignThemeId): Promise<void> {
  await prefSet(DESIGN_KEY, design);
  mirrorDesignTheme(design);
}

export async function saveAppearanceMode(mode: AppearanceMode): Promise<void> {
  await prefSet(APPEARANCE_KEY, mode);
  mirrorAppearanceMode(mode);
}

export { applyThemesToDocument };
