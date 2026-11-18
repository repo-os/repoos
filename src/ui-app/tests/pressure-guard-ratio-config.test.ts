import { describe, expect, it } from "vitest";
import { Readable } from "node:stream";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getConfigSchema, loadConfig } from "../../core/config.js";
import { patchConfig } from "../../server/routes/config.js";

const ratios = [
  { key: "pressureGuard.minAvailableMemRatio", valid: 0.09, min: 0 },
  { key: "pressureGuard.maxSwapUsedRatio", valid: 0.51, min: 0.01 },
  { key: "pressureGuard.maxCompressorRatio", valid: 0.36, min: 0.01 },
] as const;

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

describe("pressure guard ratio Settings validation", () => {
  it.each(ratios)(
    "accepts decimal values and rejects values outside 0–1 for $key",
    async (ratio) => {
      const dir = mkdtempSync(join(tmpdir(), "repoos-pressure-ratio-"));
      try {
        writeFileSync(join(dir, "repoos.toml"), 'workDir = "work"\n');
        const field = getConfigSchema().find((entry) => entry.key === ratio.key);
        expect(field).toMatchObject({ min: ratio.min, max: 1, step: 0.01 });

        const saved = await patch(dir, { [ratio.key]: ratio.valid });
        expect(saved.status).toBe(200);
        expect(loadConfig(dir).pressureGuard).toMatchObject({
          [ratio.key.split(".").at(-1)!]: ratio.valid,
        });

        for (const invalid of [-0.01, 1.01]) {
          const rejected = await patch(dir, { [ratio.key]: invalid });
          expect(rejected.status).toBe(400);
          expect(rejected.payload.error).toContain("between");
          expect(loadConfig(dir).pressureGuard).toMatchObject({
            [ratio.key.split(".").at(-1)!]: ratio.valid,
          });
        }
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    },
  );
});
