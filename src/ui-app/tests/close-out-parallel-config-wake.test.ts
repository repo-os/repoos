/**
 * Live `maxParallelValidations` saves (#1275): a raised limit must wake the
 * close-out pump now, so queued validations start without waiting for another
 * close-out event. An unchanged limit must not wake it.
 */
import { describe, expect, it, vi } from "vitest";
import { Readable } from "node:stream";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "../../core/config.js";
import { patchConfig } from "../../server/routes/config.js";

function setup() {
  const root = mkdtempSync(join(tmpdir(), "repoos-parallel-wake-"));
  writeFileSync(join(root, "repoos.toml"), "");
  const triggerJobProcessing = vi.fn();
  const ctx = {
    config: { root, cacheDir: loadConfig(root).cacheDir, workDir: loadConfig(root).workDir },
    repoos: { config: loadConfig(root) },
    index: { refreshAll() {}, async refreshAllAsync() {} },
    logger: { system() {}, warn() {} },
    remoteValidator: undefined,
    triggerJobProcessing,
  } as never;
  return { root, ctx, triggerJobProcessing };
}

async function save(ctx: unknown, body: Record<string, unknown>): Promise<number> {
  const req = Readable.from([Buffer.from(JSON.stringify(body))]);
  let status = 0;
  const res = {
    writeHead(code: number) {
      status = code;
      return res;
    },
    end() {},
  };
  await patchConfig(ctx as never, req as never, res as never, {});
  return status;
}

describe("maxParallelValidations live save wakes the pump (#1275)", () => {
  it("wakes the pump once when the limit is raised", async () => {
    const { root, ctx, triggerJobProcessing } = setup();
    try {
      expect(await save(ctx, { maxParallelValidations: 4 })).toBe(200);
      expect(triggerJobProcessing).toHaveBeenCalledTimes(1);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("stays quiet for a save that leaves the limit unchanged", async () => {
    const { root, ctx, triggerJobProcessing } = setup();
    try {
      await save(ctx, { maxParallelValidations: 2 });
      await save(ctx, { maxParallelValidations: 2 });
      expect(triggerJobProcessing).not.toHaveBeenCalled();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
