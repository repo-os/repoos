/**
 * Settings view sends only changed fields on save (#0797).
 * This prevents an unchanged decimal field from blocking a save.
 */
import { describe, it, expect, afterEach } from "vitest";
import { Readable } from "node:stream";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "../../core/config.js";
import { patchConfig } from "../../server/routes/config.js";

const roots: string[] = [];
function tempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "repoos-settings-changed-test-"));
  roots.push(root);
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

async function patch(root: string, body: Record<string, unknown>) {
  const cfg = loadConfig(root);
  const req = Readable.from([Buffer.from(JSON.stringify(body))]);
  const res: {
    statusCode?: number;
    payload?: string;
    writeHead(code: number): unknown;
    end(payload: string): void;
  } = {
    writeHead(code: number) {
      this.statusCode = code;
    },
    end(payload: string) {
      this.payload = payload;
    },
  };
  const ctx = {
    config: { root, cacheDir: cfg.cacheDir, workDir: cfg.workDir },
    repoos: { config: cfg },
    index: { refreshAll() {} },
    logger: { system() {} },
  } as never;
  await patchConfig(ctx, req as never, res as never, {});
  return { status: res.statusCode ?? 0, payload: JSON.parse(res.payload ?? "{}") };
}

describe("Settings save sends only changed fields (#0797)", () => {
  it("succeeds when changing one field while leaving decimal field unchanged", async () => {
    const root = tempRoot();
    writeFileSync(
      join(root, "repoos.toml"),
      [
        'workDir = "work"',
        'activityAnimationStyle = "orbital-pixel"',
        "[attention]",
        "slowRunMultiplier = 1.5",
      ].join("\n"),
    );

    // Simulate SettingsView sending only changed fields (not slowRunMultiplier)
    // The old buggy behavior would send slowRunMultiplier: 1.5, which should fail
    // but now sends only the changed field, which should succeed
    const res = await patch(root, { activityAnimationStyle: "cursor-scan-pulse" });
    expect(res.status).toBe(200);
    expect(loadConfig(root).activityAnimationStyle).toBe("cursor-scan-pulse");
    expect(loadConfig(root).attention?.slowRunMultiplier).toBe(1.5);
  });
});
