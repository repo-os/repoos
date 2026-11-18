/**
 * Decimal number fields in config validation (#0797): fields like
 * attention.slowRunMultiplier accept decimals (step = 0.1), while
 * whole-number fields reject them. Settings save sends only changed
 * fields, not all fields, so an unchanged decimal field doesn't block.
 */
import { describe, expect, it, afterEach } from "vitest";
import { Readable } from "node:stream";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getConfigSchema, loadConfig, NUMERIC_SELECT_CONFIG_KEYS } from "../../core/config.js";
import { patchConfig } from "../../server/routes/config.js";

const roots: string[] = [];
function tempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "repoos-decimal-test-"));
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

describe("Decimal number fields (#0797)", () => {
  it("attention.slowRunMultiplier has step = 0.1 and min = 0.1 in schema", () => {
    const field = getConfigSchema().find((f) => f.key === "attention.slowRunMultiplier");
    expect(field).toMatchObject({
      type: "number",
      step: 0.1,
      min: 0.1,
    });
  });

  it("accepts 1.5 for slowRunMultiplier", async () => {
    const root = tempRoot();
    writeFileSync(join(root, "repoos.toml"), 'workDir = "work"\n', "utf8");
    const res = await patch(root, { "attention.slowRunMultiplier": 1.5 });
    expect(res.status).toBe(200);
    expect(loadConfig(root).attention?.slowRunMultiplier).toBe(1.5);
  });

  it("accepts 2.25 for slowRunMultiplier", async () => {
    const root = tempRoot();
    writeFileSync(join(root, "repoos.toml"), 'workDir = "work"\n', "utf8");
    const res = await patch(root, { "attention.slowRunMultiplier": 2.25 });
    expect(res.status).toBe(200);
    expect(loadConfig(root).attention?.slowRunMultiplier).toBe(2.25);
  });

  it("rejects 0 for slowRunMultiplier", async () => {
    const root = tempRoot();
    writeFileSync(join(root, "repoos.toml"), 'workDir = "work"\n', "utf8");
    const res = await patch(root, { "attention.slowRunMultiplier": 0 });
    expect(res.status).toBe(400);
    expect(res.payload.error).toContain("must be a number");
  });

  it("rejects -1 for slowRunMultiplier", async () => {
    const root = tempRoot();
    writeFileSync(join(root, "repoos.toml"), 'workDir = "work"\n', "utf8");
    const res = await patch(root, { "attention.slowRunMultiplier": -1 });
    expect(res.status).toBe(400);
    expect(res.payload.error).toContain("must be a number");
  });

  it("whole-number fields still reject decimals", async () => {
    const root = tempRoot();
    writeFileSync(join(root, "repoos.toml"), 'workDir = "work"\n', "utf8");
    const res = await patch(root, { "check.isolationRuns": 1.5 });
    expect(res.status).toBe(400);
    expect(res.payload.error).toContain("must be a whole number");
  });
});

describe("PATCH with decimal fields (#0797)", () => {
  it("succeeds when sending both changed and unchanged decimal field", async () => {
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
    // Simulate sending both fields (old behavior - send everything)
    const res = await patch(root, {
      activityAnimationStyle: "cursor-scan-pulse",
      "attention.slowRunMultiplier": 1.5,
    });
    expect(res.status).toBe(200);
    expect(loadConfig(root).activityAnimationStyle).toBe("cursor-scan-pulse");
    expect(loadConfig(root).attention?.slowRunMultiplier).toBe(1.5);
  });
});

describe("numeric enum select fields (#1161)", () => {
  const numericEnums = [
    ["maxActiveTasks", 5],
    ["maxConcurrentAgents", 4],
    ["remoteValidation.maxConcurrent", 3],
    ["worktreeWarnThreshold", 25],
    ["heavySlots", 3],
    ["vitest.maxWorkers", 4],
    ["localChecks.maxConcurrent", 3],
    ["playwright.workers", 3],
    ["playwright.maxConcurrent", 2],
  ] as const;

  it("covers the shared list of numeric select settings", () => {
    expect(numericEnums.map(([key]) => key)).toEqual(NUMERIC_SELECT_CONFIG_KEYS);
  });

  it.each(numericEnums)("accepts number and string forms for %s", async (key, value) => {
    const field = getConfigSchema().find((candidate) => candidate.key === key);
    expect(field?.type).toBe("select");
    expect(field?.options?.some((option) => Number(option.value) === value)).toBe(true);

    for (const wireValue of [value, String(value)]) {
      const root = tempRoot();
      writeFileSync(join(root, "repoos.toml"), 'workDir = "work"\n', "utf8");
      const res = await patch(root, { [key]: wireValue });
      expect(res.status, `${key} with ${typeof wireValue}`).toBe(200);
      const parsed = key.split(".").reduce<unknown>((current, part) => {
        if (!current || typeof current !== "object") return undefined;
        return (current as Record<string, unknown>)[part];
      }, loadConfig(root));
      expect(parsed, `${key} with ${typeof wireValue}`).toBe(value);
      const toml = readFileSync(join(root, "repoos.toml"), "utf8");
      expect(toml).not.toContain(`${key.split(".").at(-1)} = "${value}"`);
    }
  });
});
