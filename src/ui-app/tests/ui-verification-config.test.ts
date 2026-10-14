/**
 * #0680 — Settings schema and TOML contract for UI handoff verification.
 * #0766 — stale-only reviews stay in review (no engineer bounce), and the
 * removed `uiVerification.autoRefreshStaleOnce` setting no longer exists.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getConfigSchema, loadConfig, SUPPORTED_TOML_KEYS } from "../../core/config.js";
import type { Agent, RepoOSConfig, Task } from "../../core/types.js";
import { resolvedUiVerification } from "../../core/ui-verification-config.js";
import { resolveSettingLocation } from "../src/settings-location.js";
import { ReviewManager } from "../../server/review.js";

describe("uiVerification config (#0680)", () => {
  it("defaults to enabled with standard viewports", () => {
    const dir = mkdtempSync(join(tmpdir(), "repoos-uiv-cfg-"));
    try {
      const cfg = loadConfig(dir);
      expect(resolvedUiVerification(cfg).enabled).toBe(true);
      expect(resolvedUiVerification(cfg).viewportWidths).toEqual([1024, 375]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("reads flat TOML keys", () => {
    const dir = mkdtempSync(join(tmpdir(), "repoos-uiv-cfg-"));
    writeFileSync(
      join(dir, "repoos.toml"),
      "uiVerification.enabled = false\nuiVerification.viewportWidths = [1280, 390]\n",
    );
    try {
      const cfg = loadConfig(dir);
      expect(cfg.uiVerification?.enabled).toBe(false);
      expect(cfg.uiVerification?.viewportWidths).toEqual([1280, 390]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("exposes Settings controls and documents TOML keys", () => {
    const enabled = getConfigSchema().find((f) => f.key === "uiVerification.enabled");
    expect(enabled).toMatchObject({ type: "boolean", tier: "live", default: true });
    const widths = getConfigSchema().find((f) => f.key === "uiVerification.viewportWidths");
    expect(widths?.type).toBe("array");
    expect(SUPPORTED_TOML_KEYS).toContain("uiVerification.enabled");
    expect(SUPPORTED_TOML_KEYS).toContain("uiVerification.viewportWidths");
    const loc = resolveSettingLocation("uiVerification.enabled", enabled, {
      inspectorAvailable: true,
    });
    expect(loc).toEqual({ tab: "general", hasUiRow: true });
  });

  it("no longer defines the removed autoRefreshStaleOnce setting (#0766)", () => {
    // #0772 re-adds the automatic path; until then no schema key, no TOML key,
    // and no Settings control may exist for a setting nothing reads.
    expect(getConfigSchema().some((f) => f.key === "uiVerification.autoRefreshStaleOnce")).toBe(
      false,
    );
    expect(SUPPORTED_TOML_KEYS).not.toContain("uiVerification.autoRefreshStaleOnce");
    const dir = mkdtempSync(join(tmpdir(), "repoos-uiv-cfg-"));
    writeFileSync(join(dir, "repoos.toml"), "uiVerification.autoRefreshStaleOnce = true\n");
    try {
      const cfg = loadConfig(dir);
      expect(cfg.uiVerification?.enabled).toBeUndefined();
      expect(resolvedUiVerification(cfg).enabled).toBe(true);
      // An old config file carrying the key must simply be ignored, not parsed.
      expect(
        (cfg.uiVerification as Record<string, unknown> | undefined)?.autoRefreshStaleOnce,
      ).toBeUndefined();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("stale-only review stays in review (#0766)", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "repoos-stale-review-"));
    mkdirSync(join(root, "work"), { recursive: true });
    mkdirSync(join(root, ".repoos", "reviews"), { recursive: true });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  function writeTask(): { task: Task; absPath: string } {
    const absPath = join(root, "work", "0766-stale.md");
    writeFileSync(
      absPath,
      `---\nid: "0766"\ntitle: stale review\ntype: feature\nstatus: review\npriority: p2\narea: server\n---\n\nbody\n`,
    );
    return {
      task: {
        id: "0766",
        title: "stale review",
        status: "review",
        path: "work/0766-stale.md",
        absPath,
      } as Task,
      absPath,
    };
  }

  /** A manager whose engineer session is genuinely resumable, so a bounce would change status. */
  function makeManager(): { reviews: ReviewManager; sent: () => number } {
    let sent = 0;
    const config = {
      root,
      workDir: "work",
      docsDir: "docs",
      skillsDir: "skills",
      taskExtensions: [".md"],
      defaultStatus: "inbox",
      defaultAssignee: "unassigned",
      cacheDir: ".repoos",
      agents: [
        { name: "reviewer", cli: "fake", model: "m", enabled: true },
        { name: "engineer", cli: "fake", model: "m", enabled: true },
      ],
    } as RepoOSConfig;
    const runner = {
      output: () => [{ type: "text", text: "engineer session" }],
      send: () => {
        sent += 1;
        return { ok: true };
      },
      system: () => {},
    };
    return { reviews: new ReviewManager(config, () => {}, runner as never), sent: () => sent };
  }

  function finalize(reviews: ReviewManager, task: Task, report: string): void {
    const agent = { name: "reviewer", cli: "fake", model: "m", enabled: true } as Agent;
    (reviews as unknown as { finalizeRun: (...args: unknown[]) => void }).finalizeRun(
      task,
      agent,
      [{ type: "text", text: report }],
      { accumulatedMs: 1 },
      false,
    );
  }

  it("does not bounce the engineer and leaves the task in review", async () => {
    const { reviews, sent } = makeManager();
    const { task, absPath } = writeTask();
    finalize(reviews, task, "## Verdict\n`needs some work` — STALE-EVIDENCE-ONLY\n");
    // Let the fire-and-forget auto-bounce path settle; it must not run at all.
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(sent()).toBe(0);
    const content = readFileSync(absPath, "utf8");
    expect(content).toContain("status: review");
    expect(content).not.toContain("status: active");
    expect(content).not.toContain("review_rounds");
  });

  it("still bounces an ordinary non-good verdict", async () => {
    const { reviews, sent } = makeManager();
    const { task, absPath } = writeTask();
    finalize(reviews, task, "## Verdict\n`needs some work` — fix the tests.\n");
    await vi.waitFor(() => {
      expect(readFileSync(absPath, "utf8")).toContain("status: active");
    });
    expect(sent()).toBe(1);
  });
});
