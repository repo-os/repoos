/** Stable serialized values for `activityAnimationStyle` in repoos.toml. */
export const ACTIVITY_ANIMATION_STYLES = [
  "orbital-pixel",
  "cursor-scan-pulse",
  "breathing-brackets",
  "micro-dot-matrix",
  "tiny-signal-bars",
  "spark-diamond",
  "arcade-hopper",
  "puppy-tracks",
  "three-dots",
] as const;

export type ActivityAnimationStyle = (typeof ACTIVITY_ANIMATION_STYLES)[number];

export const DEFAULT_ACTIVITY_ANIMATION_STYLE: ActivityAnimationStyle = "orbital-pixel";

export const ACTIVITY_ANIMATION_STYLE_LABELS: Record<ActivityAnimationStyle, string> = {
  "orbital-pixel": "Orbital pixel",
  "cursor-scan-pulse": "Cursor / scan / pulse",
  "breathing-brackets": "Breathing brackets",
  "micro-dot-matrix": "Micro dot matrix",
  "tiny-signal-bars": "Tiny signal bars",
  "spark-diamond": "Spark / diamond",
  "arcade-hopper": "Arcade hopper",
  "puppy-tracks": "Puppy tracks",
  "three-dots": "Three dots (legacy)",
};

export function isActivityAnimationStyle(value: unknown): value is ActivityAnimationStyle {
  return (
    typeof value === "string" && (ACTIVITY_ANIMATION_STYLES as readonly string[]).includes(value)
  );
}

export function normalizeActivityAnimationStyle(
  value: unknown,
): ActivityAnimationStyle | undefined {
  return isActivityAnimationStyle(value) ? value : undefined;
}

export function activityAnimationStyleOrDefault(
  style: ActivityAnimationStyle | undefined,
): ActivityAnimationStyle {
  return style ?? DEFAULT_ACTIVITY_ANIMATION_STYLE;
}

/**
 * Stable serialized values for `activityAnimationSize` in repoos.toml, in CSS
 * pixels. A fixed pixel size renders identically on every surface — task card,
 * Dev page and the Settings preview — because it never depends on the
 * surrounding font (#0816). The old character-width steps (`1`…`3`) and `auto`
 * are still accepted on read and map onto this ladder, so a saved repoos.toml
 * keeps its relative size instead of silently resetting. A hand-written numeric
 * TOML value (`20`) normalizes to the equivalent string (`"20"`).
 */
export const ACTIVITY_ANIMATION_SIZES = ["8", "12", "16", "20", "24"] as const;

export type ActivityAnimationSize = (typeof ACTIVITY_ANIMATION_SIZES)[number];

export const DEFAULT_ACTIVITY_ANIMATION_SIZE: ActivityAnimationSize = "16";

export const ACTIVITY_ANIMATION_SIZE_LABELS: Record<ActivityAnimationSize, string> = {
  "8": "8 px",
  "12": "12 px",
  "16": "16 px",
  "20": "20 px",
  "24": "24 px",
};

/** Slider bounds and step, in pixels. The ladder is evenly spaced. */
export const ACTIVITY_ANIMATION_SIZE_MIN_PX = Number(ACTIVITY_ANIMATION_SIZES[0]);
export const ACTIVITY_ANIMATION_SIZE_MAX_PX = Number(
  ACTIVITY_ANIMATION_SIZES[ACTIVITY_ANIMATION_SIZES.length - 1],
);
export const ACTIVITY_ANIMATION_SIZE_STEP_PX =
  Number(ACTIVITY_ANIMATION_SIZES[1]) - Number(ACTIVITY_ANIMATION_SIZES[0]);

/**
 * Legacy `activityAnimationSize` tokens (character-width steps and `auto`),
 * mapped onto the pixel ladder by ordinal so an existing config keeps its
 * relative size: the smallest old step stays the smallest, and `auto` — the old
 * default, which had no slider position — becomes the middle default.
 */
const LEGACY_ACTIVITY_ANIMATION_SIZES: Record<string, ActivityAnimationSize> = {
  auto: DEFAULT_ACTIVITY_ANIMATION_SIZE,
  "1": "8",
  "1.5": "12",
  "2": "16",
  "2.5": "20",
  "3": "24",
};

/**
 * Each compact style's natural glyph width as a multiple of its own font size.
 * The chosen pixel setting is the reserved slot width; a style's artwork gets a
 * fixed pixel font size of `size / slot`, so its em-based geometry fills the
 * slot identically wherever it is drawn. `three-dots` sizes its dots directly
 * from the pixel slot instead. Keep in sync with the per-style `--ai-w`
 * declarations in `src/ui-app/src/style.css`.
 */
export const ACTIVITY_ANIMATION_STYLE_SLOT: Record<ActivityAnimationStyle, number> = {
  "orbital-pixel": 1.05,
  "cursor-scan-pulse": 0.9,
  "breathing-brackets": 1.2,
  "micro-dot-matrix": 0.9,
  "tiny-signal-bars": 0.9,
  "spark-diamond": 1.2,
  "arcade-hopper": 1.2,
  "puppy-tracks": 1.2,
  // The legacy dot row derives its geometry from the pixel slot in CSS.
  "three-dots": 0,
};

export function isActivityAnimationSize(value: unknown): value is ActivityAnimationSize {
  return (
    typeof value === "string" && (ACTIVITY_ANIMATION_SIZES as readonly string[]).includes(value)
  );
}

/**
 * Normalize a configured size. Accepts the canonical pixel strings, numeric
 * TOML values that land on a slider step, and the legacy character-width/`auto`
 * tokens (mapped onto the ladder). Anything else is ignored so the caller falls
 * back to the default.
 */
export function normalizeActivityAnimationSize(value: unknown): ActivityAnimationSize | undefined {
  if (isActivityAnimationSize(value)) return value;
  if (typeof value === "number") {
    const text = String(value);
    return isActivityAnimationSize(text) ? text : LEGACY_ACTIVITY_ANIMATION_SIZES[text];
  }
  if (typeof value === "string") return LEGACY_ACTIVITY_ANIMATION_SIZES[value];
  return undefined;
}

export function activityAnimationSizeOrDefault(
  size: ActivityAnimationSize | undefined,
): ActivityAnimationSize {
  return size ?? DEFAULT_ACTIVITY_ANIMATION_SIZE;
}

/** The reserved width for the animation, in CSS pixels. */
export function activityAnimationSizePx(size: ActivityAnimationSize): number {
  return Number(size);
}
