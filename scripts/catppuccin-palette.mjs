/**
 * Catppuccin Latte/Mocha palettes, derived from the `shikijs` dev dependency.
 *
 * WHY A GENERATOR (#0516). Catppuccin's 26 named colours have to land in
 * `src/ui-app/src/style.css` as ~60 CSS custom properties per variant. Hand-
 * typing them is how a theme silently ships one wrong hex: a mistyped accent
 * is invisible in review and only shows up as a slightly-off button. So the
 * values are read out of the installed `@shikijs/themes` package — the same
 * source a code block would be highlighted from — and the only thing written
 * by hand is the role → slot table below.
 *
 * The generator never runs at build or serve time and nothing in
 * `src/ui-app/src` imports it, so the two ~40 kB theme JSONs stay out of the
 * UI bundle; shikijs remains a dev dependency and RepoOS keeps its
 * zero-runtime-dependency guarantee. Run it by hand after a shikijs upgrade:
 *
 *     bun scripts/gen-catppuccin-theme.mjs          # print the CSS blocks
 *     bun scripts/gen-catppuccin-theme.mjs --check  # verify style.css matches
 *
 * `src/ui-app/tests/catppuccin-theme.test.ts` runs the `--check` path, so a
 * shikijs bump that moves a slot fails CI rather than drifting the palette.
 */
import latte from "@shikijs/themes/catppuccin-latte";
import mocha from "@shikijs/themes/catppuccin-mocha";

/**
 * Catppuccin role → the shiki slot that carries it, in BOTH flavours.
 *
 * Two traps this table exists to avoid, both hit while writing it:
 *
 *  1. Do NOT read the palette from `terminal.ansi*`. Those slots are remapped
 *     per flavour rather than being the canonical colours: Latte's
 *     `terminal.ansiBlack` is `#5c5f77` (subtext1) but Mocha's is `#45475a`
 *     (surface1), and `terminal.ansiBrightBlack` is overlay0 in Latte but
 *     surface2 in Mocha. The `editor.*` / `list.*` / `panel.*` / `symbolIcon.*`
 *     roles are assigned one-to-one across flavours and are safe.
 *  2. Watch for slots carrying an alpha suffix (`#cdd6f473`) or a vscode-only
 *     extra step (`tab.unfocusedInactiveBackground`, `#d6dbe5`/`#0e0e16`, which
 *     is not a Catppuccin ramp entry at all). Both look plausible and are wrong.
 *
 * Every value below is validated at import: all 26 roles must resolve, be
 * distinct within their variant, and the 12-role neutral ramp must stay
 * strictly monotonic in contrast against `base`. A wrong slot breaks one of
 * those, so a shikijs upgrade that renames a slot fails loudly here.
 */
const SLOTS = {
  // ── accents (the 14 named hues) ──
  rosewater: "editorCursor.foreground",
  flamingo: "symbolIcon.packageForeground",
  pink: "symbolIcon.colorForeground",
  mauve: "symbolIcon.fileForeground",
  red: "charts.red",
  maroon: "symbolIcon.nullForeground",
  peach: "symbolIcon.arrayForeground",
  yellow: "symbolIcon.classForeground",
  green: "symbolIcon.stringForeground",
  teal: "symbolIcon.keyForeground",
  sky: "textLink.activeForeground",
  sapphire: "editorBracketHighlight.foreground5",
  blue: "symbolIcon.functionForeground",
  lavender: "symbolIcon.constructorForeground",
  // ── neutrals (the 12-step ramp) ──
  base: "editorCursor.background",
  mantle: "editorWidget.background",
  crust: "statusBar.background",
  text: "foreground",
  subtext1: "charts.lines",
  subtext0: "disabledForeground",
  overlay2: "editorBracketMatch.border",
  overlay1: "editorCodeLens.foreground",
  overlay0: "activityBar.inactiveForeground",
  surface2: "button.secondaryBackground",
  surface1: "badge.background",
  surface0: "list.activeSelectionBackground",
};

const ACCENTS = [
  "rosewater",
  "flamingo",
  "pink",
  "mauve",
  "red",
  "maroon",
  "peach",
  "yellow",
  "green",
  "teal",
  "sky",
  "sapphire",
  "blue",
  "lavender",
];
/**
 * The neutral ramp in its one canonical order: strictly DECREASING contrast
 * against `base`, from the highest-contrast ink to the base itself.
 *
 * This is the invariant that makes the whole table self-checking, and it holds
 * in both flavours without a per-variant special case. Catppuccin walks the
 * neutral ramp away from `base` in a single direction — Latte's steps get
 * lighter than base (#eff1f5 → #dce0e8), Mocha's get darker (#1e1e2e → #11111b)
 * — so "ink first, then surface, then the two steps past base" is
 * contrast-descending in both. A SLOTS entry pointing at the wrong colour
 * breaks the strict decrease and is rejected below.
 */
const NEUTRALS = [
  "text",
  "subtext1",
  "subtext0",
  "overlay2",
  "overlay1",
  "overlay0",
  "surface2",
  "surface1",
  "surface0",
  "crust",
  "mantle",
  "base",
];

const HEX7 = /^#[0-9a-f]{6}$/i;

function slotValue(theme, slot) {
  const v = theme.colors[slot];
  if (typeof v !== "string" || !HEX7.test(v)) {
    throw new Error(
      `catppuccin palette: slot "${slot}" for "${theme.name}" is ${JSON.stringify(v)} — ` +
        `expected a bare 7-char hex. shikijs may have renamed or re-encoded it; ` +
        `update SLOTS in scripts/catppuccin-palette.mjs.`,
    );
  }
  return v.toLowerCase();
}

function contrast(a, b) {
  const ch = (h) => {
    const n = parseInt(h.slice(1, 7), 16);
    return [16, 8, 0].map((s) => (n >> s) & 255);
  };
  const lum = (h) => {
    const c = ch(h).map((v) => {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Extract + validate one flavour. Throws rather than emitting a wrong palette. */
function paletteOf(theme) {
  const out = {};
  for (const [role, slot] of Object.entries(SLOTS)) out[role] = slotValue(theme, slot);

  const all = [...ACCENTS, ...NEUTRALS];
  const dupes = all.filter((r, i) => all.indexOf(r) !== i);
  if (dupes.length) throw new Error(`catppuccin palette: duplicate roles ${dupes}`);
  const seen = new Map();
  for (const role of all) {
    const prev = seen.get(out[role]);
    if (prev) {
      throw new Error(
        `catppuccin palette (${theme.name}): "${role}" and "${prev}" both resolve to ` +
          `${out[role]} — the SLOTS table is mapping two roles onto one colour.`,
      );
    }
    seen.set(out[role], role);
  }

  const crs = NEUTRALS.map((r) => contrast(out[r], out.base));
  for (let i = 1; i < crs.length; i++) {
    if (!(crs[i] < crs[i - 1])) {
      throw new Error(
        `catppuccin palette (${theme.name}): neutral ramp is not strictly decreasing at ` +
          `${NEUTRALS[i - 1]} → ${NEUTRALS[i]} (${crs[i - 1].toFixed(2)} → ` +
          `${crs[i].toFixed(2)}). A SLOTS entry is pointing at the wrong colour.`,
      );
    }
  }
  return out;
}

export const CATPPUCCIN_MOCHA = paletteOf(mocha);
export const CATPPUCCIN_LATTE = paletteOf(latte);

export const CATPPUCCIN_VARIANTS = [
  { id: "catppuccin-mocha", label: "Catppuccin Mocha", palette: CATPPUCCIN_MOCHA },
  { id: "catppuccin-latte", label: "Catppuccin Latte", palette: CATPPUCCIN_LATTE },
];

export { ACCENTS as CATPPUCCIN_ACCENT_ROLES, NEUTRALS as CATPPUCCIN_NEUTRAL_ROLES };
