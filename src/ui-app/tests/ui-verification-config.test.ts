/**
 * #0680 — Settings schema and TOML contract for UI handoff verification.
 * #0766 — stale-only reviews stay in review (no engineer bounce).
 * #0772 — re-adds the opt-in automatic stale refresh setting and wiring.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getConfigSchema, loadConfig, SUPPORTED_TOML_KEYS } from "../../core/config.js";
import type { Agent, RepoOSConfig, Task } from "../../core/types.js";
import { resolvedUiVerification } from "../../core/ui-verification-config.js";
import { resolveSettingLocation } from "../src/settings-location.js";
import {
  ReviewManager,
  isStaleEvidenceOnlyReview,
  shouldAutoRefreshStaleEvidence,
} from "../../server/review.js";
import { isEvidenceGapOnlyReview } from "../../core/review-evidence-gaps.js";

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

  it("exposes the auto-refresh stale evidence setting (#0772)", () => {
    const auto = getConfigSchema().find((f) => f.key === "uiVerification.autoRefreshStaleOnce");
    expect(auto).toMatchObject({ type: "boolean", tier: "live", default: false });
    expect(SUPPORTED_TOML_KEYS).toContain("uiVerification.autoRefreshStaleOnce");
    expect(
      resolveSettingLocation("uiVerification.autoRefreshStaleOnce", auto, {
        inspectorAvailable: true,
      }),
    ).toEqual({ tab: "general", hasUiRow: true });
    const dir = mkdtempSync(join(tmpdir(), "repoos-uiv-cfg-"));
    writeFileSync(join(dir, "repoos.toml"), "uiVerification.autoRefreshStaleOnce = true\n");
    try {
      const cfg = loadConfig(dir);
      expect(cfg.uiVerification?.autoRefreshStaleOnce).toBe(true);
      // The key alone must not invent an `enabled` value.
      expect(cfg.uiVerification?.enabled).toBeUndefined();
      expect(resolvedUiVerification(cfg).enabled).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("only auto-refreshes an explicit stale-only marker when enabled (#0772)", () => {
    const enabled = { uiVerification: { autoRefreshStaleOnce: true } } as RepoOSConfig;
    const disabled = { uiVerification: { autoRefreshStaleOnce: false } } as RepoOSConfig;
    expect(
      shouldAutoRefreshStaleEvidence(
        enabled,
        "## Verdict\nneeds some work. STALE-EVIDENCE-ONLY",
        "needs some work",
      ),
    ).toBe(true);
    expect(
      shouldAutoRefreshStaleEvidence(enabled, "## Verdict\nneeds some work\n", "needs some work"),
    ).toBe(false);
    expect(
      shouldAutoRefreshStaleEvidence(
        disabled,
        "## Verdict\nneeds some work. STALE-EVIDENCE-ONLY",
        "needs some work",
      ),
    ).toBe(false);
    expect(
      shouldAutoRefreshStaleEvidence(
        enabled,
        "## Verdict\ngood to go. STALE-EVIDENCE-ONLY",
        "good to go",
      ),
    ).toBe(false);
    expect(
      isStaleEvidenceOnlyReview(
        "## Verdict\nneeds some work. STALE-EVIDENCE-ONLY",
        "needs some work",
      ),
    ).toBe(true);
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
  function makeManager(
    opts: {
      autoRefresh?: boolean;
      onRefresh?: (task: Task) => Promise<boolean>;
      onEvidenceRepair?: (task: Task) => Promise<boolean>;
    } = {},
  ): {
    reviews: ReviewManager;
    sent: () => number;
    refreshed: () => number;
    repaired: () => number;
  } {
    let sent = 0;
    let refreshed = 0;
    let repaired = 0;
    const config = {
      root,
      workDir: "work",
      docsDir: "docs",
      skillsDir: "skills",
      taskExtensions: [".md"],
      defaultStatus: "inbox",
      defaultAssignee: "unassigned",
      cacheDir: ".repoos",
      ...(opts.autoRefresh ? { uiVerification: { autoRefreshStaleOnce: true } } : {}),
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
    const onRefresh = async (task: Task): Promise<boolean> => {
      refreshed += 1;
      return opts.onRefresh ? opts.onRefresh(task) : false;
    };
    const onEvidenceRepair = async (task: Task): Promise<boolean> => {
      repaired += 1;
      return opts.onEvidenceRepair ? opts.onEvidenceRepair(task) : false;
    };
    return {
      reviews: new ReviewManager(
        config,
        () => {},
        runner as never,
        undefined,
        undefined,
        opts.autoRefresh ? onRefresh : undefined,
        onEvidenceRepair,
      ),
      sent: () => sent,
      refreshed: () => refreshed,
      repaired: () => repaired,
    };
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

  it("stale-only with auto-refresh enabled refreshes once and never bounces (#0772)", async () => {
    const { reviews, sent, refreshed } = makeManager({ autoRefresh: true });
    const { task, absPath } = writeTask();
    finalize(reviews, task, "## Verdict\n`needs some work` — STALE-EVIDENCE-ONLY\n");
    await vi.waitFor(() => {
      expect(refreshed()).toBe(1);
    });
    // Give any stray bounce a chance to run; there must be none.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(sent()).toBe(0);
    expect(refreshed()).toBe(1);
    const content = readFileSync(absPath, "utf8");
    expect(content).toContain("status: review");
    expect(content).not.toContain("status: active");
  });

  it("stale-only with the setting off does not even attempt a refresh (#0772)", async () => {
    const { reviews, sent, refreshed } = makeManager();
    const { task } = writeTask();
    finalize(reviews, task, "## Verdict\n`needs some work` — STALE-EVIDENCE-ONLY\n");
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(sent()).toBe(0);
    expect(refreshed()).toBe(0);
  });
});

describe("evidence-gap-only review stays in review (#0831)", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "repoos-ev-gap-"));
    mkdirSync(join(root, "work"), { recursive: true });
    mkdirSync(join(root, ".repoos", "reviews"), { recursive: true });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  function writeTask(extra = ""): { task: Task; absPath: string } {
    const absPath = join(root, "work", "0831-gap.md");
    writeFileSync(
      absPath,
      `---\nid: "0831"\ntitle: gap\ntype: feature\nstatus: review\npriority: p2\narea: server\n${extra}---\n\nbody\n`,
    );
    return {
      task: {
        id: "0831",
        title: "gap",
        status: "review",
        path: "work/0831-gap.md",
        absPath,
      } as Task,
      absPath,
    };
  }

  function makeManager(
    onEvidenceRepair: (task: Task) => Promise<boolean> = async () => false,
  ): { reviews: ReviewManager; sent: () => number; repaired: () => number } {
    let sent = 0;
    let repaired = 0;
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
    const repair = async (task: Task): Promise<boolean> => {
      repaired += 1;
      return onEvidenceRepair(task);
    };
    return {
      reviews: new ReviewManager(
        config,
        () => {},
        runner as never,
        undefined,
        undefined,
        undefined,
        repair,
      ),
      sent: () => sent,
      repaired: () => repaired,
    };
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

  const gapReport = [
    "## Verdict",
    "`needs some work` — EVIDENCE-GAP-ONLY",
    "",
    "## Evidence",
    "- `/settings?tab=general` — missing capture",
    "",
    "## Bugs",
    "None found",
  ].join("\n");

  it("recognizes the marker", () => {
    expect(isEvidenceGapOnlyReview(gapReport, "needs some work")).toBe(true);
  });

  it("does not bounce or increment review_rounds at the cap", async () => {
    const { reviews, sent } = makeManager();
    const { task, absPath } = writeTask("review_rounds: 2\n");
    finalize(reviews, task, gapReport);
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(sent()).toBe(0);
    const content = readFileSync(absPath, "utf8");
    expect(content).toContain("status: review");
    expect(content).not.toContain("status: active");
    expect(content).not.toMatch(/^needs_input_reason: review-rounds-exhausted$/m);
    expect(content).toMatch(/^review_rounds: 2$/m);
  });

  it("still bounces an ordinary code finding", async () => {
    const { reviews, sent } = makeManager();
    const { task, absPath } = writeTask();
    finalize(reviews, task, "## Verdict\n`needs some work` — fix the bug.\n");
    await vi.waitFor(() => {
      expect(readFileSync(absPath, "utf8")).toContain("status: active");
    });
    expect(sent()).toBe(1);
  });

  it("flags needs_input after two failed repair attempts with shot detail", async () => {
    const { reviews, repaired } = makeManager(async () => false);
    const { task, absPath } = writeTask();
    finalize(reviews, task, gapReport);
    await vi.waitFor(() => expect(repaired()).toBe(1));
    finalize(reviews, task, gapReport);
    await vi.waitFor(() => expect(repaired()).toBe(2));
    await vi.waitFor(() => {
      const content = readFileSync(absPath, "utf8");
      expect(content).toMatch(/^needs_input_reason: evidence-gap-exhausted$/m);
      expect(content).toContain("/settings?tab=general");
    });
  });
});
