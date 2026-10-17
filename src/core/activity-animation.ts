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
 * Stable serialized values for `activityAnimationSize` in repoos.toml. `auto`
 * keeps each style's established compact footprint (#0787/#0798/#0807); the
 * numeric values are the target inline allocation in character widths of the
 * surrounding label font. A hand-written numeric TOML value (`2`) normalizes to
 * the equivalent string (`"2"`).
 */
export const ACTIVITY_ANIMATION_SIZES = ["auto", "1", "1.5", "2", "2.5", "3"] as const;

export type ActivityAnimationSize = (typeof ACTIVITY_ANIMATION_SIZES)[number];

export const DEFAULT_ACTIVITY_ANIMATION_SIZE: ActivityAnimationSize = "auto";

export const ACTIVITY_ANIMATION_SIZE_LABELS: Record<ActivityAnimationSize, string> = {
  auto: "Auto",
  "1": "1ch",
  "1.5": "1.5ch",
  "2": "2ch",
  "2.5": "2.5ch",
  "3": "3ch",
};

/**
 * Each compact style's existing reserved slot in `ch`, measured in the label's
 * own font. `auto` keeps these exact slots; an explicit size scales the artwork
 * and motion by `target / slot` while reserving exactly `target` ch. Keep in
 * sync with the per-style `--ai-w` declarations in `src/ui-app/src/style.css`.
 */
export const ACTIVITY_ANIMATION_STYLE_SLOT_CH: Record<ActivityAnimationStyle, number> = {
  "orbital-pixel": 1.75,
  "cursor-scan-pulse": 1.5,
  "breathing-brackets": 2,
  "micro-dot-matrix": 1.5,
  "tiny-signal-bars": 1.5,
  "spark-diamond": 2,
  "arcade-hopper": 2,
  "puppy-tracks": 2,
  // The legacy dot row sizes its own px geometry; explicit sizes scale it in
  // CSS from `--ai-size-ch` instead of using a compact slot.
  "three-dots": 0,
};

export function isActivityAnimationSize(value: unknown): value is ActivityAnimationSize {
  return (
    typeof value === "string" && (ACTIVITY_ANIMATION_SIZES as readonly string[]).includes(value)
  );
}

/**
 * Normalize a configured size. Accepts the canonical strings plus numeric TOML
 * values that land exactly on a slider step; anything else is ignored so the
 * caller falls back to Auto.
 */
export function normalizeActivityAnimationSize(value: unknown): ActivityAnimationSize | undefined {
  if (isActivityAnimationSize(value)) return value;
  if (typeof value === "number") {
    const text = String(value);
    if (isActivityAnimationSize(text)) return text;
  }
  return undefined;
}

export function activityAnimationSizeOrDefault(
  size: ActivityAnimationSize | undefined,
): ActivityAnimationSize {
  return size ?? DEFAULT_ACTIVITY_ANIMATION_SIZE;
}

/** Numeric target width in `ch`, or `null` for Auto. */
export function activityAnimationSizeCh(size: ActivityAnimationSize): number | null {
  return size === "auto" ? null : Number(size);
}
