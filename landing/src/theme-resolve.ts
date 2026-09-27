/** Landing theme resolution (design theme + appearance). Boot: `theme-boot.ts`. */

export type Appearance = "dark" | "light";

/** `classic` or any future `data-ui-theme` id (gruvbox, catppuccin, …). */
export type DesignThemeId = string;

export const APPEARANCE_KEY = "repoos-theme";
export const DESIGN_KEY = "repoos-ui-theme";

export const URL_THEME_PARAM = "theme";
export const URL_APPEARANCE_PARAM = "appearance";
/** Alias for appearance — `?mode=light` */
export const URL_APPEARANCE_ALIASES = ["mode"] as const;

/** Picker-only themes today; URL may set any valid design id for forward compatibility. */
export const PICKER_DESIGN_THEMES = ["classic", "gruvbox"] as const;
export type PickerDesignTheme = (typeof PICKER_DESIGN_THEMES)[number];

const THEME_COLOR: Record<string, string> = {
  "classic-dark": "#070a12",
  "classic-light": "#f6f8fc",
  "gruvbox-dark": "#282828",
  "gruvbox-light": "#fbf1c7",
};

const DESIGN_ID_RE = /^[a-z][a-z0-9-]{0,31}$/;

export function normalizeDesignThemeId(raw: string | null | undefined): DesignThemeId | null {
  if (raw == null || raw === "") return null;
  const id = raw.trim().toLowerCase();
  if (id === "classic") return "classic";
  if (!DESIGN_ID_RE.test(id)) return null;
  return id;
}

export function normalizeAppearance(raw: string | null | undefined): Appearance | null {
  if (raw == null || raw === "") return null;
  const a = raw.trim().toLowerCase();
  if (a === "dark" || a === "light") return a;
  return null;
}

export function readThemeSearchParams(search: string): {
  design: DesignThemeId | null;
  appearance: Appearance | null;
} {
  const params = new URLSearchParams(search.startsWith("?") ? search : `?${search}`);
  let appearanceRaw = params.get(URL_APPEARANCE_PARAM);
  if (appearanceRaw == null) {
    for (const alias of URL_APPEARANCE_ALIASES) {
      const v = params.get(alias);
      if (v != null) {
        appearanceRaw = v;
        break;
      }
    }
  }
  return {
    design: normalizeDesignThemeId(params.get(URL_THEME_PARAM)),
    appearance: normalizeAppearance(appearanceRaw),
  };
}

function readStoredAppearance(): Appearance | null {
  try {
    const saved = localStorage.getItem(APPEARANCE_KEY);
    return saved === "light" || saved === "dark" ? saved : null;
  } catch {
    return null;
  }
}

function readStoredDesign(): DesignThemeId | null {
  try {
    const saved = localStorage.getItem(DESIGN_KEY);
    if (saved == null || saved === "") return null;
    return normalizeDesignThemeId(saved);
  } catch {
    return null;
  }
}

function systemAppearance(): Appearance {
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

export type ResolvedThemes = {
  design: DesignThemeId;
  appearance: Appearance;
  /** True when either axis came from the URL on this load. */
  fromUrl: boolean;
};

export function resolveThemes(search = window.location.search): ResolvedThemes {
  const fromUrl = readThemeSearchParams(search);
  let fromUrlHit = false;

  let appearance = fromUrl.appearance;
  if (appearance) {
    fromUrlHit = true;
  } else {
    appearance = readStoredAppearance() ?? systemAppearance();
  }

  let design = fromUrl.design;
  if (design) {
    fromUrlHit = true;
  } else {
    design = readStoredDesign() ?? "classic";
  }

  return { design, appearance, fromUrl: fromUrlHit };
}

export function themeColorFor(design: DesignThemeId, appearance: Appearance): string {
  return THEME_COLOR[`${design}-${appearance}`] ?? THEME_COLOR[`classic-${appearance}`]!;
}

export function applyDesignThemeToDocument(design: DesignThemeId): void {
  if (design === "classic") {
    document.documentElement.removeAttribute("data-ui-theme");
  } else {
    document.documentElement.setAttribute("data-ui-theme", design);
  }
}

export function applyAppearanceToDocument(appearance: Appearance): void {
  document.documentElement.setAttribute("data-theme", appearance);
}

export function applyResolvedThemes(resolved: ResolvedThemes): void {
  applyAppearanceToDocument(resolved.appearance);
  applyDesignThemeToDocument(resolved.design);
}

export function persistThemes(design: DesignThemeId, appearance: Appearance): void {
  try {
    localStorage.setItem(APPEARANCE_KEY, appearance);
    localStorage.setItem(DESIGN_KEY, design);
  } catch {
    // blocked storage
  }
}

export function syncThemeColorMeta(design: DesignThemeId, appearance: Appearance): void {
  const content = themeColorFor(design, appearance);
  let meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement("meta");
    meta.setAttribute("name", "theme-color");
    document.head.appendChild(meta);
  }
  meta.setAttribute("content", content);
}

export function readDesignFromDocument(): DesignThemeId {
  const attr = document.documentElement.getAttribute("data-ui-theme");
  if (!attr) return "classic";
  return normalizeDesignThemeId(attr) ?? "classic";
}

export function readAppearanceFromDocument(): Appearance {
  return document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
}

/** Update the query string to match the current axes (no navigation). */
export function syncThemeToUrl(design: DesignThemeId, appearance: Appearance): void {
  const params = new URLSearchParams(window.location.search);
  if (design === "classic") {
    params.delete(URL_THEME_PARAM);
  } else {
    params.set(URL_THEME_PARAM, design);
  }
  params.set(URL_APPEARANCE_PARAM, appearance);
  for (const alias of URL_APPEARANCE_ALIASES) {
    params.delete(alias);
  }
  const qs = params.toString();
  const next = qs
    ? `${window.location.pathname}?${qs}${window.location.hash}`
    : window.location.pathname + window.location.hash;
  window.history.replaceState(null, "", next);
}

export function pickerLabelForDesign(design: DesignThemeId): string {
  if (design === "classic") return "Classic";
  if (design === "gruvbox") return "Gruvbox";
  return design.charAt(0).toUpperCase() + design.slice(1);
}

export function isPickerDesignTheme(design: DesignThemeId): design is PickerDesignTheme {
  return (PICKER_DESIGN_THEMES as readonly string[]).includes(design);
}
