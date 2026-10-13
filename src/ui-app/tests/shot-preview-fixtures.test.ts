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

  it(
    "gives the fixture task no branch so a mounted card never requests its diff stats " +
      "(#0768) — the server 404s for the fake id and the handoff UI gate records that " +
      "404 plus its console error, failing handoff; TaskCard only requests diff stats " +
      "for a task with a truthy branch",
    () => {
      const pinia = createPinia();
      setActivePinia(pinia);
      const repo = useRepoStore();
      for (const fixture of ["card:doneError", "board:withReviewTask"] as const) {
        applyShotPreviewFixture(repo, fixture);
        const task = repo.tasks.find((t) => t.id === SHOT_PREVIEW_FIXTURE_TASK_ID);
        expect(task, `${fixture} seeds the fixture task`).toBeTruthy();
        expect(task!.branch).toBe("");
      }
    },
  );
});
