/**
 * RepoOS mark geometry — the borderless hexagon with the three bars.
 *
 * One source for both sites: the landing header (`landing/src/components/
 * SiteLogo.vue`) and the docs header (`user-docs/.vitepress/theme/NavBarLogo.vue`)
 * import these values, so the drawing cannot drift between them. Colour is NOT
 * here: each site supplies `--cyan` and `--violet` from its own theme tokens,
 * which is what makes the mark follow Classic/Gruvbox and light/dark.
 *
 * `user-docs/public/favicon.svg` is the separate square app icon used for the
 * browser tab; it deliberately keeps its own background and fixed colours.
 */
export const LOGO_VIEW_BOX = "0 0 24 24";

/** Outer hexagon, stroked with the cyan→violet gradient. */
export const LOGO_HEX_PATH = "M12 2L4 7v10l8 5 8-5V7l-8-5z";
export const LOGO_HEX_STROKE_WIDTH = 1.8;

/** The three bars inside the hexagon, stroked with `--violet`. */
export const LOGO_BARS_PATH = "M12 7v10M8 9.5v5M16 9.5v5";
export const LOGO_BARS_STROKE_WIDTH = 1.3;

/** Gradient vector, matching the 24×24 viewBox corner to corner. */
export const LOGO_GRADIENT = { x1: 0.5, y1: 0.5, x2: 23.5, y2: 23.5 } as const;
