#!/usr/bin/env bun
/**
 * Emit the Catppuccin theme blocks for `src/ui-app/src/style.css`, and
 * self-check every `[check] contrastPairs` pair before printing anything.
 *
 * Run by hand after editing the token map below, or after a shikijs upgrade:
 *
 *     bun scripts/gen-catppuccin-theme.mjs            # print the two blocks
 *     bun scripts/gen-catppuccin-theme.mjs --check    # fail if style.css differs
 *
 * WHY A GENERATOR (#0516). See `scripts/catppuccin-palette.mjs` — the hexes
 * come out of the installed shikijs package, and a wrong slot or a mistyped
 * accent is invisible in review. The alpha compositing, the 8-digit-hex
 * encoding the contrast guard can parse, and the 9-pair contrast floor are
 * all checked here rather than eyeballed in a 300-line CSS diff.
 */
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CATPPUCCIN_LATTE, CATPPUCCIN_MOCHA } from "./catppuccin-palette.mjs";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

// ── colour maths (mirrors src/commands/check.ts so this gate and `repoos
//    check` cannot disagree about what passes) ──
const chan = (v) => {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
const lum = ({ r, g, b }) => 0.2126 * chan(r) + 0.7152 * chan(g) + 0.0722 * chan(b);
const ratio = (a, b) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
function rgb(hex) {
  const n = parseInt(hex.slice(1, 7), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
const over = (fg, alpha, bg) => ({
  r: fg.r * alpha + bg.r * (1 - alpha),
  g: fg.g * alpha + bg.g * (1 - alpha),
  b: fg.b * alpha + bg.b * (1 - alpha),
});

/** `#rrggbb` + alpha → `#rrggbbaa`, the form the contrast guard can parse. */
function hex8(hex, alpha) {
  const a = Math.round(Math.max(0, Math.min(1, alpha)) * 255)
    .toString(16)
    .padStart(2, "0");
  return hex + a;
}
/** Composited-over-`base` colour of a hex (with optional alpha suffix). */
function flatten(value, base) {
  if (typeof value !== "string") return value;
  const hasAlpha = value.length === 9;
  return over(rgb(value), hasAlpha ? parseInt(value.slice(7, 9), 16) / 255 : 1, base);
}
const MIN_CONTRAST = 3;

// ── The WCAG floor for Latte's text slots (#0596) ──────────────────────
// Catppuccin's canonical ramp is a design palette, not an accessibility one:
// as rendered on Latte's own surfaces, subtext0 measures 4.06:1, overlay2
// 3.25:1 and peach 2.45:1 — all below the 4.5:1 body-text floor the rendered
// contrast audit enforces on every theme. Mocha's slots are pastels over a
// near-black base and clear the floor as-is; Latte's mid-dark accents on a
// near-white base do not. So the LIGHT variant's text-carrying roles are
// darkened here — hue preserved, solved against Latte's surface1 (the
// darkest surface Latte text renders on; see `latteWcagOverrides`) — and
// everything else stays canonical. The value map is keyed by
// the palette hex, so every slot that carries the role (aliased tokens like
// --primary/--ring/--tag-stream-color included) moves together, and a
// shikijs upgrade re-solves instead of drifting.
export const LATTE_TEXT_ROLES = ["subtext0", "overlay2", "blue", "mauve", "green", "red", "peach"];

/** Darken `hex` toward black (hue-preserving per channel) until it clears
 *  `target` against `bgHex`. Mirrors the audit's solver, same maths. */
export function wcagDarken(hex, bgHex, target = 4.7) {
  const fg0 = rgb(hex);
  const bg = rgb(bgHex);
  const at = (t) => ({ r: fg0.r * (1 - t), g: fg0.g * (1 - t), b: fg0.b * (1 - t) });
  if (ratio(at(1), bg) < target) return hex; // even black can't — leave canonical
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 40; i++) {
    const t = (lo + hi) / 2;
    if (ratio(at(t), bg) >= target) hi = t;
    else lo = t;
  }
  const c = at(hi);
  const h = (v) =>
    Math.max(0, Math.min(255, Math.round(v)))
      .toString(16)
      .padStart(2, "0");
  return `#${h(c.r)}${h(c.g)}${h(c.b)}`;
}

/** original palette hex → WCAG-adjusted hex, for LATTE_TEXT_ROLES. */
export function latteWcagOverrides(palette = CATPPUCCIN_LATTE) {
  const out = new Map();
  for (const role of LATTE_TEXT_ROLES) {
    const orig = palette[role];
    // surface1, not base: for DARK text the DARKEST surface it renders on is
    // the worst case (base #eff1f5 gives mauve 4.79:1, surface0 4.29:1), and
    // surface1 also conservatively covers the chip/accent mixes (#d1d1e0).
    if (orig) out.set(orig.toLowerCase(), wcagDarken(orig, palette.surface1));
  }
  return out;
}

/** Rewrite a LIGHT token map's text-role hexes to their WCAG-adjusted values. */
function applyLatteFloor(map, palette) {
  const overrides = latteWcagOverrides(palette);
  for (const [key, value] of Object.entries(map)) {
    const norm = String(value).toLowerCase();
    if (/^#[0-9a-f]{6}$/.test(norm) && overrides.has(norm)) map[key] = overrides.get(norm);
  }
  return map;
}

/**
 * The token map. Every value is derived from the palette — no hand-typed hex.
 *
 * `appearance: "dark"` → `:root[data-ui-theme="catppuccin"]`
 * `appearance: "light"` → the `[data-theme="light"]` twin (Catppuccin Latte).
 *
 * RepoOS's accent slots are named --cyan/--violet/--green/--red/--amber, so
 * they map onto Catppuccin hue families rather than one-for-one:
 *   --cyan → blue (primary: focus, links, streaming)
 *   --violet → mauve (secondary)  --green → green  --red → red  --amber → peach
 */
function tokens(p, appearance) {
  const dark = appearance === "dark";
  const wash = (hex, a) => hex8(hex, a);

  // ── The one real difference between the two flavours, and it is not
  // cosmetic. Catppuccin inverts what an accent is *for* between flavours:
  // Mocha's accents are light pastels meant to sit ON the dark base, while
  // Latte's are mid-dark saturated colours meant to BE text on the light base.
  // So a solid accent fill takes dark text in Mocha but cannot in Latte —
  // Latte's `green` (#40a02b) under `#eff1f5` text measures 2.96:1, under
  // pure white 3.34:1, and no neutral in the ramp clears 3:1 at all (checked
  // with the real maths below). Latte therefore gets the *tinted wash* the
  // repo's other light appearances already use (`--txt` on a low-alpha accent
  // over base), which is also what Catppuccin's own flavour guidance says:
  // in Latte, accents carry text and borders, not large fills.
  //
  // The consequence is deliberate and worth stating: the primary button is a
  // solid pastel in Mocha and a soft wash in Latte. Both are correct for their
  // flavour; neither is a recolour of the other.
  const onFill = dark ? p.base : p.text;
  /** A control fill: solid pastel in Mocha, accent wash in Latte. */
  const fill = (a, b, lightAlphaA = 0.16, lightAlphaB = 0.12) =>
    dark
      ? `linear-gradient(135deg, ${a}, ${b})`
      : `linear-gradient(135deg, ${wash(a, lightAlphaA)}, ${wash(b, lightAlphaB)})`;

  return {
    "--bg": p.base,
    "--bg-2": p.mantle,
    "--panel": wash(p.mantle, 0.66),
    "--panel-solid": p.mantle,
    // Catppuccin's signature: borders are the palette's own surface2 tinted
    // toward the base hue, never a neutral gray.
    "--border": wash(p.surface2, 0.42),
    "--border-bright": wash(p.surface2, 0.72),
    "--txt": p.text,
    "--txt-dim": p.subtext0,
    // overlay2, not overlay1: the faint step still clears 3:1 on base in BOTH
    // flavours (Latte's overlay1 is only 2.83:1).
    "--txt-faint": p.overlay2,
    "--cyan": p.blue,
    "--cyan-dim": wash(p.blue, 0.16),
    "--violet": p.mauve,
    "--violet-dim": wash(p.mauve, 0.16),
    "--green": p.green,
    "--red": p.red,
    "--amber": p.peach,
    // No neon: one wide, low-opacity drop shadow in the base's own hue.
    // oxfmt puts the first stop on its own line when a value wraps; emitting it
    // that way keeps `--check` green after `bun run fmt` instead of the two
    // disagreeing over one newline.
    "--body-gradient":
      `\n    radial-gradient(1000px 620px at 6% -10%, ${wash(p.mauve, dark ? 0.07 : 0.05)}, transparent 60%),\n` +
      `    radial-gradient(1060px 700px at 102% -6%, ${wash(p.pink, dark ? 0.06 : 0.045)}, transparent 58%),\n` +
      `    radial-gradient(900px 620px at 50% 116%, ${wash(p.blue, dark ? 0.05 : 0.04)}, transparent 62%)`,
    "--topbar-bg": `linear-gradient(180deg, ${wash(p.mantle, 0.92)}, ${wash(p.base, 0.72)})`,
    "--logo-shadow": `0 2px 18px -6px ${wash(p.mauve, dark ? 0.34 : 0.26)}`,
    "--card-glow": `0 0 0 1px ${wash(p.surface2, 0.2)}, 0 6px 18px -12px ${wash(p.base, dark ? 0.7 : 0.3)}`,
    "--nav-hover-bg": wash(p.surface1, dark ? 0.34 : 0.5),
    "--nav-active-bg": dark
      ? `linear-gradient(90deg, ${wash(p.blue, 0.22)}, ${wash(p.mauve, 0.08)})`
      : `linear-gradient(90deg, ${wash(p.blue, 0.14)}, ${wash(p.mauve, 0.06)})`,
    "--nav-active-color": p.text,
    "--overlay-bg": wash(p.crust, dark ? 0.72 : 0.44),
    "--panel-gradient": `linear-gradient(180deg, ${p.mantle}, ${p.base})`,
    "--drawer-shadow": dark
      ? `-18px 0 48px -26px ${wash(p.crust, 0.85)}`
      : `-18px 0 48px -26px ${wash(p.surface1, 0.7)}`,
    "--btn-primary-bg": fill(p.blue, p.mauve),
    "--btn-primary-color": onFill,
    "--ai-chat-send-bg": fill(p.mauve, p.pink, 0.18, 0.14),
    "--ai-chat-send-color": onFill,
    "--btn-new-bg": fill(p.blue, p.mauve, 0.13, 0.1),
    "--btn-new-color": onFill,
    "--status-on-bg": fill(p.green, p.teal, 0.14, 0.11),
    "--status-on-color": onFill,
    "--md-body-bg": wash(p.crust, dark ? 0.34 : 0.05),
    "--tabbar-bg": `linear-gradient(180deg, ${wash(p.mantle, 0.9)}, ${wash(p.base, 0.96)})`,
    "--scrollbar-thumb": wash(p.surface2, dark ? 0.5 : 0.6),
    "--doc-row-sel-bg": dark ? wash(p.mauve, 0.18) : wash(p.mauve, 0.12),
    "--doc-row-sel-color": p.text,
    "--green-tint": wash(p.green, 0.14),
    "--green-border-tint": wash(p.green, 0.36),
    "--red-tint": wash(p.red, 0.14),
    "--red-border-tint": wash(p.red, 0.36),
    "--amber-tint": wash(p.peach, 0.14),
    "--amber-border-tint": wash(p.peach, 0.36),
    "--violet-tint": "var(--violet-dim)",
    "--violet-border-tint": wash(p.mauve, 0.36),
    // 8-digit hex, not rgba(): these two appear in a [check] contrastPairs
    // bg, and the guard's colour parser is the thing being leaned on here.
    // Their foregrounds are the saturated accent, not the flavour's body text:
    // in Latte the tag is a tinted chip carrying blue text (Catppuccin's own
    // Latte idiom), in Mocha a dark chip carrying the pastel blue.
    "--tag-stream-bg": dark ? wash(p.blue, 0.18) : wash(p.blue, 0.12),
    "--tag-stream-color": p.blue,
    "--tag-reconnect-bg": dark ? wash(p.red, 0.18) : wash(p.red, 0.12),
    "--tag-reconnect-color": p.red,
    "--chip-bg": wash(p.surface1, dark ? 0.4 : 0.55),
    "--dot-glow": "0 0 6px currentColor",
    // shadcn-vue semantic slots, mapped onto the tokens above.
    "--background": p.base,
    "--foreground": p.text,
    "--card": wash(p.mantle, 0.66),
    "--card-foreground": p.text,
    "--popover": p.mantle,
    "--popover-foreground": p.text,
    "--primary": p.blue,
    "--primary-foreground": onFill,
    "--secondary": wash(p.surface1, dark ? 0.4 : 0.55),
    "--secondary-foreground": p.text,
    "--muted": p.mantle,
    "--muted-foreground": p.subtext0,
    "--accent": wash(p.mauve, 0.16),
    "--accent-foreground": p.mauve,
    "--destructive": p.red,
    "--destructive-foreground": onFill,
    "--input": wash(p.surface2, 0.4),
    "--ring": p.blue,
    // Catppuccin's own generous radius — the roundest in the app, and the
    // clearest signal that this is the pastel theme and not gruvbox's casing.
    "--radius": "0.75rem",
  };
}

function render(name, map) {
  // A value may carry its own leading newline (the wrapped body-gradient); split
  // the key/value so that continuation is not preceded by a stray space, which
  // is exactly the shape oxfmt writes and `--check` compares against.
  const body = Object.entries(map)
    .map(([k, v]) => (v.startsWith("\n") ? `  ${k}:${v};` : `  ${k}: ${v};`))
    .join("\n");
  return `${name} {\n${body}\n}`;
}

// ── contrast self-check: the same 9 pairs repoos.toml declares ──
const PAIRS = [
  ["--txt", "--bg"],
  ["--txt-dim", "--bg"],
  ["--btn-primary-color", "--btn-primary-bg"],
  ["--btn-new-color", "--btn-new-bg"],
  ["--status-on-color", "--status-on-bg"],
  ["--tag-stream-color", "--tag-stream-bg"],
  ["--tag-reconnect-color", "--tag-reconnect-bg"],
  ["--doc-row-sel-color", "--doc-row-sel-bg"],
  ["--nav-active-color", "--nav-active-bg"],
];

/** Every colour a token can resolve to, each flattened onto the page bg. */
function candidates(value, map, base) {
  const resolved = value.startsWith("var(") ? (map[value.slice(4, -1)] ?? value) : value;
  const out = [];
  if (resolved.includes("gradient(")) {
    const re = /#[0-9a-fA-F]{8}|#[0-9a-fA-F]{6}|transparent/g;
    let m;
    while ((m = re.exec(resolved))) out.push(m[0] === "transparent" ? base : flatten(m[0], base));
  } else {
    out.push(flatten(resolved, base));
  }
  return out;
}

function verify(label, map) {
  const base = rgb(map["--bg"]);
  const problems = [];
  for (const [fg, bg] of PAIRS) {
    const fgs = candidates(map[fg], map, base);
    const bgs = candidates(map[bg], map, base);
    let worst = Infinity;
    for (const f of fgs) for (const b of bgs) worst = Math.min(worst, ratio(f, b));
    if (worst < MIN_CONTRAST)
      problems.push(`  ${label} · ${fg} on ${bg} → ${worst.toFixed(2)} (need ≥${MIN_CONTRAST})`);
  }
  // gradientTokens from repoos.toml must resolve to a gradient.
  for (const tk of ["--btn-primary-bg", "--btn-new-bg"]) {
    if (!map[tk].includes("gradient(")) problems.push(`  ${label} · ${tk} must be a gradient`);
  }
  if (problems.length) {
    console.error(`catppuccin contrast self-check FAILED:\n${problems.join("\n")}`);
    process.exit(1);
  }
  return PAIRS.map(([fg, bg]) => {
    const fgs = candidates(map[fg], map, base);
    const bgs = candidates(map[bg], map, base);
    let worst = Infinity;
    for (const f of fgs) for (const b of bgs) worst = Math.min(worst, ratio(f, b));
    return { pair: `${fg} on ${bg}`, worst };
  });
}

// Importing this module (the tests read `latteWcagOverrides` from it) must not
// print CSS or exit — only running it should.
const isMainRun = process.argv[1]
  ? resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  : false;

if (isMainRun) main();

function main() {
  const dark = tokens(CATPPUCCIN_MOCHA, "dark");
  const light = applyLatteFloor(tokens(CATPPUCCIN_LATTE, "light"), CATPPUCCIN_LATTE);
  for (const [label, map] of [
    ["catppuccin-dark", dark],
    ["catppuccin-light", light],
  ]) {
    const rows = verify(label, map);
    console.error(`# ${label}: all ${rows.length} contrast pairs pass`);
    for (const r of rows) console.error(`#   ${r.worst.toFixed(2).padStart(6)}  ${r.pair}`);
  }

  const blocks = [
    render(':root[data-ui-theme="catppuccin"]', dark),
    render(':root[data-ui-theme="catppuccin"][data-theme="light"]', light),
  ];

  if (process.argv.includes("--check")) {
    const css = readFileSync(join(repoRoot, "src/ui-app/src/style.css"), "utf8");
    const missing = blocks.filter((b) => !css.includes(b));
    if (missing.length) {
      console.error(
        `style.css is out of date with scripts/gen-catppuccin-theme.mjs (${missing.length} block(s) differ).\n` +
          `Run: bun scripts/gen-catppuccin-theme.mjs   and paste the output into style.css.`,
      );
      process.exit(1);
    }
    console.error("style.css matches the generated Catppuccin blocks.");
  } else {
    console.log(blocks.join("\n"));
  }
}
