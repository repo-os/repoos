import { describe, expect, it } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { SHOT_PREVIEW_FIXTURE_TASK_ID } from "../../core/shot-fixtures.js";
import {
  applyShotPreviewFixture,
  readShotPreviewFixtureFromLocation,
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

  it("seeds a review card with done-error footer state", () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const repo = useRepoStore();
    applyShotPreviewFixture(repo, "card:doneError");
    expect(repo.tasks.some((t) => t.id === SHOT_PREVIEW_FIXTURE_TASK_ID)).toBe(true);
    expect(repo.doneErrors[SHOT_PREVIEW_FIXTURE_TASK_ID]?.step).toBe("check");
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
    const { integrationPipelineStalled } = await import(
      "../src/lib/integration-pipeline-ui"
    );
    expect(integrationPipelineStalled(repo.integration, Date.now())).toBe(true);
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
        "board:withReviewTask",
        "board:cardChips",
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
