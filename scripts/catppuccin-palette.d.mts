/**
 * Types for `scripts/catppuccin-palette.mjs` (see that file for why the
 * Catppuccin palette is generated rather than hand-typed).
 *
 * This is a hand-written declaration for a plain-JS authoring script so the
 * TypeScript build — which compiles `src/ui-app/tests` — can import it. It is
 * types only: the runtime values still come from the shikijs package, so the
 * declarations here cannot drift into asserting colours that aren't real.
 */
export type CatppuccinRole =
  | "rosewater"
  | "flamingo"
  | "pink"
  | "mauve"
  | "red"
  | "maroon"
  | "peach"
  | "yellow"
  | "green"
  | "teal"
  | "sky"
  | "sapphire"
  | "blue"
  | "lavender"
  | "base"
  | "mantle"
  | "crust"
  | "text"
  | "subtext1"
  | "subtext0"
  | "overlay2"
  | "overlay1"
  | "overlay0"
  | "surface2"
  | "surface1"
  | "surface0";

/** Every role resolved to a bare `#rrggbb` from one shikijs flavour. */
export type CatppuccinPalette = Record<CatppuccinRole, string>;

export const CATPPUCCIN_MOCHA: CatppuccinPalette;
export const CATPPUCCIN_LATTE: CatppuccinPalette;

export const CATPPUCCIN_VARIANTS: {
  id: string;
  label: string;
  palette: CatppuccinPalette;
}[];

export const CATPPUCCIN_ACCENT_ROLES: CatppuccinRole[];
export const CATPPUCCIN_NEUTRAL_ROLES: CatppuccinRole[];
