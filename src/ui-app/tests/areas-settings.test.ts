/**
 * `[areas]` vocabulary round trips (#0583): Settings PATCH writes `[[areas]]`
 * rows, preserves descriptions for unchanged names, and an empty list is the
 * deliberate "free text only" state — never a 400.
 */
import { describe, expect, it } from "vitest";
import { Readable } from "node:stream";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getConfigSchema, loadConfig, SUPPORTED_TOML_KEYS } from "../../core/config.js";
import { patchConfig, safeConfigForBrowser } from "../../server/routes/config.js";

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

function repo(toml: string): string {
  const root = mkdtempSync(join(tmpdir(), "repoos-areas-patch-"));
  writeFileSync(join(root, "repoos.toml"), toml);
  return root;
}

describe("Settings PATCH for [areas] (#0583)", () => {
  it("writes the declared vocabulary as [[areas]] rows", async () => {
    const root = repo('workDir = "work"\n');
    try {
      const res = await patch(root, { areas: ["web", "core"] });
      expect(res.status).toBe(200);
      expect(loadConfig(root).areas).toEqual([{ name: "web" }, { name: "core" }]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("preserves hand-written descriptions for unchanged names", async () => {
    const root = repo('[[areas]]\nname = "web"\ndescription = "The main app"\n');
    try {
      const res = await patch(root, { areas: ["web", "cli"] });
      expect(res.status).toBe(200);
      expect(loadConfig(root).areas).toEqual([
        { name: "web", description: "The main app" },
        { name: "cli" },
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("accepts an empty list as the free-text-only state, not a validation failure", async () => {
    const root = repo('areas = ["web"]\n');
    try {
      const res = await patch(root, { areas: [] });
      expect(res.status).toBe(200);
      // Cleared to nothing: the flat list stays as an explicit empty (the
      // deliberate "free text only" record on disk), parse resolves to no
      // declared vocabulary.
      expect(loadConfig(root).areas).toBeUndefined();
      expect(readFileSync(join(root, "repoos.toml"), "utf8")).toContain("areas = []");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("does not touch repoos.toml when the submitted list already matches disk", async () => {
    const root = repo('workDir = "work"\n'); // no vocabulary, nothing declared
    try {
      const before = readFileSync(join(root, "repoos.toml"), "utf8");
      const res = await patch(root, { areas: [] });
      expect(res.status).toBe(200);
      // A visible schema field repeats its current value in EVERY unrelated
      // Settings save; a no-op must never dirty the file.
      expect(readFileSync(join(root, "repoos.toml"), "utf8")).toBe(before);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("does not touch repoos.toml when a non-empty list already matches disk", async () => {
    const root = repo('[[areas]]\nname = "web"\n');
    try {
      const before = readFileSync(join(root, "repoos.toml"), "utf8");
      const res = await patch(root, { areas: ["web"] });
      expect(res.status).toBe(200);
      expect(readFileSync(join(root, "repoos.toml"), "utf8")).toBe(before);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("rejects non-string entries with a clear 400", async () => {
    const root = repo('workDir = "work"\n');
    try {
      const res = await patch(root, { areas: ["web", ""] });
      expect(res.status).toBe(400);
      expect(res.payload.error).toContain("non-empty");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("exposes declared names plus a merged areaVocabulary to the browser", async () => {
    const root = repo(
      '[[areas]]\nname = "web"\n[[preview.targets]]\nname = "docsT"\nareas = ["docs"]\ncommand = "x"\n',
    );
    try {
      const res = await patch(root, { areas: ["web"] });
      const config = res.payload.config as Record<string, unknown>;
      expect(config.areas).toEqual(["web"]);
      expect(config.areaVocabulary).toEqual([{ name: "web" }, { name: "docs" }]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("stays in the documented TOML contract", () => {
    expect(SUPPORTED_TOML_KEYS).toContain("areas");
    expect(SUPPORTED_TOML_KEYS).toContain("areas.name");
    expect(SUPPORTED_TOML_KEYS).toContain("areas.description");
  });

  it("has a Settings UI row (General tab), not just a schema entry", () => {
    const field = getConfigSchema().find((f) => f.key === "areas");
    expect(field).toBeDefined();
    const loc = resolveSettingLocation("areas", field, { inspectorAvailable: true });
    expect(loc).toEqual({ tab: "general", hasUiRow: true });
  });
});

import { resolveSettingLocation } from "../src/settings-location.js";

describe("safeConfigForBrowser — area names only in the array form", () => {
  it("flattens declared rows into names for the Settings form", () => {
    const config = safeConfigForBrowser({
      areas: [{ name: "web", description: "hidden from edit" }],
    });
    expect(config.areas).toEqual(["web"]);
  });
});
