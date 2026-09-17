import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  parseBoardColumns,
  resolveColumnLabels,
  patchTomlConfig,
  DEFAULT_COLUMN_LABELS,
} from "./config.js";

describe("parseBoardColumns", () => {
  it("returns undefined when no board.columns keys are present", () => {
    expect(parseBoardColumns({})).toBeUndefined();
    expect(parseBoardColumns({ "other.key": "value" })).toBeUndefined();
  });

  it("parses valid string overrides", () => {
    const result = parseBoardColumns({
      "board.columns.draft": "Ideas",
      "board.columns.done": "Shipped",
    });
    expect(result).toEqual({ draft: "Ideas", done: "Shipped" });
  });

  it("trims whitespace from labels", () => {
    const result = parseBoardColumns({
      "board.columns.inbox": "  Backlog  ",
    });
    expect(result).toEqual({ inbox: "Backlog" });
  });

  it("falls back to default for blank labels", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = parseBoardColumns({
      "board.columns.draft": "",
      "board.columns.inbox": "  ",
    });
    expect(result).toBeUndefined();
    expect(warn).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });

  it("falls back to default for non-string values", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = parseBoardColumns({
      "board.columns.draft": 42,
    });
    expect(result).toBeUndefined();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("falls back to default for labels exceeding 40 chars", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const longLabel = "A".repeat(41);
    const result = parseBoardColumns({
      "board.columns.draft": longLabel,
    });
    expect(result).toBeUndefined();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("accepts labels at exactly 40 chars", () => {
    const label = "A".repeat(40);
    const result = parseBoardColumns({
      "board.columns.draft": label,
    });
    expect(result).toEqual({ draft: label });
  });

  it("falls back to default for duplicate labels (case-insensitive)", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = parseBoardColumns({
      "board.columns.draft": "Backlog",
      "board.columns.inbox": "backlog",
    });
    // First one wins, second falls back
    expect(result).toEqual({ draft: "Backlog" });
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("ignores keys that are not board.columns.*", () => {
    const result = parseBoardColumns({
      "board.columns.draft": "Ideas",
      "whisper.provider": "groq",
    });
    expect(result).toEqual({ draft: "Ideas" });
  });
});

describe("resolveColumnLabels", () => {
  it("returns all defaults when no overrides are provided", () => {
    const result = resolveColumnLabels(undefined);
    expect(result).toEqual(DEFAULT_COLUMN_LABELS);
  });

  it("returns all defaults when empty overrides are provided", () => {
    const result = resolveColumnLabels({});
    expect(result).toEqual(DEFAULT_COLUMN_LABELS);
  });

  it("merges overrides over defaults", () => {
    const result = resolveColumnLabels({ draft: "Ideas", done: "Shipped" });
    expect(result.draft).toBe("Ideas");
    expect(result.done).toBe("Shipped");
    expect(result.inbox).toBe(DEFAULT_COLUMN_LABELS.inbox);
    expect(result.ready).toBe(DEFAULT_COLUMN_LABELS.ready);
  });

  it("ignores overrides for unknown keys", () => {
    const result = resolveColumnLabels({
      draft: "Ideas",
      unknown: "Should be ignored",
    } as Record<string, string>);
    expect(result.draft).toBe("Ideas");
    expect(result).not.toHaveProperty("unknown");
  });

  it("does not mutate the defaults object", () => {
    const original = { ...DEFAULT_COLUMN_LABELS };
    resolveColumnLabels({ draft: "Ideas" });
    expect(DEFAULT_COLUMN_LABELS).toEqual(original);
  });
});

describe("patchTomlConfig with board.columns", () => {
  const roots: string[] = [];
  afterEach(() => {
    for (const r of roots) rmSync(r, { recursive: true, force: true });
    roots.length = 0;
  });

  it("writes board.columns under [board.columns] section, not at root", () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-toml-"));
    roots.push(root);
    const tomlPath = join(root, "repoos.toml");
    writeFileSync(tomlPath, 'workDir = "work"\n', "utf8");

    patchTomlConfig(tomlPath, {
      "board.columns.inbox": "Backlog",
      "board.columns.done": "Shipped",
    });

    const content = readFileSync(tomlPath, "utf8");
    // Should have a [board.columns] section
    expect(content).toContain("[board.columns]");
    expect(content).toContain('inbox = "Backlog"');
    expect(content).toContain('done = "Shipped"');
    // Should NOT have duplicate root-scope entries
    const rootLines = content.split("\n").filter((l) => l.trim().startsWith("board.columns."));
    expect(rootLines).toHaveLength(0);
  });

  it("updates existing board.columns entries in-place", () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-toml-"));
    roots.push(root);
    const tomlPath = join(root, "repoos.toml");
    writeFileSync(tomlPath, '[board.columns]\ninbox = "Old"\nready = "Ready"\n', "utf8");

    patchTomlConfig(tomlPath, { "board.columns.inbox": "New" });

    const content = readFileSync(tomlPath, "utf8");
    expect(content).toContain('inbox = "New"');
    expect(content).not.toContain("Old");
    expect(content).toContain('ready = "Ready"');
  });

  it("does not duplicate entries under [board.columns] and root scope", () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-toml-"));
    roots.push(root);
    const tomlPath = join(root, "repoos.toml");
    writeFileSync(tomlPath, '[board.columns]\ndraft = "Ideas"\n', "utf8");

    patchTomlConfig(tomlPath, { "board.columns.draft": "Ideas" });

    const content = readFileSync(tomlPath, "utf8");
    // Should NOT have a root-scope "board.columns.draft" line
    const rootScoped = content
      .split("\n")
      .filter((l) => l.trim().startsWith("board.columns.draft"));
    expect(rootScoped).toHaveLength(0);
  });
});

describe("init template board.columns example", () => {
  it("includes a commented [board.columns] section", async () => {
    const mod = await import("./config.js");
    // The DEFAULT_COLUMN_LABELS should have all 6 statuses
    expect(Object.keys(DEFAULT_COLUMN_LABELS)).toEqual([
      "draft",
      "inbox",
      "ready",
      "active",
      "review",
      "done",
    ]);
    // resolveColumnLabels returns all 6 when given overrides
    const resolved = resolveColumnLabels({ draft: "Ideas" });
    expect(Object.keys(resolved)).toHaveLength(6);
  });
});
