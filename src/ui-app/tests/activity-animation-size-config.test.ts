/**
 * Activity animation size configuration (#0813, fixed pixels #0816).
 *
 * The vitest root is `src/ui-app`, so core config tests live here alongside the
 * other repoos.toml round-trip suites (see decimal-number-fields.test.ts).
 */
import { describe, expect, it } from "vitest";
import { Readable } from "node:stream";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ACTIVITY_ANIMATION_SIZES,
  ACTIVITY_ANIMATION_SIZE_LABELS,
  ACTIVITY_ANIMATION_STYLES,
  ACTIVITY_ANIMATION_STYLE_SLOT,
  DEFAULT_ACTIVITY_ANIMATION_SIZE,
  activityAnimationSizeOrDefault,
  activityAnimationSizePx,
  normalizeActivityAnimationSize,
} from "../../core/activity-animation.js";
import { getConfigSchema, loadConfig, SUPPORTED_TOML_KEYS } from "../../core/config.js";
import { findConfigValueProblems } from "../../core/doctor.js";
import { patchConfig } from "../../server/routes/config.js";

async function patch(
  root: string,
  body: Record<string, unknown>,
): Promise<{ status: number; payload: Record<string, unknown> }> {
  const req = Readable.from([Buffer.from(JSON.stringify(body))]);
  const res: {
    statusCode?: number;
    payload?: string;
    writeHead(code: number): unknown;
    end(payload: string): void;
  } = {
    writeHead(code: number) {
      res.statusCode = code;
      return res;
    },
    end(payload: string) {
      res.payload = payload;
    },
  };
  const cfg = loadConfig(root);
  const ctx = {
    config: { root, cacheDir: cfg.cacheDir, workDir: cfg.workDir },
    repoos: { config: cfg },
    index: { refreshAll() {} },
    logger: { system() {} },
  } as never;
  await patchConfig(ctx, req as never, res as never, {});
  return { status: res.statusCode ?? 0, payload: JSON.parse(res.payload ?? "{}") };
}

function withConfig(toml: string, run: (read: () => ReturnType<typeof loadConfig>) => void): void {
  const dir = mkdtempSync(join(tmpdir(), "repoos-act-size-"));
  try {
    writeFileSync(join(dir, "repoos.toml"), toml);
    run(() => loadConfig(dir));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe("activity animation size config (#0813, pixels #0816)", () => {
  it("defaults to a fixed pixel size when unset", () => {
    withConfig('workDir = "work"\n', (read) => {
      const cfg = read();
      expect(cfg.activityAnimationSize).toBe(DEFAULT_ACTIVITY_ANIMATION_SIZE);
      expect(activityAnimationSizeOrDefault(cfg.activityAnimationSize)).toBe(
        DEFAULT_ACTIVITY_ANIMATION_SIZE,
      );
      expect(activityAnimationSizePx(DEFAULT_ACTIVITY_ANIMATION_SIZE)).toBe(
        Number(DEFAULT_ACTIVITY_ANIMATION_SIZE),
      );
    });
  });

  it("loads every documented size and normalizes numeric TOML values", () => {
    for (const size of ACTIVITY_ANIMATION_SIZES) {
      withConfig(`activityAnimationSize = "${size}"\n`, (read) => {
        expect(read().activityAnimationSize).toBe(size);
        expect(normalizeActivityAnimationSize(size)).toBe(size);
        expect(activityAnimationSizePx(size)).toBe(Number(size));
      });
    }
    for (const numeric of [8, 12, 16, 20, 24]) {
      withConfig(`activityAnimationSize = ${numeric}\n`, (read) => {
        expect(read().activityAnimationSize).toBe(String(numeric));
        expect(normalizeActivityAnimationSize(numeric)).toBe(String(numeric));
      });
    }
  });

  it("maps saved character-width values onto the pixel ladder by ordinal", () => {
    const legacy: Record<string, string> = {
      auto: "16",
      "1": "8",
      "1.5": "12",
      "2": "16",
      "2.5": "20",
      "3": "24",
    };
    for (const [token, mapped] of Object.entries(legacy)) {
      withConfig(`activityAnimationSize = "${token}"\n`, (read) => {
        expect(read().activityAnimationSize).toBe(mapped);
      });
      expect(normalizeActivityAnimationSize(token)).toBe(mapped);
    }
    // Numeric legacy values (e.g. `activityAnimationSize = 2`) map too.
    expect(normalizeActivityAnimationSize(2)).toBe("16");
    expect(normalizeActivityAnimationSize(1.5)).toBe("12");
  });

  it("rejects invalid, out-of-range and non-step values", () => {
    for (const bad of ["0", "15", "30", "2.25", "large", 2.25, true, -4]) {
      expect(normalizeActivityAnimationSize(bad)).toBeUndefined();
    }
    expect(findConfigValueProblems({ activityAnimationSize: "2.25" })[0]).toContain(
      "activityAnimationSize",
    );
    expect(findConfigValueProblems({ activityAnimationSize: "20" })).toEqual([]);
    expect(findConfigValueProblems({ activityAnimationSize: 24 })).toEqual([]);
    // A legacy saved value is still valid, not flagged as a problem.
    expect(findConfigValueProblems({ activityAnimationSize: "2" })).toEqual([]);
    expect(findConfigValueProblems({ activityAnimationSize: "auto" })).toEqual([]);
  });

  it("exposes the identical pixel values through the schema and supported TOML keys", () => {
    const field = getConfigSchema().find((f) => f.key === "activityAnimationSize");
    expect(field?.type).toBe("select");
    expect(field?.default).toBe(DEFAULT_ACTIVITY_ANIMATION_SIZE);
    expect(field?.options?.map((o) => o.value)).toEqual([...ACTIVITY_ANIMATION_SIZES]);
    expect(field?.options?.map((o) => o.label)).toEqual(
      ACTIVITY_ANIMATION_SIZES.map((size) => ACTIVITY_ANIMATION_SIZE_LABELS[size]),
    );
    expect(SUPPORTED_TOML_KEYS).toContain("activityAnimationSize");
  });

  it("keeps a documented slot for every compact style", () => {
    for (const style of ACTIVITY_ANIMATION_STYLES) {
      const slot = ACTIVITY_ANIMATION_STYLE_SLOT[style];
      if (style === "three-dots") expect(slot).toBe(0);
      else expect(slot).toBeGreaterThanOrEqual(0.9);
    }
  });

  it("round-trips the pixel value through the Settings write path and rejects bad steps", async () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-act-size-patch-"));
    try {
      writeFileSync(join(root, "repoos.toml"), 'workDir = "work"\n');
      for (const size of ACTIVITY_ANIMATION_SIZES) {
        const res = await patch(root, { activityAnimationSize: size });
        expect(res.status, `${size}: ${JSON.stringify(res.payload)}`).toBe(200);
        expect(loadConfig(root).activityAnimationSize).toBe(size);
      }
      for (const bad of ["0", "15", "2.25", "large", "auto"]) {
        const res = await patch(root, { activityAnimationSize: bad });
        expect(res.status, `${bad} should be rejected`).toBe(400);
        expect(loadConfig(root).activityAnimationSize).toBe("24");
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
