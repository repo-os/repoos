/**
 * Docs-site theme resolution (design theme + appearance).
 * Mirrors landing/src/theme-resolve.ts — keep parsing rules in sync; cite that file when changing.
 * Appearance uses VitePress's `dark` class on <html>, not `data-theme`.
 */

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

/** Design ids with CSS on this site; unknown ids resolve to Classic. */
export const IMPLEMENTED_DESIGN_THEMES = new Set<string>(["classic", "gruvbox"]);

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

/** Docs default matches config.mts `appearance: "dark"` (dark-first, not OS auto). */
const DEFAULT_APPEARANCE: Appearance = "dark";

export function effectiveDesignTheme(design: DesignThemeId): DesignThemeId {
  if (design === "classic") return "classic";
  return IMPLEMENTED_DESIGN_THEMES.has(design) ? design : "classic";
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
    appearance = readStoredAppearance() ?? DEFAULT_APPEARANCE;
  }

  let design = fromUrl.design;
  if (design) {
    fromUrlHit = true;
    design = effectiveDesignTheme(design);
  } else {
    const stored = readStoredDesign();
    design = stored ? effectiveDesignTheme(stored) : "classic";
  }

  return { design, appearance, fromUrl: fromUrlHit };
}

export function themeColorFor(design: DesignThemeId, appearance: Appearance): string {
  return THEME_COLOR[`${design}-${appearance}`] ?? THEME_COLOR[`classic-${appearance}`]!;
}

export function applyDesignThemeToDocument(design: DesignThemeId): void {
  const effective = effectiveDesignTheme(design);
  if (effective === "classic") {
    document.documentElement.removeAttribute("data-ui-theme");
  } else {
    document.documentElement.setAttribute("data-ui-theme", effective);
  }
}

export function applyAppearanceToDocument(appearance: Appearance): void {
  document.documentElement.classList.toggle("dark", appearance === "dark");
}

export function applyResolvedThemes(resolved: ResolvedThemes): void {
  applyAppearanceToDocument(resolved.appearance);
  applyDesignThemeToDocument(resolved.design);
}

export function persistThemes(design: DesignThemeId, appearance: Appearance): void {
  try {
    localStorage.setItem(APPEARANCE_KEY, appearance);
    localStorage.setItem(DESIGN_KEY, effectiveDesignTheme(design));
  } catch {
    // blocked storage
  }
}

export function syncThemeColorMeta(design: DesignThemeId, appearance: Appearance): void {
  const content = themeColorFor(effectiveDesignTheme(design), appearance);
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
  return effectiveDesignTheme(normalizeDesignThemeId(attr) ?? "classic");
}

export function readAppearanceFromDocument(): Appearance {
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

/** Update the query string to match the current axes (no navigation). */
export function syncThemeToUrl(design: DesignThemeId, appearance: Appearance): void {
  const params = new URLSearchParams(window.location.search);
  const effective = effectiveDesignTheme(design);
  if (effective === "classic") {
    params.delete(URL_THEME_PARAM);
  } else {
    params.set(URL_THEME_PARAM, effective);
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

/** Append theme query params to an absolute URL (cross-site hand-off). */
export function appendThemeToUrl(
  url: string,
  design: DesignThemeId,
  appearance: Appearance,
): string {
  const u = new URL(url);
  const effective = effectiveDesignTheme(design);
  if (effective === "classic") {
    u.searchParams.delete(URL_THEME_PARAM);
  } else {
    u.searchParams.set(URL_THEME_PARAM, effective);
  }
  u.searchParams.set(URL_APPEARANCE_PARAM, appearance);
  for (const alias of URL_APPEARANCE_ALIASES) {
    u.searchParams.delete(alias);
  }
  return u.toString();
}

export function syncRepoOrgNavLinks(design: DesignThemeId, appearance: Appearance): void {
  for (const a of document.querySelectorAll<HTMLAnchorElement>('a[href^="https://repoos.org"]')) {
    const href = a.getAttribute("href");
    if (!href) continue;
    a.href = appendThemeToUrl(href, design, appearance);
  }
}

export function pickerLabelForDesign(design: DesignThemeId): string {
  if (design === "classic") return "Classic";
  if (design === "gruvbox") return "Gruvbox";
  return design.charAt(0).toUpperCase() + design.slice(1);
}

export function isPickerDesignTheme(design: DesignThemeId): design is PickerDesignTheme {
  return (PICKER_DESIGN_THEMES as readonly string[]).includes(design);
}

export function commitThemeChange(design: DesignThemeId, appearance: Appearance): void {
  persistThemes(design, appearance);
  syncThemeColorMeta(design, appearance);
  syncThemeToUrl(design, appearance);
  syncRepoOrgNavLinks(design, appearance);
}
