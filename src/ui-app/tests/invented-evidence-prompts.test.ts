import { describe, expect, it } from "vitest";
import { DEFAULT_AGENTS } from "../../core/config";
import type { Agent } from "../../core/types";
import { missionFor } from "../../server/agents";
import { reviewMission } from "../../server/review";
import type { Task } from "../../core/types";

const engineer = DEFAULT_AGENTS.find((a) => a.name === "engineer")!;
const reviewer = DEFAULT_AGENTS.find((a) => a.name === "reviewer")!;

const task = (overrides: Partial<Task> = {}): Task =>
  ({
    id: "0698",
    title: "Invented evidence",
    status: "review",
    branch: "feat/invented-evidence",
    body: "## Acceptance criteria\n\n- [ ] Done\n",
    path: "work/0698-invented-evidence.md",
    absPath: "/tmp/work/0698-invented-evidence.md",
    area: "server",
    ...overrides,
  }) as Task;

const cfg = {
  root: "/tmp/repo",
  workDir: "work",
  defaultStatus: "inbox",
  defaultAssignee: "x",
} as const;

describe("invented evidence defaults (#0698)", () => {
  it("seeds engineer instructions that forbid inventing evidence", () => {
    expect(engineer.instructions).toMatch(/never invent evidence/i);
    expect(engineer.instructions).toMatch(/human must supply/i);
  });

  it("seeds reviewer instructions that treat invented evidence as blocking", () => {
    expect(reviewer.instructions).toMatch(/invented or impossible evidence/i);
    expect(reviewer.instructions).toMatch(/read-only/i);
  });

  it("includes the evidence block in the built-in engineer mission", () => {
    const mission = missionFor(
      task({ status: "active" }),
      "feat/invented-evidence",
      "/tmp/worktree",
      engineer as Agent,
      cfg as never,
    );
    expect(mission).toContain("## Evidence — never invent");
    expect(mission).toMatch(/fabricate device test results/i);
  });

  it("does not add the evidence block to non-engineer missions", () => {
    const mission = missionFor(
      task({ status: "active" }),
      "feat/invented-evidence",
      "/tmp/worktree",
      reviewer as Agent,
      cfg as never,
    );
    expect(mission).not.toContain("## Evidence — never invent");
  });

  it("includes invented-evidence checks in the built-in review mission", () => {
    const mission = reviewMission(task(), reviewer as Agent, "/tmp/worktree", "main", cfg as never);
    expect(mission).toMatch(/invented or/i);
    expect(mission).toMatch(/impossible proof/i);
    expect(mission).toMatch(/read-only/i);
    expect(mission).toMatch(/forbidden writes are blocking/i);
  });
});
