/**
 * The polyglot adoption matrix (#0452) — the fast, hermetic half.
 *
 * One synthetic fixture per real-world repository shape, and for each one the
 * adoption lifecycle a person actually walks through: init into the default
 * namespaced layout and the alternate root layout, parse the generated config,
 * confirm existing AGENTS.md and project files are never overwritten, resolve
 * the check plan the stack implies, get install-oriented diagnostics when a
 * toolchain is missing, and place a task worktree as a sibling of the Git root.
 *
 * Nothing here needs a toolchain, a network, a model provider or a remote: the
 * fixtures are written to temp directories at run time. The toolchain-backed
 * half lives in `adoption-matrix-toolchain.test.ts` and self-skips when a
 * binary is absent, so `bun run test` stays practical on a laptop.
 *
 * Every assertion runs inside `runPhase`, which prefixes a failure with
 * `[fixture=<id> phase=<phase>]` and retains a redacted diagnostic artifact —
 * so a regression names the fixture and phase instead of surfacing as a
 * generic integration-test failure.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  REPOOS_AGENTS_SECTION_MARKER,
  repoOSAgentsSectionAddition,
  scaffoldInto,
} from "../../commands/init.js";
import { findRepoRoot, loadConfig, worktreesDir } from "../../core/config.js";
import { parseTask } from "../../core/task.js";
import { currentBranch, ensureWorktree, isGitRepo } from "../../core/git.js";
import { detectRepoMarkers } from "../../core/check-runner.js";
import { resolveCheckPlan } from "../../core/check-plan.js";
import { runCheckPlan } from "../../commands/check.js";
import {
  ADOPTION_FIXTURES,
  MATRIX_VERSION,
  fixtureById,
  fixtureFilePaths,
  materializeFixture,
  type AdoptionFixture,
} from "./adoption/fixtures.js";
import {
  initGitRepo,
  newFixtureDir,
  realRoot,
  removeFixtureDir,
  runPhase,
} from "./adoption/harness.js";

// Vitest rewrites `import.meta.url` to a dev-server URL, so resolve the repo
// root the same way the CLI does — by walking up to `repoos.toml`/`.git`.
const REPO_ROOT = findRepoRoot(process.cwd());

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) removeFixtureDir(root);
});

function newRoot(fixture: AdoptionFixture): string {
  const root = newFixtureDir(`repoos-adopt-${fixture.id}-`);
  roots.push(root);
  materializeFixture(fixture.id, root);
  return root;
}

/**
 * Declare one scenario for one fixture. The test body receives the materialized
 * fixture root; the name and every failure carry the fixture id and phase.
 */
function itPhase(
  fixture: AdoptionFixture,
  phase: string,
  expected: string,
  body: (root: string) => void | Promise<void>,
): void {
  // Worktree phases spawn real git subprocesses; 30s covers slow machines.
  it(
    phase,
    async () => {
      const root = newRoot(fixture);
      await runPhase(fixture, phase, () => body(root), { root, expected });
    },
    30_000,
  );
}

function readFixtureFiles(root: string, id: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const rel of fixtureFilePaths(id)) out[rel] = readFileSync(join(root, rel), "utf8");
  return out;
}

const SAMPLE_TASK = `---
id: "0099"
title: Adoption fixture task
type: chore
status: ready
priority: p2
area: infra
assigned_to: ai
created_by: ""
branch: "feat/0099-adoption-fixture"
---
## Goal

A task file placed in a fixture so the worktree scenario exercises the same
path and Git-root assumptions a real task does.
`;

for (const fixture of ADOPTION_FIXTURES) {
  describe(`matrix · ${fixture.id} · ${fixture.stack}`, () => {
    itPhase(
      fixture,
      "init/namespaced",
      "scaffolds repoos/work + repoos/docs, a root repoos.toml/AGENTS.md, and leaves project files byte-identical",
      (root) => {
        const before = readFixtureFiles(root, fixture.id);
        const { created } = scaffoldInto(root, "", "repoos", fixture.kind);

        expect(created).toContain("repoos.toml");
        expect(created).toContain("repoos/work/");
        expect(created).toContain("repoos/docs/");
        expect(existsSync(join(root, "repoos/work/0001-set-up-repoos.md"))).toBe(true);
        expect(existsSync(join(root, "repoos/docs"))).toBe(true);
        // AGENTS.md is created when absent and preserved when present.
        expect(existsSync(join(root, "AGENTS.md"))).toBe(true);
        if (!fixture.hasAgentsMd) expect(created).toContain("AGENTS.md");

        const toml = readFileSync(join(root, "repoos.toml"), "utf8");
        expect(toml).toContain('workDir = "repoos/work"');
        expect(toml).toContain('docsDir = "repoos/docs"');
        expect(toml).toContain('cacheDir = "repoos/.repoos"');
        expect(readFileSync(join(root, ".gitignore"), "utf8")).toContain("repoos/.repoos/");

        // The generated task layout is valid frontmatter, not just present:
        // 0001 is the completed scaffold task, and the seeded starter is
        // genuinely `ready` so the board is usable immediately.
        const readTask = (rel: string) => {
          const absPath = join(root, rel);
          return parseTask({
            content: readFileSync(absPath, "utf8"),
            absPath,
            root,
            defaultStatus: "inbox",
            defaultAssignee: "unassigned",
          });
        };
        const scaffoldTask = readTask("repoos/work/0001-set-up-repoos.md");
        expect(scaffoldTask.id).toBe("0001");
        expect(scaffoldTask.status).toBe("done");
        const starterRel =
          fixture.kind === "new"
            ? "repoos/work/0002-flesh-out-the-vision.md"
            : "repoos/work/0002-read-the-codebase.md";
        expect(readTask(starterRel).status).toBe("ready");

        // init is idempotent: a re-run creates nothing new.
        expect(scaffoldInto(root, "", "repoos", fixture.kind).created).toEqual([]);
        // …and it never rewrote a file the project already owned. `.gitignore`
        // is the one file init is documented to append RepoOS entries to.
        for (const [rel, content] of Object.entries(before)) {
          if (rel === ".gitignore") continue;
          expect(readFileSync(join(root, rel), "utf8"), `${rel} was modified by init`).toBe(
            content,
          );
        }
      },
    );

    itPhase(
      fixture,
      "init/root",
      "scaffolds work/ + docs/ at the repo root with only the default config",
      (root) => {
        const { created } = scaffoldInto(root, "", "", fixture.kind);
        expect(created).toContain("work/");
        expect(existsSync(join(root, "docs"))).toBe(true);
        expect(existsSync(join(root, "work/0001-set-up-repoos.md"))).toBe(true);

        const toml = readFileSync(join(root, "repoos.toml"), "utf8");
        expect(toml).not.toContain("workDir");
        expect(toml).not.toContain("docsDir");
        expect(readFileSync(join(root, ".gitignore"), "utf8")).toContain(".repoos/");
      },
    );

    itPhase(
      fixture,
      "config/parse",
      "the generated repoos.toml resolves to the selected layout through loadConfig",
      (root) => {
        scaffoldInto(root, "", "repoos", fixture.kind);
        const namespaced = loadConfig(root);
        expect(namespaced.workDir).toBe("repoos/work");
        expect(namespaced.docsDir).toBe("repoos/docs");
        expect(namespaced.cacheDir).toBe("repoos/.repoos");
      },
    );

    itPhase(
      fixture,
      "agents/preserve",
      "an existing AGENTS.md is preserved, and any RepoOS appendix is optional and non-destructive",
      (root) => {
        const agentsPath = join(root, "AGENTS.md");
        const original = fixture.hasAgentsMd ? readFileSync(agentsPath, "utf8") : null;

        scaffoldInto(root, "", fixture.hasAgentsMd ? "" : "repoos", fixture.kind);

        if (original !== null) {
          expect(readFileSync(agentsPath, "utf8")).toBe(original);
          const addition = repoOSAgentsSectionAddition(original, "work");
          expect(addition).not.toBeNull();
          // The offered addition appends; it never replaces.
          expect(original + addition).toContain(original.trim());
          expect(original + addition).toContain(REPOOS_AGENTS_SECTION_MARKER);
        } else {
          const generated = readFileSync(agentsPath, "utf8");
          expect(generated).toContain("RepoOS");
          // The generated instructions point at the layout init actually used:
          // this fixture was scaffolded namespaced, so they name repoos/work.
          expect(generated).toContain("repoos/work/");
        }
      },
    );

    itPhase(
      fixture,
      "plan/infer",
      `inferred plan == ${fixture.expectedPlan.steps.join(", ") || "(empty)"}`,
      (root) => {
        const markers = detectRepoMarkers(root);
        const plan = resolveCheckPlan({ check: undefined, markers });
        expect(plan.source).toBe(fixture.expectedPlan.source);
        expect(plan.steps.map((s) => s.name)).toEqual(fixture.expectedPlan.steps);
        expect(plan.steps.map((s) => s.command).filter(Boolean)).toEqual(
          fixture.expectedPlan.commands,
        );
        for (const [name, requires] of Object.entries(fixture.expectedPlan.requires)) {
          const step = plan.steps.find((s) => s.name === name);
          expect(step, `expected plan has a step named "${name}"`).toBeDefined();
          expect(step?.requires).toEqual(requires);
        }
        if (fixture.expectedPlan.source === "inferred") {
          expect(plan.warnings.join(" ")).toMatch(/inferred/i);
        }
        if (fixture.expectedPlan.source === "empty") {
          // The gate fails on this — see the "no check plan" guard in
          // src/commands/check.ts — so an empty plan must stay empty.
          expect(plan.steps).toEqual([]);
          expect(plan.errors).toEqual([]);
        }
      },
    );

    if (Object.keys(fixture.expectedPlan.requires).length > 0) {
      itPhase(
        fixture,
        "plan/missing-tool",
        "a required step whose tool is absent reports missing-prereq with install advice, never a pass",
        async (root) => {
          // A real repo, so a stack-neutral guard that shells out to git (the
          // task-asset check) has somewhere to run and the only thing missing
          // is genuinely the toolchain.
          initGitRepo(root);
          const emptyBin = newFixtureDir("repoos-adopt-empty-path-");
          roots.push(emptyBin);
          const originalPath = process.env.PATH;
          try {
            process.env.PATH = emptyBin;
            const plan = resolveCheckPlan({ check: undefined, markers: detectRepoMarkers(root) });
            const results = await runCheckPlan(plan, { repoRoot: root });
            const stepsWithPrereqs = plan.steps.filter((s) => s.requires.length > 0);
            expect(stepsWithPrereqs.length).toBeGreaterThan(0);
            for (const step of stepsWithPrereqs) {
              const result = results.find((r) => r.name === step.name);
              expect(result, `ran step "${step.name}"`).toBeDefined();
              // A step that would skip anyway (no script/lockfile) may skip;
              // otherwise the absent tool is a missing-prereq — never green.
              expect(["missing-prereq", "skipped"]).toContain(result?.status);
              if (result?.status === "missing-prereq") {
                expect(result.detail).toMatch(/missing prerequisite/);
              }
            }
            expect(results.some((r) => r.status === "missing-prereq")).toBe(true);
          } finally {
            process.env.PATH = originalPath;
          }
        },
      );
    }

    itPhase(
      fixture,
      "worktree/lifecycle",
      "a task worktree lands as a sibling of the Git root, contains the task file, and is reused",
      (root) => {
        // Place the task file before the initial commit so the worktree is cut
        // from a branch that already carries it.
        mkdirSync(join(root, "work"), { recursive: true });
        writeFileSync(join(root, "work/0099-adoption-fixture.md"), SAMPLE_TASK);
        initGitRepo(root);

        const branch = "feat/0099-adoption-fixture";
        const taskRel = "work/0099-adoption-fixture.md";
        const result = ensureWorktree(root, branch, taskRel);

        expect(result.ok, result.reason ?? "").toBe(true);
        expect(result.created).toBe(true);
        expect(isGitRepo(result.path)).toBe(true);
        expect(realRoot(result.path)).toBe(realRoot(join(worktreesDir(root), branch)));
        // The worktree is a sibling — never nested inside the main checkout.
        expect(relative(realRoot(root), realRoot(result.path)).startsWith("..")).toBe(true);
        expect(existsSync(join(result.path, taskRel))).toBe(true);
        expect(currentBranch(result.path)).toBe(branch);

        // Reuse is idempotent and returns the same path.
        const again = ensureWorktree(root, branch, taskRel);
        expect(again.ok).toBe(true);
        expect(again.created).toBe(false);
        expect(realRoot(again.path)).toBe(realRoot(result.path));
      },
    );
  });
}

describe("matrix integrity", () => {
  it("declares each fixture once with a complete, self-consistent row", () => {
    const ids = ADOPTION_FIXTURES.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(MATRIX_VERSION).toBeGreaterThanOrEqual(1);
    expect(ids).toContain("go-service");
    for (const fixture of ADOPTION_FIXTURES) {
      expect(fixture.intent.length, `${fixture.id} has an intent`).toBeGreaterThan(10);
      expect(fixture.stack.length).toBeGreaterThan(0);
      const planSteps = new Set(fixture.expectedPlan.steps);
      for (const [name, requires] of Object.entries(fixture.expectedPlan.requires)) {
        expect(planSteps.has(name), `${fixture.id}: requires names a real step`).toBe(true);
        expect(requires.length, `${fixture.id}: ${name} requires something`).toBeGreaterThan(0);
      }
      for (const check of fixture.toolchainChecks) {
        expect(fixture.toolchain, `${fixture.id}: toolchain check has a declared tool`).toContain(
          check.tool,
        );
      }
    }
  });

  it("contains no secrets, credentials or live-provider dependencies", () => {
    const offenders: string[] = [];
    for (const fixture of ADOPTION_FIXTURES) {
      const root = newRoot(fixture);
      for (const rel of fixtureFilePaths(fixture.id)) {
        const content = readFileSync(join(root, rel), "utf8");
        if (
          /(sk-[A-Za-z0-9]{16,}|ghp_[A-Za-z0-9]{20,}|ANTHROPIC_API_KEY|OPENAI_API_KEY|api[_-]?key\s*[=:]\s*\S|Bearer\s+[A-Za-z0-9._-]{8,})/i.test(
            content,
          )
        ) {
          offenders.push(`${fixture.id}:${rel}`);
        }
        if (/\b(openai|anthropic|openrouter|ollama)\b/i.test(content)) {
          offenders.push(`${fixture.id}:${rel} (provider dependency)`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("covers every stack the user-facing check docs promise", () => {
    // user-docs/check.md claims repoos check works for these stacks. If that
    // promise is ever widened, the matching fixture must exist first — this is
    // the acceptance criterion "user-facing docs only promise what the matrix
    // covers", enforced rather than trusted.
    const checkDoc = readFileSync(join(REPO_ROOT, "user-docs/check.md"), "utf8");
    const promised: Array<[string, string]> = [
      ["Go", "go-service"],
      ["Android/Gradle", "android-gradle"],
      ["Rust", "rust-cargo"],
      ["JavaScript", "ts-bun-web"],
    ];
    for (const [term, fixtureId] of promised) {
      expect(checkDoc, `user-docs/check.md still promises ${term}`).toContain(term);
      expect(
        fixtureById(fixtureId).stack.length,
        `${term} is covered by a fixture`,
      ).toBeGreaterThan(0);
    }
  });

  it("keeps the human-readable docs and CI workflow in sync with the manifest", () => {
    const doc = readFileSync(join(REPO_ROOT, "docs/adoption-matrix.md"), "utf8");
    const workflow = readFileSync(join(REPO_ROOT, ".github/workflows/adoption-matrix.yml"), "utf8");
    for (const fixture of ADOPTION_FIXTURES) {
      expect(doc, `docs/adoption-matrix.md lists ${fixture.id}`).toContain(fixture.id);
    }
    for (const tool of ["go", "cargo", "gradle"]) {
      expect(workflow, `CI matrix installs ${tool}`).toContain(tool);
    }
  });

  it("a newly scaffolded empty repo has no inferred plan, so the gate cannot pass vacuously", () => {
    const root = newFixtureDir("repoos-adopt-empty-gate-");
    roots.push(root);
    const fixture = fixtureById("empty-repo");
    materializeFixture(fixture.id, root);
    scaffoldInto(root, "a brand new project", "repoos", "new");
    const plan = resolveCheckPlan({ check: undefined, markers: detectRepoMarkers(root) });
    // Still nothing recognisable: zero steps, which src/commands/check.ts turns
    // into a hard failure rather than an all-green definition of done.
    expect(plan.steps).toEqual([]);
  });
});

describe("matrix path and root assumptions", () => {
  it("scaffolds and creates a worktree under a repo path containing a space", () => {
    const parent = newFixtureDir("repoos-adopt-space-");
    roots.push(parent);
    const root = join(parent, "repo with space");
    mkdirSync(root, { recursive: true });
    materializeFixture("go-service", root);
    scaffoldInto(root, "", "repoos", "existing");
    initGitRepo(root);
    const result = ensureWorktree(root, "feat/spaced", undefined);
    expect(result.ok, result.reason ?? "").toBe(true);
    expect(existsSync(join(root, "repoos/work/0001-set-up-repoos.md"))).toBe(true);
    expect(relative(realRoot(root), realRoot(result.path)).startsWith("..")).toBe(true);
  }, 30_000);

  it("resolves the repo root from a deeply nested directory, not the nearest work/", () => {
    const root = newFixtureDir("repoos-adopt-nested-");
    roots.push(root);
    materializeFixture("existing-git-repo", root);
    initGitRepo(root);
    const nested = join(root, "internal/greeting/deep/deeper");
    mkdirSync(nested, { recursive: true });
    expect(realRoot(findRepoRoot(nested))).toBe(realRoot(root));
    // A sibling directory that merely contains a work/ is not a RepoOS root.
    const sibling = join(root, "..", "not-repoos");
    expect(resolve(findRepoRoot(nested))).not.toBe(resolve(sibling));
  });

  it("supports a reviewed alternate namespace layout", () => {
    const root = newFixtureDir("repoos-adopt-custom-");
    roots.push(root);
    materializeFixture("go-service", root);
    const { created } = scaffoldInto(root, "", ".meta/repoos", "existing");
    expect(created).toContain(".meta/repoos/work/");
    const cfg = loadConfig(root);
    expect(cfg.workDir).toBe(".meta/repoos/work");
    expect(cfg.docsDir).toBe(".meta/repoos/docs");
    expect(cfg.cacheDir).toBe(".meta/repoos/.repoos");
  });

  it("is deterministic and non-interactive: a re-run changes nothing", () => {
    const root = newFixtureDir("repoos-adopt-deterministic-");
    roots.push(root);
    materializeFixture("go-service", root);
    scaffoldInto(root, "deterministic fixture", "repoos", "existing");
    const snapshot = (): Record<string, string> => ({
      toml: readFileSync(join(root, "repoos.toml"), "utf8"),
      agents: readFileSync(join(root, "AGENTS.md"), "utf8"),
      starter: readFileSync(join(root, "repoos/work/0002-read-the-codebase.md"), "utf8"),
    });
    const first = snapshot();
    const second = scaffoldInto(root, "deterministic fixture", "repoos", "existing");
    expect(second.created).toEqual([]);
    expect(snapshot()).toEqual(first);
  });
});
