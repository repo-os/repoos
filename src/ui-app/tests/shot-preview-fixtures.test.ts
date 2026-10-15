import { describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { SHOT_PREVIEW_FIXTURE_TASK_ID } from "../../core/shot-fixtures.js";
import {
  applyShotPreviewFixture,
  readShotPreviewFixtureFromLocation,
  shotFixturePinnedIntegration,
} from "../src/lib/shot-preview-fixtures";
import { useRepoStore } from "../src/stores/repo";

describe("shot preview board fixtures (#0743)", () => {
  it("reads shotState from the location query", () => {
    expect(readShotPreviewFixtureFromLocation({ search: "?shotState=closeOut%3Aactive" })).toBe(
      "closeOut:active",
    );
    expect(readShotPreviewFixtureFromLocation({ search: "" })).toBeNull();
  });

  it("seeds close-out pipeline state for integration bar shots", () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const repo = useRepoStore();
    applyShotPreviewFixture(repo, "closeOut:active");
    expect(repo.integration?.active?.taskId).toBe(SHOT_PREVIEW_FIXTURE_TASK_ID);
    expect(repo.integration?.empty).toBe(false);
  });

  it("seeds an active coding run for board card indicator shots (#0787)", () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const repo = useRepoStore();
    applyShotPreviewFixture(repo, "board:activeCoding");
    expect(repo.tasks.some((t) => t.id === SHOT_PREVIEW_FIXTURE_TASK_ID && t.status === "active")).toBe(
      true,
    );
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

  it("seeds a multi-area task with diff stats for card-chip shots (#0776)", () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const repo = useRepoStore();
    applyShotPreviewFixture(repo, "board:cardChips");
    const task = repo.tasks.find((t) => t.id === SHOT_PREVIEW_FIXTURE_TASK_ID);
    expect(task, "board:cardChips seeds the fixture task").toBeTruthy();
    expect(task!.areas).toEqual(["web", "server"]);
    expect(task!.area).toBe("web, server");
    expect(repo.diffStatsFor(SHOT_PREVIEW_FIXTURE_TASK_ID)).toEqual({
      filesChanged: 10,
      additions: 377,
      deletions: 5,
    });
    // Still no branch: the card must not request diff stats for the fake id.
    expect(task!.branch).toBe("");
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
        "closeOut:uploading",
        "board:withReviewTask",
        "board:cardChips",
        "board:activeCoding",
        "closeOut:stalled",
      ] as const) {
        applyShotPreviewFixture(repo, fixture);
        const task = repo.tasks.find((t) => t.id === SHOT_PREVIEW_FIXTURE_TASK_ID);
        expect(task, `${fixture} seeds the fixture task`).toBeTruthy();
        expect(task!.branch).toBe("");
      }
    },
  );
});
