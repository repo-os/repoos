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
