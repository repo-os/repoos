import { describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ACTIVITY_ANIMATION_STYLES,
  ACTIVITY_ANIMATION_STYLE_LABELS,
  DEFAULT_ACTIVITY_ANIMATION_STYLE,
  activityAnimationStyleOrDefault,
  normalizeActivityAnimationStyle,
} from "./activity-animation.js";
import { getConfigSchema, loadConfig, SUPPORTED_TOML_KEYS } from "./config.js";
import { findConfigValueProblems } from "./doctor.js";

describe("activity animation config (#0787)", () => {
  it("defaults to orbital-pixel when unset", () => {
    const dir = mkdtempSync(join(tmpdir(), "repoos-act-"));
    try {
      writeFileSync(join(dir, "repoos.toml"), 'workDir = "work"\n');
      const cfg = loadConfig(dir);
      expect(cfg.activityAnimationStyle).toBe(DEFAULT_ACTIVITY_ANIMATION_STYLE);
      expect(activityAnimationStyleOrDefault(cfg.activityAnimationStyle)).toBe(
        DEFAULT_ACTIVITY_ANIMATION_STYLE,
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("loads and validates every style from repoos.toml", () => {
    const dir = mkdtempSync(join(tmpdir(), "repoos-act-"));
    try {
      for (const style of ACTIVITY_ANIMATION_STYLES) {
        writeFileSync(join(dir, "repoos.toml"), `activityAnimationStyle = "${style}"\n`);
        const cfg = loadConfig(dir);
        expect(cfg.activityAnimationStyle).toBe(style);
        expect(normalizeActivityAnimationStyle(style)).toBe(style);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("rejects invalid values in doctor", () => {
    expect(findConfigValueProblems({ activityAnimationStyle: "bounce" })[0]).toContain(
      "activityAnimationStyle",
    );
    expect(findConfigValueProblems({ activityAnimationStyle: "three-dots" })).toEqual([]);
  });

  it("exposes the setting in schema and supported keys", () => {
    const field = getConfigSchema().find((f) => f.key === "activityAnimationStyle");
    expect(field?.type).toBe("select");
    expect(field?.default).toBe("orbital-pixel");
    expect(field?.options?.map((o) => o.value)).toEqual([...ACTIVITY_ANIMATION_STYLES]);
    expect(SUPPORTED_TOML_KEYS).toContain("activityAnimationStyle");
  });

  it("adds arcade-hopper and puppy-tracks without moving the orbital default (#0807)", () => {
    expect(ACTIVITY_ANIMATION_STYLES).toContain("arcade-hopper");
    expect(ACTIVITY_ANIMATION_STYLES).toContain("puppy-tracks");
    expect(ACTIVITY_ANIMATION_STYLE_LABELS["arcade-hopper"]).toBe("Arcade hopper");
    expect(ACTIVITY_ANIMATION_STYLE_LABELS["puppy-tracks"]).toBe("Puppy tracks");
    expect(DEFAULT_ACTIVITY_ANIMATION_STYLE).toBe("orbital-pixel");
  });

  it("adds bird-quick-trail without moving the orbital default (#0822)", () => {
    expect(ACTIVITY_ANIMATION_STYLES).toContain("bird-quick-trail");
    expect(ACTIVITY_ANIMATION_STYLE_LABELS["bird-quick-trail"]).toBe("Bird quick trail");
    expect(DEFAULT_ACTIVITY_ANIMATION_STYLE).toBe("orbital-pixel");
  });
});
