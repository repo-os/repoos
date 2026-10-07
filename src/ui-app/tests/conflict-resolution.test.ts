/**
 * Tests for the integration-conflict resolution core (#0692).
 *
 * These are the regression bar for acceptance criteria 1 and 2: a #0728/#0730
 * shape (both features preserved, tests preserved) resolves without a full
 * cycle; anything the classifier cannot PROVE safe requires the full handoff;
 * and a resolution without its own review + green gate is never resumed.
 *
 * The provenance-store cases are criterion 3 (the answer survives a reload and
 * a stale writer cannot clobber a newer generation). The resume-gate cases are
 * criterion 2's "failures preserve evidence and never auto-publish".
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execSync } from "node:child_process";
import {
  classifyConflictResolution,
  conflictResolutionSnapshot,
  createResolutionProvenanceStore,
  canResumeAuthorizedCloseOut,
  parseConflictRegions,
  regionIsInsertionsOnly,
  regionsAreDisjoint,
  analyzeConflictForResolution,
  classifyConflictForTask,
  resolveConflictByUnion,
  type ConflictedFileSummary,
  type IntegrationResolutionProvenance,
} from "../../server/conflict-resolution.js";

/** A #0728/#0730-style CLI registration conflict: two disjoint top-level adds. */
function cliRegistrationConflict(): ConflictedFileSummary {
  return {
    path: "src/cli/index.ts",
    hunks: [
      [120, 122],
      [130, 132],
    ],
    // Both hunks are pure additions of distinct lines at distinct positions.
    insertionsOnly: [true, true],
    disjoint: true,
  };
}

const now = "2026-10-07T12:00:00Z";

function provenance(
  overrides: Partial<IntegrationResolutionProvenance> = {},
): IntegrationResolutionProvenance {
  return {
    taskId: "0730",
    approvedFeatureSha: "636a03b27730be914515fff8448cf9028574753f",
    mainBaseSha: "a1707629aec1e575d5d85e7436b06be67e9dab27",
    conflictPaths: ["src/cli/index.ts"],
    resolutionClasses: ["disjoint-declarations"],
    resolutionCommit: "res0lve0000000000000000000000000000000000",
    resolutionTree: "tree00000000000000000000000000000000000000",
    resolutionReview: {
      reviewer: "reviewer",
      verdict: "pass",
      reviewedCommit: "res0lve0000000000000000000000000000000000",
      at: now,
      summary: "resolution only adds both registrations; both features intact",
    },
    gate: { result: "pass", validatedTree: "tree0000", at: now, detail: "full suite" },
    generation: 1,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe("classifyConflictResolution", () => {
  it("accepts the #0728/#0730 CLI registration conflict as resolution-eligible", () => {
    const verdict = classifyConflictResolution({
      files: [cliRegistrationConflict()],
      hasPriorFeatureApproval: true,
    });
    expect(verdict).toEqual({
      eligible: true,
      classes: ["disjoint-declarations"],
      reason: "all-disjoint-declarations",
    });
  });

  it("refuses a shortcut when there is no prior feature review/approval", () => {
    const verdict = classifyConflictResolution({
      files: [cliRegistrationConflict()],
      hasPriorFeatureApproval: false,
    });
    expect(verdict).toEqual({ eligible: false, reason: "no-prior-feature-approval" });
  });

  it("refuses when the resolution edits outside the conflict scope", () => {
    const verdict = classifyConflictResolution({
      files: [cliRegistrationConflict()],
      hasPriorFeatureApproval: true,
      editsOutsideConflictScope: true,
    });
    expect(verdict).toEqual({ eligible: false, reason: "edits-outside-conflict-scope" });
  });

  it("refuses an edit (not an append) even inside a conflict hunk", () => {
    // Both sides rewrite the SAME line — the resolution changes behavior.
    const edit: ConflictedFileSummary = {
      path: "src/cli/index.ts",
      hunks: [[10, 12]],
      insertionsOnly: [false],
      disjoint: true,
    };
    const verdict = classifyConflictResolution({
      files: [edit],
      hasPriorFeatureApproval: true,
    });
    expect(verdict).toEqual({ eligible: false, reason: "content-edited-not-appended" });
  });

  it("refuses overlapping hunks", () => {
    const overlap: ConflictedFileSummary = {
      path: "src/cli/index.ts",
      hunks: [
        [10, 20],
        [15, 25],
      ],
      insertionsOnly: [true, true],
      disjoint: false,
    };
    const verdict = classifyConflictResolution({
      files: [overlap],
      hasPriorFeatureApproval: true,
    });
    expect(verdict).toEqual({ eligible: false, reason: "overlapping-hunks" });
  });

  it("refuses an unclassifiable path (no positive disjointness proof)", () => {
    const unknown: ConflictedFileSummary = {
      path: "src/server/agents.ts",
      hunks: [[1, 2]],
      insertionsOnly: [true],
      // disjoint omitted → cannot prove
    };
    const verdict = classifyConflictResolution({
      files: [unknown],
      hasPriorFeatureApproval: true,
    });
    expect(verdict).toEqual({ eligible: false, reason: "unclassifiable-path" });
  });

  it("refuses a whole-file conflict with no hunk structure", () => {
    const wholeFile: ConflictedFileSummary = {
      path: "src/x.ts",
      hunks: [],
      insertionsOnly: [],
      disjoint: true,
    };
    const verdict = classifyConflictResolution({
      files: [wholeFile],
      hasPriorFeatureApproval: true,
    });
    expect(verdict).toEqual({ eligible: false, reason: "content-edited-not-appended" });
  });

  it("refuses the whole set when a single file is unsafe", () => {
    const unsafe: ConflictedFileSummary = {
      path: "src/server/agents.ts",
      hunks: [[1, 3]],
      insertionsOnly: [false],
      disjoint: true,
    };
    const verdict = classifyConflictResolution({
      files: [cliRegistrationConflict(), unsafe],
      hasPriorFeatureApproval: true,
    });
    expect(verdict.eligible).toBe(false);
  });

  it("classifies the task's own bookkeeping file and generated output separately", () => {
    const ownFile: ConflictedFileSummary = {
      path: "work/0730-decisions-cli.md",
      hunks: [[1, 5]],
      insertionsOnly: [],
      isOwnTaskFile: true,
    };
    const generated: ConflictedFileSummary = {
      path: "dist/build-info.json",
      hunks: [[1, 1]],
      insertionsOnly: [true],
      isGeneratedOutput: true,
    };
    const verdict = classifyConflictResolution({
      files: [ownFile, generated],
      hasPriorFeatureApproval: true,
    });
    expect(verdict.eligible).toBe(true);
    if (verdict.eligible) {
      expect(verdict.classes.sort()).toEqual(["generated-output", "task-bookkeeping"]);
      expect(verdict.reason).toBe("only-generated-output");
    }
  });

  it("never auto-resolves a non-empty conflict set as safe when it is empty", () => {
    const verdict = classifyConflictResolution({
      files: [],
      hasPriorFeatureApproval: true,
    });
    expect(verdict).toEqual({ eligible: false, reason: "empty-conflict-set" });
  });
});

describe("conflictResolutionSnapshot", () => {
  it("exposes API-safe fields without taskId", () => {
    const snap = conflictResolutionSnapshot(provenance());
    expect(snap).toMatchObject({
      approvedFeatureSha: "636a03b27730be914515fff8448cf9028574753f",
      conflictPaths: ["src/cli/index.ts"],
      resolutionReview: { verdict: "pass", reviewer: "reviewer" },
    });
    expect(snap && "taskId" in snap).toBe(false);
  });
});

describe("resolution provenance store", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  });

  function fresh(): { root: string; cacheDir: string } {
    const root = mkdtempSync(join(tmpdir(), "repoos-resolution-"));
    dirs.push(root);
    return { root, cacheDir: ".repoos" };
  }

  it("records approved feature SHA, main base, conflict paths and gets a generation", () => {
    const { root, cacheDir } = fresh();
    const store = createResolutionProvenanceStore(root, cacheDir);
    const rec = store.begin({
      taskId: "0730",
      approvedFeatureSha: "abc123",
      mainBaseSha: "def456",
      conflictPaths: ["b.ts", "a.ts"],
      resolutionClasses: ["disjoint-declarations"],
    });
    expect(rec.approvedFeatureSha).toBe("abc123");
    expect(rec.mainBaseSha).toBe("def456");
    expect(rec.conflictPaths).toEqual(["a.ts", "b.ts"]); // sorted, stable
    expect(rec.generation).toBe(1);
    // Survives a fresh store instance (reload).
    const again = createResolutionProvenanceStore(root, cacheDir).get("0730");
    expect(again?.approvedFeatureSha).toBe("abc123");
  });

  it("bumps the generation on each update and refuses a stale writer", () => {
    const { root, cacheDir } = fresh();
    const store = createResolutionProvenanceStore(root, cacheDir);
    store.begin({
      taskId: "0730",
      approvedFeatureSha: "abc",
      mainBaseSha: "def",
      conflictPaths: ["a.ts"],
      resolutionClasses: ["disjoint-declarations"],
    });
    const g1 = store.get("0730")!.generation;
    const updated = store.update("0730", { resolutionCommit: "c0ffee" });
    expect(updated?.generation).toBe(g1 + 1);
    // A writer holding the old generation must not clobber the newer record.
    const stale = store.update("0730", { resolutionCommit: "STALE" }, { expectedGeneration: g1 });
    expect(stale).toBeNull();
    expect(store.get("0730")?.resolutionCommit).toBe("c0ffee");
  });

  it("returns null updating a task with no provenance", () => {
    const { root, cacheDir } = fresh();
    const store = createResolutionProvenanceStore(root, cacheDir);
    expect(store.update("nope", { resolutionCommit: "x" })).toBeNull();
  });

  it("tolerates a corrupt record file instead of throwing", () => {
    const { root, cacheDir } = fresh();
    const p = join(root, cacheDir, "integration-resolutions");
    mkdirSync(p, { recursive: true });
    writeFileSync(join(p, "0730.json"), "{ not json");
    const store = createResolutionProvenanceStore(root, cacheDir);
    expect(store.get("0730")).toBeNull();
  });
});

describe("canResumeAuthorizedCloseOut", () => {
  /** The full-green baseline: everything proven, tree matches, main unmoved. */
  function resumeInput(overrides: Partial<Parameters<typeof canResumeAuthorizedCloseOut>[0]> = {}) {
    return {
      provenance: provenance(),
      authorized: true,
      validatedTree: "tree0000",
      candidateTree: "tree0000",
      currentMainSha: "a1707629aec1e575d5d85e7436b06be67e9dab27",
      validatedMainBaseSha: "a1707629aec1e575d5d85e7436b06be67e9dab27",
      mainAdvanceIsBookkeepingOnly: false,
      worktreeDirty: false,
      cancelled: false,
      ...overrides,
    };
  }

  it("resumes a fully-proven resolution against the exact validated tree", () => {
    expect(canResumeAuthorizedCloseOut(resumeInput())).toEqual({ ok: true });
  });

  it("never resumes without a prior authorization", () => {
    const r = canResumeAuthorizedCloseOut(resumeInput({ authorized: false }));
    expect(r).toMatchObject({ ok: false, reason: "not-authorized" });
  });

  it("never resumes without provenance", () => {
    const r = canResumeAuthorizedCloseOut(resumeInput({ provenance: null }));
    expect(r).toMatchObject({ ok: false, reason: "no-provenance" });
  });

  it("never resumes before the resolution review passes", () => {
    const pending = provenance({
      resolutionReview: {
        reviewer: "reviewer",
        verdict: "pending",
        reviewedCommit: null,
        at: null,
        summary: "",
      },
    });
    const r = canResumeAuthorizedCloseOut(resumeInput({ provenance: pending }));
    expect(r).toMatchObject({ ok: false, reason: "resolution-review-not-passed" });
  });

  it("never resumes on a failing resolution review (evidence preserved)", () => {
    const failed = provenance({
      resolutionReview: {
        reviewer: "reviewer",
        verdict: "fail",
        reviewedCommit: "res0lve0000000000000000000000000000000000",
        at: now,
        summary: "resolution dropped the watch registration",
      },
    });
    const r = canResumeAuthorizedCloseOut(resumeInput({ provenance: failed }));
    expect(r).toMatchObject({ ok: false, reason: "resolution-review-not-passed" });
    // The failed verdict is still there — evidence is never erased.
    expect(r.ok).toBe(false);
  });

  it("never resumes before the combined gate passes", () => {
    const pending = provenance({
      gate: { result: "pending", validatedTree: null, at: null, detail: "" },
    });
    const r = canResumeAuthorizedCloseOut(resumeInput({ provenance: pending }));
    expect(r).toMatchObject({ ok: false, reason: "gate-not-passed" });
  });

  it("refuses a candidate tree that is not the validated tree", () => {
    const r = canResumeAuthorizedCloseOut(
      resumeInput({ validatedTree: "tree0000", candidateTree: "tree9999" }),
    );
    expect(r).toMatchObject({ ok: false, reason: "tree-mismatch" });
  });

  it("refuses when main advanced with code since validation", () => {
    const r = canResumeAuthorizedCloseOut(
      resumeInput({
        currentMainSha: "1111111",
        validatedMainBaseSha: "a1707629aec1e575d5d85e7436b06be67e9dab27",
        mainAdvanceIsBookkeepingOnly: false,
      }),
    );
    expect(r).toMatchObject({ ok: false, reason: "main-advanced-with-code" });
  });

  it("allows a bookkeeping-only main advance (safe reclassification)", () => {
    const r = canResumeAuthorizedCloseOut(
      resumeInput({
        currentMainSha: "2222222",
        validatedMainBaseSha: "a1707629aec1e575d5d85e7436b06be67e9dab27",
        mainAdvanceIsBookkeepingOnly: true,
      }),
    );
    expect(r).toEqual({ ok: true });
  });

  it("refuses a dirty feature worktree", () => {
    const r = canResumeAuthorizedCloseOut(resumeInput({ worktreeDirty: true }));
    expect(r).toMatchObject({ ok: false, reason: "worktree-dirty" });
  });

  it("refuses a cancelled close-out", () => {
    const r = canResumeAuthorizedCloseOut(resumeInput({ cancelled: true }));
    expect(r).toMatchObject({ ok: false, reason: "cancelled" });
  });

  it("refuses a stale generation (server reload / in-flight writer)", () => {
    const r = canResumeAuthorizedCloseOut(resumeInput({ expectedGeneration: 0 }));
    expect(r).toMatchObject({ ok: false, reason: "stale-generation" });
  });
});

describe("parseConflictRegions / regionIsInsertionsOnly / regionsAreDisjoint", () => {
  it("recognises two pure, disjoint insertions in one file (#0728/#0730 shape)", () => {
    const content = [
      "const commands = [",
      "<<<<<<< HEAD",
      '  "watch",',
      "=======",
      '  "decisions",',
      ">>>>>>> feature",
      "  // ...",
      "<<<<<<< HEAD",
      '  "status",',
      "=======",
      '  "attention",',
      ">>>>>>> feature",
      "];",
    ].join("\n");
    const regions = parseConflictRegions(content);
    expect(regions).toHaveLength(2);
    expect(regions.every(regionIsInsertionsOnly)).toBe(true);
    expect(regionsAreDisjoint(regions)).toBe(true);
  });

  it("treats a conflicting EDIT (both sides rewrite the same line) as not insertions-only when diff3 base is present", () => {
    const content = [
      "<<<<<<< HEAD",
      "  const timeout = 30_000;",
      "||||||| base",
      "  const timeout = 15_000;",
      "=======",
      "  const timeout = 60_000;",
      ">>>>>>> feature",
    ].join("\n");
    const regions = parseConflictRegions(content);
    expect(regions).toHaveLength(1);
    expect(regions[0].hasBase).toBe(true);
    expect(regionIsInsertionsOnly(regions[0])).toBe(false);
  });

  it("refuses a diff3 region (an edit) via hasBase", () => {
    const content = [
      "<<<<<<< HEAD",
      "  const timeout = 30_000;",
      "||||||| base",
      "  const timeout = 15_000;",
      "=======",
      "  const timeout = 60_000;",
      ">>>>>>> feature",
    ].join("\n");
    const regions = parseConflictRegions(content);
    expect(regions[0].hasBase).toBe(true);
    expect(regionIsInsertionsOnly(regions[0])).toBe(false);
  });

  it("reports separated regions as disjoint and adjacent ones as not", () => {
    const separated = [
      "<<<<<<< HEAD",
      "a",
      "=======",
      "b",
      ">>>>>>> f",
      "<<<<<<< HEAD",
      "c",
      "=======",
      "d",
      ">>>>>>> f",
    ].join("\n");
    expect(regionsAreDisjoint(parseConflictRegions(separated))).toBe(true);
    // Two regions whose markers sit on consecutive lines are adjacent.
    expect(
      regionsAreDisjoint([
        { startLine: 1, ours: ["a"], theirs: ["b"], hasBase: false },
        { startLine: 2, ours: ["c"], theirs: ["d"], hasBase: false },
      ]),
    ).toBe(false);
  });

  it("returns no regions for conflict-free content", () => {
    expect(parseConflictRegions("a\nb\nc\n")).toEqual([]);
  });
});

describe("resolveConflictByUnion", () => {
  it("keeps both sides of a pure-insertion conflict", () => {
    const merged = [
      "const x = [",
      "<<<<<<< HEAD",
      '  "watch",',
      "=======",
      '  "decisions",',
      ">>>>>>> f",
      "];",
    ].join("\n");
    const r = resolveConflictByUnion(merged);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.resolved).toBe(1);
      expect(r.content).toBe('const x = [\n  "watch",\n  "decisions",\n];');
      expect(r.content).not.toContain("<<<<<<<");
    }
  });

  it("refuses a diff3 region (an edit) rather than guessing", () => {
    const merged = [
      "<<<<<<< HEAD",
      "  x = 1;",
      "||||||| base",
      "  x = 0;",
      "=======",
      "  x = 2;",
      ">>>>>>> f",
    ].join("\n");
    expect(resolveConflictByUnion(merged)).toEqual({ ok: false });
  });

  it("passes conflict-free content through unchanged", () => {
    const r = resolveConflictByUnion("a\nb\n");
    expect(r).toEqual({ ok: true, content: "a\nb\n", resolved: 0 });
  });
});

describe("analyzeConflictForResolution (real git)", () => {
  let repo: string;
  const sh = (cmd: string): void => {
    execSync(cmd, { cwd: repo, stdio: "ignore" });
  };
  afterEach(() => {
    if (repo) rmSync(repo, { recursive: true, force: true });
  });
  beforeEach(() => {
    repo = mkdtempSync(join(tmpdir(), "repoos-resolution-git-"));
    sh("git init -q -b main");
    sh('git config user.email "t@example.com"');
    sh('git config user.name "T"');
    writeFileSync(join(repo, "cli.ts"), "const commands = [\n];\n");
    sh("git add -A && git commit -q -m init");
    sh("git checkout -q -b feature");
    writeFileSync(join(repo, "cli.ts"), 'const commands = [\n  "watch",\n];\n');
    sh("git commit -qam feature");
    sh("git checkout -q main");
    writeFileSync(join(repo, "cli.ts"), 'const commands = [\n  "decisions",\n];\n');
    sh("git commit -qam main-change");
  });

  it("finds no conflict when the branch is clean against main", async () => {
    // A fresh branch that only adds a NEW file conflicts with nothing.
    sh("git checkout -q main && git checkout -q -b clean-feature");
    writeFileSync(join(repo, "added.ts"), "export const x = 1;\n");
    sh("git add -A && git commit -qam add-file");
    sh("git checkout -q main");
    const r = await analyzeConflictForResolution(repo, "clean-feature");
    expect(r.ok).toBe(true);
    expect(r.files).toEqual([]);
  });

  it("detects and classifies a pure-insertion registration conflict as eligible", async () => {
    const verdict = await classifyConflictForTask(repo, "feature", {
      hasPriorFeatureApproval: true,
      generatedPrefixes: ["dist/"],
    });
    expect(verdict.eligible).toBe(true);
    if (verdict.eligible) expect(verdict.classes).toContain("disjoint-declarations");
  });

  it("leaves the checkout and branch untouched (read-only)", async () => {
    await analyzeConflictForResolution(repo, "feature");
    expect(execSync("git status --porcelain", { cwd: repo }).toString()).toBe("");
    expect(execSync("git rev-parse --abbrev-ref HEAD", { cwd: repo }).toString().trim()).toBe(
      "main",
    );
  });

  it("fails closed (full cycle) when a git error prevents analysis", async () => {
    const verdict = await classifyConflictForTask(repo, "no-such-branch", {
      hasPriorFeatureApproval: true,
    });
    expect(verdict.eligible).toBe(false);
  });

  it("preserves BOTH features and their tests when resolving the #0728/#0730 shape", async () => {
    // Model #0730 (watch) vs #0728 (decisions/attention): one registration
    // file, both sides adding distinct entries, plus each side's own test.
    sh("git checkout -q feature");
    writeFileSync(join(repo, "watch.test.ts"), 'it("watch", () => {});\n');
    sh("git add -A && git commit -qam watch-tests");
    sh("git checkout -q main");
    writeFileSync(join(repo, "decisions.test.ts"), 'it("decisions", () => {});\n');
    sh("git add -A && git commit -qam decisions-tests");

    const verdict = await classifyConflictForTask(repo, "feature", {
      hasPriorFeatureApproval: true,
      generatedPrefixes: ["dist/"],
    });
    expect(verdict.eligible).toBe(true);

    // Resolve the conflicted file by union and confirm both features survive.
    const analysis = await analyzeConflictForResolution(repo, "feature", {
      generatedPrefixes: ["dist/"],
    });
    expect(analysis.files.map((f) => f.path)).toContain("cli.ts");
    // Get the conflicted merged content from the merge stage. `merge-tree`
    // exits 1 when the merge conflicts, so read stdout from the thrown error.
    let merged = "";
    try {
      merged = execSync("git merge-tree --write-tree --no-messages HEAD feature", {
        cwd: repo,
      }).toString();
    } catch (err) {
      merged = String((err as { stdout?: Buffer }).stdout ?? "");
    }
    const tree = merged.split("\n")[0].trim();
    const conflictedContent = execSync(`git show ${tree}:cli.ts`, { cwd: repo }).toString();
    const union = resolveConflictByUnion(conflictedContent);
    expect(union.ok).toBe(true);
    if (union.ok) {
      expect(union.content).toContain('"watch"');
      expect(union.content).toContain('"decisions"');
      expect(union.content).not.toContain("<<<<<<<");
    }
    // Both test files survive the union merge because neither side touched the
    // other's — the merge only conflicted on cli.ts.
    expect(analysis.files.map((f) => f.path)).toEqual(["cli.ts"]);
  });
});
