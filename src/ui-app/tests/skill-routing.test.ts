import { afterEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { selectSkillsForRun } from "../../server/agents";
import type { Agent, RepoOSConfig, Task } from "../../core/types";

/**
 * `selectSkillsForRun` (ead7245f) shipped with no direct coverage, so when it
 * started prepending a sys line to every run it silently broke ~6 output-shape
 * assertions across three suites and every `repoos check` for days. Pin the
 * routing behaviour so a change to the heuristic is visible.
 */

const roots: string[] = [];
afterEach(() => roots.splice(0).forEach((r) => rmSync(r, { recursive: true, force: true })));

function repoWithSkills(skills: Record<string, string>): RepoOSConfig {
  const root = mkdtempSync(join(tmpdir(), "repoos-skillrt-"));
  roots.push(root);
  for (const [name, description] of Object.entries(skills)) {
    mkdirSync(join(root, "skills", name), { recursive: true });
    writeFileSync(
      join(root, "skills", name, "SKILL.md"),
      `---\nname: ${name}\ndescription: ${description}\n---\n# ${name}\n`,
    );
  }
  return {
    root,
    workDir: "work",
    docsDir: "docs",
    skillsDir: "skills",
    taskExtensions: [".md"],
    defaultStatus: "inbox",
    defaultAssignee: "unassigned",
    cacheDir: ".repoos",
  };
}

const task = (over: Partial<Task>): Task =>
  ({ id: "0001", title: "", area: "", body: "", ...over }) as Task;
const agent = (over: Partial<Agent> = {}): Agent =>
  ({ name: "engineer", cli: "opencode", model: "default", enabled: true, ...over }) as Agent;

describe("selectSkillsForRun", () => {
  const cfg = () =>
    repoWithSkills({
      "frontend-design": "Guidance for building Vue components and CSS layout",
      "code-review": "How to review a diff for regressions before sign-off",
    });

  it("routes a skill when the task text hits its routing hints", () => {
    const picked = selectSkillsForRun(
      task({ title: "Fix the CSS layout on the settings page", area: "web" }),
      agent(),
      cfg(),
    );
    expect(picked.map((s) => s.name)).toContain("frontend-design");
  });

  it("selects nothing for a task with no relevant keywords", () => {
    const picked = selectSkillsForRun(
      task({ title: "Bump the release version", area: "infra", body: "Cut a patch release." }),
      agent(),
      cfg(),
    );
    expect(picked).toEqual([]);
  });

  it("never returns more than three skills", () => {
    const many: Record<string, string> = {};
    for (let i = 0; i < 8; i++) many[`s${i}`] = "review diff regression frontend ui css component";
    const picked = selectSkillsForRun(
      task({ title: "review the frontend css diff for regressions", body: "ui component" }),
      agent(),
      repoWithSkills(many),
    );
    expect(picked.length).toBeLessThanOrEqual(3);
  });
});
