/**
 * Activity animation size configuration (#0813).
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
  ACTIVITY_ANIMATION_STYLE_SLOT_CH,
  DEFAULT_ACTIVITY_ANIMATION_SIZE,
  activityAnimationSizeCh,
  activityAnimationSizeOrDefault,
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

describe("activity animation size config (#0813)", () => {
  it("defaults to auto when unset, preserving existing repositories", () => {
    withConfig('workDir = "work"\n', (read) => {
      const cfg = read();
      expect(cfg.activityAnimationSize).toBe("auto");
      expect(DEFAULT_ACTIVITY_ANIMATION_SIZE).toBe("auto");
      expect(activityAnimationSizeOrDefault(cfg.activityAnimationSize)).toBe("auto");
      expect(activityAnimationSizeCh("auto")).toBeNull();
    });
  });

  it("loads every documented size and normalizes numeric TOML values", () => {
    for (const size of ACTIVITY_ANIMATION_SIZES) {
      withConfig(`activityAnimationSize = "${size}"\n`, (read) => {
        expect(read().activityAnimationSize).toBe(size);
        expect(normalizeActivityAnimationSize(size)).toBe(size);
      });
    }
    for (const numeric of [1, 1.5, 2, 2.5, 3]) {
      withConfig(`activityAnimationSize = ${numeric}\n`, (read) => {
        expect(read().activityAnimationSize).toBe(String(numeric));
        expect(normalizeActivityAnimationSize(numeric)).toBe(String(numeric));
      });
    }
  });

  it("rejects invalid, out-of-range and non-step values", () => {
    for (const bad of ["0", "0.5", "3.5", "4", "2.25", "large", 2.25, true]) {
      expect(normalizeActivityAnimationSize(bad)).toBeUndefined();
    }
    expect(findConfigValueProblems({ activityAnimationSize: "2.25" })[0]).toContain(
      "activityAnimationSize",
    );
    expect(findConfigValueProblems({ activityAnimationSize: "3" })).toEqual([]);
    expect(findConfigValueProblems({ activityAnimationSize: 2.5 })).toEqual([]);
  });

  it("exposes the identical values through the schema and supported TOML keys", () => {
    const field = getConfigSchema().find((f) => f.key === "activityAnimationSize");
    expect(field?.type).toBe("select");
    expect(field?.default).toBe("auto");
    expect(field?.options?.map((o) => o.value)).toEqual([...ACTIVITY_ANIMATION_SIZES]);
    expect(field?.options?.map((o) => o.label)).toEqual(
      ACTIVITY_ANIMATION_SIZES.map((size) => ACTIVITY_ANIMATION_SIZE_LABELS[size]),
    );
    expect(SUPPORTED_TOML_KEYS).toContain("activityAnimationSize");
  });

  it("keeps a documented Auto slot for every compact style", () => {
    for (const style of ACTIVITY_ANIMATION_STYLES) {
      const slot = ACTIVITY_ANIMATION_STYLE_SLOT_CH[style];
      if (style === "three-dots") expect(slot).toBe(0);
      else expect(slot).toBeGreaterThanOrEqual(1.5);
    }
  });

  it("round-trips the value through the Settings write path and rejects bad steps", async () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-act-size-patch-"));
    try {
      writeFileSync(join(root, "repoos.toml"), 'workDir = "work"\n');
      for (const size of ["1", "1.5", "2", "2.5", "3", "auto"]) {
        const res = await patch(root, { activityAnimationSize: size });
        expect(res.status, `${size}: ${JSON.stringify(res.payload)}`).toBe(200);
        expect(loadConfig(root).activityAnimationSize).toBe(size);
      }
      for (const bad of ["0", "2.25", "3.5", "large"]) {
        const res = await patch(root, { activityAnimationSize: bad });
        expect(res.status, `${bad} should be rejected`).toBe(400);
        expect(loadConfig(root).activityAnimationSize).toBe("auto");
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
