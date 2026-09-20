/**
 * Init's starter-plan proposal (#0447): init inspects durable markers and
 * proposes the plan the inference path would resolve, uncommitted and
 * reviewable — never silently enabling commands in repoos.toml.
 */
import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  CHECK_PLAN_PROPOSAL_MARKER,
  formatPlanProposalToml,
  proposeCheckPlan,
} from "../../core/check-plan-proposal.js";

const roots: string[] = [];
afterEach(() => {
  for (const r of roots) rmSync(r, { recursive: true, force: true });
  roots.length = 0;
});

function tmpRepo(): string {
  const d = mkdtempSync(join(tmpdir(), "repoos-plan-proposal-"));
  roots.push(d);
  return d;
}

describe("proposeCheckPlan", () => {
  it("proposes a Go plan for a repo with only go.mod", () => {
    const root = tmpRepo();
    writeFileSync(join(root, "go.mod"), "module example.com/x\n", "utf8");
    const proposal = proposeCheckPlan(root);
    expect(proposal?.stacks).toEqual(["go"]);
    expect(proposal?.toml).toContain('command = "go build ./..."');
    expect(proposal?.toml).toContain(CHECK_PLAN_PROPOSAL_MARKER);
  });

  it("proposes a JS plan from package.json scripts", () => {
    const root = tmpRepo();
    writeFileSync(
      join(root, "package.json"),
      JSON.stringify({ scripts: { build: "vite build", test: "vitest run" } }),
      "utf8",
    );
    const proposal = proposeCheckPlan(root);
    expect(proposal?.stacks).toEqual(["js"]);
    // The inferred plan is stack-neutral: package.json alone is not a Bun repo.
    expect(proposal?.toml).toContain('kind = "build"');
  });

  it("adds a commented cross-cutting template for a mixed repo", () => {
    const root = tmpRepo();
    writeFileSync(join(root, "go.mod"), "module example.com/x\n", "utf8");
    writeFileSync(
      join(root, "package.json"),
      JSON.stringify({ scripts: { test: "vitest run" } }),
      "utf8",
    );
    const proposal = proposeCheckPlan(root);
    expect(proposal?.stacks).toEqual(["go", "js"]);
    expect(proposal?.toml).toContain("cross-stack-contract");
    expect(proposal?.toml).toContain("Mixed stacks detected");
  });

  it("returns null when a plan is already declared", () => {
    const root = tmpRepo();
    writeFileSync(join(root, "go.mod"), "module example.com/x\n", "utf8");
    writeFileSync(
      join(root, "repoos.toml"),
      '[check]\nversion = 1\n\n[[check.steps]]\nname = "build"\ncommand = "go build ./..."\n',
      "utf8",
    );
    expect(proposeCheckPlan(root)).toBeNull();
  });

  it("returns null when a legacy [check] config is present", () => {
    const root = tmpRepo();
    writeFileSync(join(root, "go.mod"), "module example.com/x\n", "utf8");
    writeFileSync(join(root, "repoos.toml"), '[check]\nuiSmoke = "bun run smoke"\n', "utf8");
    expect(proposeCheckPlan(root)).toBeNull();
  });

  it("returns null when no stack is recognisable", () => {
    expect(proposeCheckPlan(tmpRepo())).toBeNull();
  });
});

describe("formatPlanProposalToml", () => {
  it("omits the mixed-stack template for a single stack", () => {
    const toml = formatPlanProposalToml(
      {
        version: 1,
        defaultProfile: "default",
        source: "inferred",
        warnings: [],
        errors: [],
        steps: [
          {
            name: "build",
            command: "go build ./...",
            timeoutMs: 600_000,
            required: true,
            profiles: [],
            whenChanged: [],
            requires: ["go"],
            dependsOn: [],
          },
        ],
      },
      ["go"],
    );
    expect(toml).not.toContain("cross-stack-contract");
    expect(toml).toContain('command = "go build ./..."');
  });
});
