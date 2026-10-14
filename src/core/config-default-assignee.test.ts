/**
 * 0776: new tasks default to the AI assignee, so a fresh board card does not
 * carry the noisy `· open` chip. Existing tasks are untouched — the default
 * only applies when a task is created without an explicit assignee.
 */
import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEFAULT_CONFIG, getConfigSchema, loadConfig } from "./config.js";

describe("default assignee (#0776)", () => {
  it("defaults new tasks to AI", () => {
    expect(DEFAULT_CONFIG.defaultAssignee).toBe("ai");
  });

  it("shows AI as the default in the Settings schema, still overridable", () => {
    const field = getConfigSchema().find((f) => f.key === "defaultAssignee");
    expect(field?.default).toBe("ai");
    expect(field?.options?.map((o) => o.value)).toEqual(["unassigned", "ai", "human"]);
  });

  it("resolves to ai for a repo with no repoos.toml", () => {
    const dir = mkdtempSync(join(tmpdir(), "repoos-default-assignee-"));
    try {
      expect(loadConfig(dir).defaultAssignee).toBe("ai");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
