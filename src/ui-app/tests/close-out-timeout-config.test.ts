/**
 * #0573 — the `[closeOut] timeoutMs` config key: default, `0` = disabled,
 * invalid/negative clamped to the default with a clear warning (the chosen
 * policy — a typo in repoos.toml must never brick config load), the Settings
 * UI/schema + docs contract around it, and the PATCH path that writes it.
 */
import { describe, expect, it, vi } from "vitest";
import { Readable } from "node:stream";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getConfigSchema, loadConfig, SUPPORTED_TOML_KEYS } from "../../core/config.js";
import { patchConfig } from "../../server/routes/config.js";

function withToml(toml: string) {
  const dir = mkdtempSync(join(tmpdir(), "repoos-closeout-cfg-"));
  writeFileSync(join(dir, "repoos.toml"), toml);
  try {
    return loadConfig(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** PATCH /api/config harness (mirrors remote-host-config.test.ts). */
async function patch(
  root: string,
  body: Record<string, unknown>,
): Promise<{ status: number; payload: { error?: string } }> {
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
  } as never;
  await patchConfig(ctx, req as never, res as never, {});
  return { status: res.statusCode ?? 0, payload: JSON.parse(res.payload ?? "{}") };
}

describe("[closeOut] timeoutMs (#0573)", () => {
  it("defaults to 360000 (6 minutes) when the section is absent", () => {
    const dir = mkdtempSync(join(tmpdir(), "repoos-closeout-cfg-"));
    try {
      expect(loadConfig(dir).closeOut?.timeoutMs).toBe(360_000);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("reads a configured budget, including 0 = disabled", () => {
    expect(withToml("[closeOut]\ntimeoutMs = 600000\n").closeOut?.timeoutMs).toBe(600_000);
    // 0 must survive as 0 — it is "disabled", not "unset".
    expect(withToml("closeOut.timeoutMs = 0\n").closeOut?.timeoutMs).toBe(0);
    expect(withToml("[closeOut]\ntimeoutMs = 0\n").closeOut?.timeoutMs).toBe(0);
  });

  it("clamps negative or non-numeric values to the default with a clear warning", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      expect(withToml("[closeOut]\ntimeoutMs = -5\n").closeOut?.timeoutMs).toBe(360_000);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining("[closeOut] timeoutMs"));

      warn.mockClear();
      expect(withToml('[closeOut]\ntimeoutMs = "soon"\n').closeOut?.timeoutMs).toBe(360_000);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining("timeoutMs must be a number"));
      expect(warn).toHaveBeenCalledWith(expect.stringContaining("360000"));
    } finally {
      warn.mockRestore();
    }
  });

  it("exposes a live Settings select and stays in the documented TOML contract", () => {
    const field = getConfigSchema().find((f) => f.key === "closeOut.timeoutMs");
    expect(field).toMatchObject({
      type: "select",
      tier: "live",
      restartRequired: false,
      default: 360_000,
    });
    // "Off (no limit)" must be choosable from the UI, presets are human-readable.
    const values = field?.options?.map((o) => o.value) ?? [];
    expect(values).toContain("0");
    expect(field!.options!.find((o) => o.value === "360000")!.label).toContain("min");
    expect(field!.description).toMatch(/monotonic|system sleep|adaptive/i);
    expect(SUPPORTED_TOML_KEYS).toContain("closeOut.timeoutMs");
  });
});

describe("Settings PATCH for closeOut.timeoutMs (#0573)", () => {
  function repo(toml: string): string {
    const root = mkdtempSync(join(tmpdir(), "repoos-closeout-patch-"));
    writeFileSync(join(root, "repoos.toml"), toml);
    return root;
  }

  it("writes a preset from the select as a TOML number, not a string", async () => {
    const root = repo('workDir = "work"\n');
    try {
      const res = await patch(root, { "closeOut.timeoutMs": "600000" });
      expect(res.status).toBe(200);
      const text = readFileSync(join(root, "repoos.toml"), "utf8");
      // `closeOut.timeoutMs = "600000"` would be rejected by loadConfig — the
      // select submits strings, so the route must serialise numeric syntax.
      expect(text).toContain("closeOut.timeoutMs = 600000");
      expect(loadConfig(root).closeOut?.timeoutMs).toBe(600_000);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("accepts a hand-written value outside the preset list instead of 400ing the save", async () => {
    const root = repo('workDir = "work"\n');
    try {
      // A raw-editor value like 450000 is not one of the select's option
      // labels; an options-only validation would fail EVERY later Settings save.
      const res = await patch(root, { "closeOut.timeoutMs": "450000" });
      expect(res.status).toBe(200);
      expect(loadConfig(root).closeOut?.timeoutMs).toBe(450_000);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("round-trips Off (0) — including through an existing [closeOut] section", async () => {
    const root = repo("[closeOut]\ntimeoutMs = 600000\n");
    try {
      const res = await patch(root, { "closeOut.timeoutMs": "0" });
      expect(res.status).toBe(200);
      const text = readFileSync(join(root, "repoos.toml"), "utf8");
      expect(text).toContain("timeoutMs = 0");
      expect(text).not.toContain("600000");
      // 0 must parse as "disabled", never fall back to the default.
      expect(loadConfig(root).closeOut?.timeoutMs).toBe(0);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("rejects a negative or non-numeric budget with a clear 400", async () => {
    const root = repo('workDir = "work"\n');
    try {
      const neg = await patch(root, { "closeOut.timeoutMs": "-5" });
      expect(neg.status).toBe(400);
      expect(neg.payload.error).toContain("0 (disabled)");
      const junk = await patch(root, { "closeOut.timeoutMs": "soon" });
      expect(junk.status).toBe(400);
      // The file is untouched by the rejected save.
      expect(readFileSync(join(root, "repoos.toml"), "utf8")).not.toContain("closeOut");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
