import { describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import {
  SHOT_PREVIEW_FIXTURE_TASK_ID,
  type ShotPreviewFixtureId,
} from "../../core/shot-fixtures.js";
import {
  applyShotPreviewConfigFixture,
  applyShotPreviewFixture,
  isShotPreviewConfigFixture,
  readShotPreviewFixtureFromLocation,
  shotFixturePinnedIntegration,
  shotFixturePinnedRemoteStatus,
  shotFixturePinnedTaskRemoteActivity,
} from "../src/lib/shot-preview-fixtures";
import { useConfigStore } from "../src/stores/config";
import { useNoticesStore } from "../src/stores/notices";
import { useRepoStore } from "../src/stores/repo";
import { useUiStore } from "../src/stores/ui";
import { integrationMedianChip } from "../src/lib/integration-pipeline-ui";
import { shotProblems } from "../src/lib/shot-rows";
import { isDocsShotSkip, shotVerdict } from "../src/lib/handoff-verification";

describe("shot preview board fixtures (#0743)", () => {
  it("reads shotState from the location query", () => {
    expect(readShotPreviewFixtureFromLocation({ search: "?shotState=closeOut%3Aactive" })).toBe(
      "closeOut:active",
    );
    expect(readShotPreviewFixtureFromLocation({ search: "?shotState=editor%3Aunconfigured" })).toBe(
      "editor:unconfigured",
    );
    expect(readShotPreviewFixtureFromLocation({ search: "" })).toBeNull();
  });

  it("clears the configured editor so the Set-editor hint renders (#0805)", () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const config = useConfigStore();
    config.data = { editor: { command: "zed {file}" }, dev: { inspector: { editorCommand: "" } } };

    applyShotPreviewConfigFixture(config, "editor:unconfigured");

    expect((config.data?.editor as { command?: string }).command).toBe("");
    expect(
      (config.data?.dev as { inspector?: { editorCommand?: string } }).inspector?.editorCommand,
    ).toBe("");
  });

  it("classifies config-touching shot fixtures (#0822, #0833)", () => {
    expect(isShotPreviewConfigFixture("settings:birdQuickTrail")).toBe(true);
    expect(isShotPreviewConfigFixture("settings:rgbKeystorm")).toBe(true);
    expect(isShotPreviewConfigFixture("settings:wheelieCourier")).toBe(true);
    expect(isShotPreviewConfigFixture("settings:booSwoop")).toBe(true);
    expect(isShotPreviewConfigFixture("settings:pumpkinSpell")).toBe(true);
    expect(isShotPreviewConfigFixture("editor:unconfigured")).toBe(true);
    expect(isShotPreviewConfigFixture("budget:paused")).toBe(true);
    expect(isShotPreviewConfigFixture("board:startWorkPending")).toBe(false);
  });

  it("seeds a paused budget allowlist for Budget Controls shots (#0850)", () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const config = useConfigStore();
    config.data = {};

    applyShotPreviewConfigFixture(config, "budget:paused");

    const rows = config.data?.["budget.allowlist"] as Array<Record<string, unknown>>;
    expect(rows[0]).toMatchObject({
      cli: "cursor",
      paused: true,
      pausedReason: "Cursor credits exhausted",
    });
    expect(String(rows[0]?.pausedUntil)).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(rows[1]?.pausedModels).toMatchObject([{ model: "big pickle" }]);
  });

  it("seeds bird quick trail on the settings form (#0822)", () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const config = useConfigStore();
    config.form.activityAnimationStyle = "arcade-hopper";
    applyShotPreviewConfigFixture(config, "settings:birdQuickTrail");
    expect(config.form.activityAnimationStyle).toBe("bird-quick-trail");
  });

  it("seeds each #0833 artwork style on the settings form", () => {
    const fixtures: Partial<Record<ShotPreviewFixtureId, string>> = {
      "settings:rgbKeystorm": "rgb-keystorm",
      "settings:wheelieCourier": "wheelie-courier",
      "settings:booSwoop": "boo-swoop",
      "settings:pumpkinSpell": "pumpkin-spell",
    };
    for (const [fixture, style] of Object.entries(fixtures) as [ShotPreviewFixtureId, string][]) {
      const pinia = createPinia();
      setActivePinia(pinia);
      const config = useConfigStore();
      config.form.activityAnimationStyle = "orbital-pixel";
      applyShotPreviewConfigFixture(config, fixture);
      expect(config.form.activityAnimationStyle, fixture).toBe(style);
    }
  });

  it("seeds Start work pending on a ready board card (#0822)", () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const repo = useRepoStore();
    applyShotPreviewFixture(repo, "board:startWorkPending");
    const task = repo.tasks.find((t) => t.id === SHOT_PREVIEW_FIXTURE_TASK_ID);
    expect(task!.status).toBe("ready");
    expect(repo.isStartWorkPending(SHOT_PREVIEW_FIXTURE_TASK_ID)).toBe(true);
  });

  it("seeds failed input attachment uploads for New input panel shots (#0664)", () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const repo = useRepoStore();
    const ui = useUiStore();
    applyShotPreviewFixture(repo, "panel:newInputOutstandingUpload");
    expect(ui.isNewInput).toBe(true);
    expect(repo.outstandingInputAttachmentUploads()).toHaveLength(1);
    expect(repo.outstandingInputAttachmentUploads()[0]?.attachment.uploadPhase).toBe("failed");
  });

  it("seeds failed freeform screenshots for New task panel shots (#0664)", () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const repo = useRepoStore();
    const ui = useUiStore();
    applyShotPreviewFixture(repo, "panel:freeformFailedScreenshot");
    expect(ui.isNew).toBe(true);
    expect(ui.hasFailedPendingScreenshots()).toBe(true);
    expect(ui.pendingScreenshots[0]?.uploadError).toContain("Upload failed");
  });

  it("leaves other config fixtures untouched (#0805)", () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const config = useConfigStore();
    config.data = { editor: { command: "zed {file}" } };

    applyShotPreviewConfigFixture(config, "board:withReviewTask");

    expect((config.data?.editor as { command?: string }).command).toBe("zed {file}");
  });

  it("seeds close-out pipeline state for integration bar shots", () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const repo = useRepoStore();
    applyShotPreviewFixture(repo, "closeOut:active");
    expect(repo.integration?.active?.taskId).toBe(SHOT_PREVIEW_FIXTURE_TASK_ID);
    expect(repo.integration?.empty).toBe(false);
  });

  it("seeds progress shot fixtures with determinate and unknown test totals", () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const repo = useRepoStore();
    applyShotPreviewFixture(repo, "closeOut:checkProgress");
    expect(repo.taskChecks[SHOT_PREVIEW_FIXTURE_TASK_ID]?.[0]).toMatchObject({
      currentStep: 6,
      stepsTotal: 12,
      testsDone: 140,
      testsTotal: 289,
      attempt: 2,
    });
    applyShotPreviewFixture(repo, "closeOut:checkProgressUnknown");
    expect(repo.taskChecks[SHOT_PREVIEW_FIXTURE_TASK_ID]?.[0]).toMatchObject({
      currentStep: 4,
      stepsTotal: 10,
      testsDone: null,
      testsTotal: null,
      attempt: 2,
    });
  });

  it("seeds an active coding run for board card indicator shots (#0787)", () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const repo = useRepoStore();
    applyShotPreviewFixture(repo, "board:activeCoding");
    expect(
      repo.tasks.some((t) => t.id === SHOT_PREVIEW_FIXTURE_TASK_ID && t.status === "active"),
    ).toBe(true);
    expect(repo.isRunning(SHOT_PREVIEW_FIXTURE_TASK_ID)).toBe(true);
  });

  it("seeds a review card with done-error footer state", () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const repo = useRepoStore();
    applyShotPreviewFixture(repo, "card:doneError");
    expect(repo.tasks.some((t) => t.id === SHOT_PREVIEW_FIXTURE_TASK_ID)).toBe(true);
    expect(repo.doneErrors[SHOT_PREVIEW_FIXTURE_TASK_ID]?.step).toBe("check");
  });

  it("seeds a review card with review-rounds-exhausted detail (#0832)", () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const repo = useRepoStore();
    applyShotPreviewFixture(repo, "card:reviewRoundsExhausted");
    const task = repo.tasks.find((t) => t.id === "0832");
    expect(task, "card:reviewRoundsExhausted seeds the #0832 fixture task").toBeTruthy();
    expect(task!.needsInputReason).toBe("review-rounds-exhausted");
    expect(task!.needsInputDetail).toContain("needs some work");
    expect(repo.reviews["0832"]?.report?.markdown).toContain("contrast audit");
  });

  it("seeds a ready card flagged by the decision-model human-step check (#0804)", () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const repo = useRepoStore();
    applyShotPreviewFixture(repo, "card:humanStep");
    const task = repo.tasks.find((t) => t.id === SHOT_PREVIEW_FIXTURE_TASK_ID);
    expect(task, "card:humanStep seeds the fixture task").toBeTruthy();
    expect(task!.status).toBe("ready");
    expect(task!.needsInput).toBe(true);
    expect(task!.needsInputReason).toBe("needs-human-step");
    // The bounded explanation the flag hangs off — never raw model text.
    expect(task!.needsInputDetail).toContain("Decision model");
  });

  it("seeds an uploading close-out with visible bundle progress (#0782)", () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const repo = useRepoStore();
    applyShotPreviewFixture(repo, "closeOut:uploading");
    const task = repo.tasks.find((t) => t.id === SHOT_PREVIEW_FIXTURE_TASK_ID);
    expect(task, "closeOut:uploading seeds the fixture task").toBeTruthy();
    expect(task!.branch).toBe("");
    expect(repo.integration?.active?.taskId).toBe(SHOT_PREVIEW_FIXTURE_TASK_ID);
    expect(repo.integration?.active?.detail).toContain("uploading bundle");
  });

  it("seeds a heartbeating remote test run, current step + elapsed, not stalled (#0799)", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const repo = useRepoStore();
    applyShotPreviewFixture(repo, "closeOut:remoteTests");
    const task = repo.tasks.find((t) => t.id === SHOT_PREVIEW_FIXTURE_TASK_ID);
    expect(task, "closeOut:remoteTests seeds the fixture task").toBeTruthy();
    expect(repo.integration?.active?.detail).toBe("remote tests");
    const { integrationActiveCopy, integrationPipelineStalled } =
      await import("../src/lib/integration-pipeline-ui");
    const now = Date.now();
    expect(integrationPipelineStalled(repo.integration, now)).toBe(false);
    const copy = integrationActiveCopy(repo.integration!, now);
    expect(copy.stalled).toBe(false);
    expect(copy.label).toContain("remote tests");
    // A non-zero elapsed since the job started.
    expect(copy.label).toMatch(/remote tests · \dm/);
  });

  it("pins the runner pool and drawer remote activity for a queued validation (#0897)", () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const repo = useRepoStore();
    applyShotPreviewFixture(repo, "runners:queued");

    // The Runners tab shot: one busy host, a handoff check queued behind a
    // close-out, with phases and the blocker that explains the wait.
    const status = shotFixturePinnedRemoteStatus();
    expect(status?.hosts[0]).toMatchObject({ host: "bee", inFlight: 1, queued: 1 });
    expect(status?.hosts[0]?.activeRuns?.[0]).toMatchObject({
      taskId: "0892",
      kind: "close-out",
      stage: "run",
    });
    expect(status?.hosts[0]?.activeRuns?.[0]?.phases?.map((p) => p.phase)).toEqual([
      "queued",
      "bundle",
      "upload",
      "run",
    ]);
    expect(status?.hosts[0]?.queuedRuns?.[0]).toMatchObject({
      taskId: "0897",
      kind: "handoff",
      position: 2,
      ahead: 1,
    });
    expect(status?.hosts[0]?.queuedRuns?.[0]?.blockers[0]).toMatchObject({
      taskId: "0892",
      kind: "close-out",
      host: "bee",
    });

    // The drawer shot: the fixture task (review status) has live remote
    // activity, so `.drawer-remote-activity` renders instead of timing out.
    const task = repo.tasks.find((t) => t.id === SHOT_PREVIEW_FIXTURE_TASK_ID);
    expect(task?.status).toBe("review");
    expect(task?.branch).toBe("");
    expect(shotFixturePinnedTaskRemoteActivity(SHOT_PREVIEW_FIXTURE_TASK_ID)?.run).toMatchObject({
      taskId: SHOT_PREVIEW_FIXTURE_TASK_ID,
      kind: "close-out",
      host: "bee",
      stage: "run",
    });
    // The close-out pipeline stays consistent with the runner rows.
    expect(repo.integration?.active).toMatchObject({ taskId: "0892", phase: "validating" });
    expect(repo.integration?.queueDetail?.[0]).toMatchObject({
      taskId: "0897",
      position: 1,
      blockerTaskId: "0892",
    });

    // A later fixture must clear both pins, or a fresh capture would reuse
    // this state (#0782).
    applyShotPreviewFixture(repo, "closeOut:active");
    expect(shotFixturePinnedRemoteStatus()).toBeNull();
    expect(shotFixturePinnedTaskRemoteActivity(SHOT_PREVIEW_FIXTURE_TASK_ID)).toBeNull();
  });

  it("keeps the seeded pipeline against a live refresh, then unpins (#0782)", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const repo = useRepoStore();
    applyShotPreviewFixture(repo, "closeOut:uploading");
    const seeded = shotFixturePinnedIntegration();
    expect(seeded?.active?.detail).toContain("uploading bundle");

    // The hydration refreshIntegration runs after an SSE gap: without the pin
    // this real (idle) snapshot replaced the fixture mid-capture, and the card
    // lost its "uploading bundle" line before the screenshot.
    const idle = { empty: true, active: null, queue: [], at: new Date().toISOString() };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ ok: true, pipeline: idle }),
      })),
    );
    await repo.refreshIntegration();
    expect(repo.integration?.active?.detail).toContain("uploading bundle");
    expect(repo.integration?.active?.taskId).toBe(SHOT_PREVIEW_FIXTURE_TASK_ID);

    // A fixture that seeds no pipeline must clear the pin so the LIVE
    // snapshot is not frozen for the rest of the page's life.
    applyShotPreviewFixture(repo, "board:withReviewTask");
    expect(shotFixturePinnedIntegration()).toBeNull();
    vi.unstubAllGlobals();
  });

  /**
   * #0834: the SSE handler calls refresh() to rebuild the whole task list,
   * which dropped the client-only fixture card mid-capture — the shot's
   * highlight then matched an unrelated card (or nothing). Re-apply the active
   * fixture at the end of refresh, like the #0782 pipeline pin above.
   */
  it("keeps the seeded fixture card against a live board refresh (#0834)", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const repo = useRepoStore();
    repo.health = { ok: true, isPreviewBuild: true } as typeof repo.health;
    window.history.replaceState({}, "", "/work?shotState=card%3AcheckpointRecovery");
    try {
      applyShotPreviewFixture(repo, "card:checkpointRecovery");
      expect(repo.tasks.some((t) => t.id === SHOT_PREVIEW_FIXTURE_TASK_ID)).toBe(true);

      vi.stubGlobal(
        "fetch",
        vi.fn(async (url: string) => {
          if (url.includes("/api/board"))
            return {
              ok: true,
              status: 200,
              json: async () => ({ tasks: [], counts: {}, taskCount: 0 }),
            };
          throw new Error("unexpected fetch: " + url);
        }),
      );
      await repo.refresh();

      const task = repo.tasks.find((t) => t.id === SHOT_PREVIEW_FIXTURE_TASK_ID);
      expect(task, "the fixture card survives a board refresh mid-capture").toBeTruthy();
      expect(repo.checkpointRecoveryFor(SHOT_PREVIEW_FIXTURE_TASK_ID)).toBe(true);
    } finally {
      vi.unstubAllGlobals();
      window.history.replaceState({}, "", "/");
    }
  });

  it("seeds a stalled close-out so the card renders Cancel/Retry (#0778)", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const repo = useRepoStore();
    applyShotPreviewFixture(repo, "closeOut:stalled");
    const task = repo.tasks.find((t) => t.id === SHOT_PREVIEW_FIXTURE_TASK_ID);
    expect(task, "closeOut:stalled seeds the fixture task").toBeTruthy();
    expect(task!.branch).toBe("");
    expect(repo.integration?.active?.taskId).toBe(SHOT_PREVIEW_FIXTURE_TASK_ID);
    const { integrationPipelineStalled } = await import("../src/lib/integration-pipeline-ui");
    expect(integrationPipelineStalled(repo.integration, Date.now())).toBe(true);
  });

  it("seeds a review task with a branch and diff stats for drawer shots (#0778)", () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const repo = useRepoStore();
    applyShotPreviewFixture(repo, "drawer:reviewWithBranch");
    const task = repo.tasks.find((t) => t.id === SHOT_PREVIEW_FIXTURE_TASK_ID);
    expect(task, "drawer:reviewWithBranch seeds the fixture task").toBeTruthy();
    expect(task!.status).toBe("review");
    expect(task!.branch).toBe("feat/shot-fixture");
    expect(repo.diffStatsFor(SHOT_PREVIEW_FIXTURE_TASK_ID)).toEqual({
      filesChanged: 3,
      additions: 42,
      deletions: 8,
    });
  });

  it("seeds landing pre-checks for the Move to done checklist shot (#0867)", () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const repo = useRepoStore();
    applyShotPreviewFixture(repo, "drawer:landable");
    const task = repo.tasks.find((t) => t.id === SHOT_PREVIEW_FIXTURE_TASK_ID);
    expect(task, "drawer:landable seeds the fixture task").toBeTruthy();
    expect(task!.status).toBe("review");
    expect(task!.branch).toBe("feat/shot-fixture");
    const landable = repo.landableFor(SHOT_PREVIEW_FIXTURE_TASK_ID);
    expect(landable?.landable).toBe(false);
    expect(landable?.checks.find((c) => c.id === "merge-conflicts")?.status).toBe("fail");
  });

  it("composes the warning states needed for expanded task-tab shots (#0922)", () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const repo = useRepoStore();
    applyShotPreviewFixture(repo, "drawer:tabExpandWarnings");
    const task = repo.tasks.find((t) => t.id === SHOT_PREVIEW_FIXTURE_TASK_ID);
    expect(task?.needsInputReason).toBe("review-failed");
    expect(repo.handoffErrorFor(SHOT_PREVIEW_FIXTURE_TASK_ID)).toContain("Fixture handoff");
    expect(repo.landableFor(SHOT_PREVIEW_FIXTURE_TASK_ID)?.landable).toBe(false);
    expect(document.documentElement.getAttribute("data-repoos-shot-state")).toBe(
      "drawer:tabExpandWarnings",
    );
  });

  it("seeds a pending handoff conflict for the modal shot (#0810)", () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const repo = useRepoStore();
    applyShotPreviewFixture(repo, "card:handoffConflict");
    const task = repo.tasks.find((t) => t.id === SHOT_PREVIEW_FIXTURE_TASK_ID);
    expect(task, "card:handoffConflict seeds the fixture task").toBeTruthy();
    expect(task!.status).toBe("review");
    const conflict = repo.worktreeHandoffConflictFor(SHOT_PREVIEW_FIXTURE_TASK_ID);
    expect(conflict?.files?.length).toBeGreaterThan(2);
    expect(conflict?.files?.some((f) => f.taskFile)).toBe(true);
    expect(conflict?.files?.[0]?.added).toBeGreaterThan(0);
  });

  it("seeds post-handoff checkpoint recovery on a review card (#0834)", () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const repo = useRepoStore();
    applyShotPreviewFixture(repo, "card:checkpointRecovery");
    const task = repo.tasks.find((t) => t.id === SHOT_PREVIEW_FIXTURE_TASK_ID);
    expect(task, "card:checkpointRecovery seeds the fixture task").toBeTruthy();
    expect(task!.status).toBe("review");
    // The card hint branches on this flag, not on the /api/board payload — the
    // fixture must set it directly for the capture to show recovery.
    expect(repo.checkpointRecoveryFor(SHOT_PREVIEW_FIXTURE_TASK_ID)).toBe(true);
  });

  it("seeds an active task with requirement sections for Update requirements shots (#0817)", () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const repo = useRepoStore();
    applyShotPreviewFixture(repo, "drawer:activeRequirements");
    const task = repo.tasks.find((t) => t.id === SHOT_PREVIEW_FIXTURE_TASK_ID);
    expect(task!.status).toBe("active");
    expect(task!.body).toContain("## Acceptance criteria");
    expect(task!.branch).toBe("");
  });

  it("drawer:activeRequirements seeds #9999 when ?task=9999 is not on the board (#0817)", () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const repo = useRepoStore();
    window.history.replaceState({}, "", "/work?task=9999&shotState=drawer%3AactiveRequirements");
    applyShotPreviewFixture(repo, "drawer:activeRequirements");
    const task = repo.tasks.find((t) => t.id === SHOT_PREVIEW_FIXTURE_TASK_ID);
    expect(task!.status).toBe("active");
    expect(task!.body).toContain("## Acceptance criteria");
  });

  it("drawer:activeRequirements upgrades the ?task= board task instead of #9999 (#0817)", () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const repo = useRepoStore();
    repo.tasks.push({
      id: "0817",
      title: "Real task",
      type: "feature",
      status: "review",
      priority: "p2",
      area: "web",
      assignee: "ai",
      assignedTo: "ai",
      createdBy: "",
      branch: "feat/x",
      tags: [],
      needsInput: false,
      needsMerge: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      path: "work/0817.md",
      absPath: "/tmp/0817.md",
      body: "old",
      extra: {},
      agentOverride: null,
      cliOverride: null,
      modelOverride: null,
      git: {
        branchExists: true,
        worktreeExists: true,
        lastCommit: null,
        lastCommitAt: null,
        worktreePath: null,
        dirty: false,
      },
      preview: null,
    });
    window.history.replaceState({}, "", "/work?task=0817&shotState=drawer%3AactiveRequirements");
    applyShotPreviewFixture(repo, "drawer:activeRequirements");
    const task = repo.tasks.find((t) => t.id === "0817");
    expect(task!.status).toBe("active");
    expect(task!.body).toContain("## Acceptance criteria");
    expect(repo.tasks.some((t) => t.id === SHOT_PREVIEW_FIXTURE_TASK_ID)).toBe(false);
  });

  it("seeds a running task with a queued message for the composer notice (#0821)", () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const repo = useRepoStore();
    // Deep-links a real task id, so the drawer's per-task fetches resolve
    // (a fake #9999 fixture would 404 and fail the handoff UI gate).
    window.history.replaceState(
      {},
      "",
      "/work?task=0821&tab=agent&shotState=drawer%3AqueuedMessage",
    );
    applyShotPreviewFixture(repo, "drawer:queuedMessage");
    expect(repo.isRunning("0821")).toBe(true);
    expect(repo.queuedMessages["0821"]?.count).toBe(1);
    // No fake board task is seeded.
    expect(repo.tasks.some((t) => t.id === SHOT_PREVIEW_FIXTURE_TASK_ID)).toBe(false);
  });

  it("keeps a fixture-seeded queue when fetchQueued runs during a capture (#0821)", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const repo = useRepoStore();
    window.history.replaceState({}, "", "/work?task=0821&shotState=drawer%3AqueuedMessage");
    applyShotPreviewFixture(repo, "drawer:queuedMessage");
    // The SSE reconnect re-fetches the queue; during a capture it must not wipe
    // the seeded state the shot exists to show.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ tasks: [], messages: [] }),
      })),
    );
    await repo.fetchQueued();
    expect(repo.queuedMessages["0821"]?.count).toBe(1);
    vi.unstubAllGlobals();
  });

  it("seeds captured shots, handoff verdicts and a docs-skip note for viewer shots (#0819)", () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const repo = useRepoStore();
    applyShotPreviewFixture(repo, "drawer:shotEvidence");
    const task = repo.tasks.find((t) => t.id === SHOT_PREVIEW_FIXTURE_TASK_ID);
    expect(task, "drawer:shotEvidence seeds the fixture task").toBeTruthy();
    expect(task!.branch).toBe("");
    const shots = repo.shotsFor(SHOT_PREVIEW_FIXTURE_TASK_ID);
    expect(shots).toHaveLength(2);
    // The docs-skip note the Changes tab parses into the warning + its link.
    const problems = shotProblems(task!.body, shots);
    expect(problems).toHaveLength(1);
    expect(problems[0]!.detail).toContain("Docs site skipped: no docs shot declared");
    expect(isDocsShotSkip(problems[0]!.detail)).toBe(true);
    // One captured shot carries a warning (a "check"), one is clean (a "match").
    const evidence = repo.uiVerificationFor(SHOT_PREVIEW_FIXTURE_TASK_ID);
    expect(evidence?.captureDetails).toHaveLength(2);
    expect(evidence?.captureDetails?.[0]?.targetWarnings?.[0]).toContain(
      "click .fullscreen-toggle",
    );
    expect(shotVerdict(evidence!.captureDetails![0]!).verdict).toBe("check");
    expect(shotVerdict(evidence!.captureDetails![1]!).verdict).toBe("matches");
  });

  it("seeds debug log rows for drawer capture on a real task id (#0829)", () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const repo = useRepoStore();
    const drawerId = "0820";
    vi.stubGlobal("location", { search: `?task=${drawerId}&shotState=drawer:debugLogs` });
    applyShotPreviewFixture(repo, "drawer:debugLogs");
    expect(repo.taskLogs[drawerId]).toHaveLength(2);
    expect(repo.taskLogs[drawerId]![0]!.message).toContain("main advanced with bookkeeping");
    expect(repo.taskLogs[drawerId]![1]!.message).toBe("close-out complete — published to main");
    vi.unstubAllGlobals();
  });

  it("keeps fixture debug logs when the drawer hydrates logs during capture (#0829)", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const repo = useRepoStore();
    vi.stubGlobal("location", { search: "?task=0820&tab=debug&shotState=drawer:debugLogs" });
    applyShotPreviewFixture(repo, "drawer:debugLogs");
    // DebugPanel's onMounted calls refreshTaskLogs; during a `drawer:debugLogs`
    // capture that must keep the seeded long row instead of fetching the real
    // (and differently-shaped) logs, which is why the reviewer saw a truncated
    // "shots: skipped…" row instead of the declared "main advanced…" expansion.
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    await repo.refreshTaskLogs("0820");
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(repo.taskLogs["0820"]).toHaveLength(2);
    expect(repo.taskLogs["0820"]![0]!.message).toContain("main advanced with bookkeeping");
    vi.unstubAllGlobals();
  });

  it("seeds 15 succeeded close-outs for the integration timer tooltip (#0819)", () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const repo = useRepoStore();
    const ui = useUiStore();
    applyShotPreviewFixture(repo, "integration:median15");
    const notices = useNoticesStore();
    expect(notices.closeOutOutcomes).toHaveLength(15);
    expect(integrationMedianChip(notices.closeOutOutcomes)).toBe("Median 8m 00s · 15 runs");
    expect(repo.integration?.active?.taskId).toBe(SHOT_PREVIEW_FIXTURE_TASK_ID);
    expect(ui.integrationBarCollapsed).toBe(true);
  });

  it("seeds a multi-area human task with diff stats for card-chip shots (#0776, #0795)", () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const repo = useRepoStore();
    applyShotPreviewFixture(repo, "board:cardChips");
    const task = repo.tasks.find((t) => t.id === SHOT_PREVIEW_FIXTURE_TASK_ID);
    expect(task, "board:cardChips seeds the fixture task").toBeTruthy();
    expect(task!.areas).toEqual(["web", "server"]);
    expect(task!.area).toBe("web, server");
    expect(task!.assignee).toBe("human");
    expect(task!.assignedTo).toBe("Nick");
    expect(repo.diffStatsFor(SHOT_PREVIEW_FIXTURE_TASK_ID)).toEqual({
      filesChanged: 10,
      additions: 377,
      deletions: 5,
    });
    // Still no branch: the card must not request diff stats for the fake id.
    expect(task!.branch).toBe("");
  });

  it("seeds a ready human task with a branch and zero diff stats (#0847)", () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const repo = useRepoStore();
    applyShotPreviewFixture(repo, "card:noChanges");
    const task = repo.tasks.find((t) => t.id === SHOT_PREVIEW_FIXTURE_TASK_ID);
    expect(task).toBeTruthy();
    expect(task!.status).toBe("ready");
    expect(task!.branch).toBe("feat/no-changes");
    expect(task!.assignee).toBe("human");
    expect(repo.diffStatsFor(SHOT_PREVIEW_FIXTURE_TASK_ID)).toEqual({
      filesChanged: 0,
      additions: 0,
      deletions: 0,
    });
  });

  it(
    "gives the fixture task no branch so a mounted card never requests its diff stats " +
      "(#0768) — the server 404s for the fake id and the handoff UI gate records that " +
      "404 plus its console error, failing handoff; TaskCard only requests diff stats " +
      "for a task with a truthy branch",
    () => {
      const pinia = createPinia();
      setActivePinia(pinia);
      const repo = useRepoStore();
      for (const fixture of [
        "card:doneError",
        "card:humanStep",
        "closeOut:uploading",
        "closeOut:remoteTests",
        "board:withReviewTask",
        "board:cardChips",
        "board:activeCoding",
        "closeOut:stalled",
        "card:handoffConflict",
        "card:checkpointRecovery",
        "drawer:shotEvidence",
        "integration:median15",
      ] as const) {
        applyShotPreviewFixture(repo, fixture);
        const task = repo.tasks.find((t) => t.id === SHOT_PREVIEW_FIXTURE_TASK_ID);
        expect(task, `${fixture} seeds the fixture task`).toBeTruthy();
        expect(task!.branch).toBe("");
      }
    },
  );
});
