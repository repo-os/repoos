/**
 * Synchronous pre-paint entry — bundled into every page's <head> by vite-plugin-theme-boot.
 */
import {
  applyResolvedThemes,
  persistThemes,
  resolveThemes,
  syncThemeColorMeta,
} from "./theme-resolve";

const resolved = resolveThemes(window.location.search);
applyResolvedThemes(resolved);
if (resolved.fromUrl) {
  persistThemes(resolved.design, resolved.appearance);
}
syncThemeColorMeta(resolved.design, resolved.appearance);
