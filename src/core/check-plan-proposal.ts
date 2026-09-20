/**
 * The starter check plan `repoos init` offers (#0447).
 *
 * Init inspects only durable project signals — a package manifest, `go.mod`,
 * `Cargo.toml`, a Gradle wrapper, a Makefile/justfile — and *proposes* the
 * plan the inference path would resolve. It never edits the effective plan
 * silently: the proposal is written to a separate, uncommitted file (or handed
 * to the interactive prompt) so a human reviews and edits it before it becomes
 * `[[check.steps]]` in `repoos.toml`. That is deliberate — a guessed build
 * command that ran before anyone looked at it would make `repoos check` lie.
 *
 * The resolution itself is not duplicated here: this module only decides
 * whether a proposal is warranted and formats the plan the engine already
 * resolves.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { loadConfig } from "./config.js";
import {
  detectedStacks,
  formatPlanToml,
  hasLegacyCheckConfig,
  resolveCheckPlan,
  type CheckPlan,
} from "./check-plan.js";
import { detectRepoMarkers } from "./check-runner.js";
import { preferBunForDevTasks } from "./runtime.js";

/** The uncommitted file init writes the proposal to for later review. */
export const CHECK_PLAN_PROPOSAL_FILE = "repoos.check-plan.proposed.toml";

/** Marker line identifying a file this module wrote, so re-runs are safe. */
export const CHECK_PLAN_PROPOSAL_MARKER = "# RepoOS proposed starter check plan";

export interface CheckPlanProposal {
  plan: CheckPlan;
  /** Self-contained `[[check.steps]]` TOML, ready to append to repoos.toml. */
  toml: string;
  /** Stacks the proposal was inferred from, for the human-facing summary. */
  stacks: string[];
}

/**
 * The starter plan init should propose for `root`, or null when there is
 * nothing useful to propose: a plan is already declared (or legacy-configured),
 * or the repo carries no recognisable stack. Never guesses — an unrecognisable
 * repo gets no proposal rather than a plan that proves nothing.
 */
export function proposeCheckPlan(root: string): CheckPlanProposal | null {
  const cfg = loadConfig(root);
  // An explicit plan — declared steps or legacy keys — is the repo's own; init
  // must not talk over it.
  if (cfg.check?.steps?.length || hasLegacyCheckConfig(cfg.check)) return null;

  const markers = detectRepoMarkers(root);
  const plan = resolveCheckPlan({
    check: cfg.check,
    markers,
    bunRunner: preferBunForDevTasks(root),
  });
  if (plan.source !== "inferred" || plan.steps.length === 0) return null;

  const stacks = detectedStacks(markers);
  return {
    plan,
    toml: formatPlanProposalToml(plan, stacks),
    stacks,
  };
}

/**
 * The proposal TOML: the engine's own `formatPlanToml` output, headed by a
 * marker comment and — for a mixed repo — a commented template for the
 * cross-cutting contract step the inferred plan cannot invent. Comments make
 * the file self-describing wherever a human finds it.
 */
export function formatPlanProposalToml(plan: CheckPlan, stacks: string[]): string {
  const head = [
    `${CHECK_PLAN_PROPOSAL_MARKER} for this repo.`,
    "# Review and edit it, then move the [[check.steps]] below into repoos.toml.",
    "# This file is a proposal only — repoos check does not read it.",
  ].join("\n");

  let tail = "";
  if (stacks.length > 1) {
    tail = [
      "",
      `# Mixed stacks detected (${stacks.join(", ")}). Each inferred step is scoped to its`,
      "# own paths. Add a cross-cutting contract/integration check here so a change",
      "# spanning both stacks runs it: leave `whenChanged` off to run on any change,",
      "# and keep slow ones out of a routine run with a named profile.",
      "# [[check.steps]]",
      '# name = "cross-stack-contract"',
      '# command = "..."',
      '# profiles = ["integration"]',
      "",
    ].join("\n");
  }

  return `${head}\n\n${formatPlanToml(plan)}${tail}`;
}

/**
 * Read back a proposal file written by init, so a later UI or command can show
 * the same content. Null when the file is absent.
 */
export function readCheckPlanProposalFile(root: string): string | null {
  const path = join(root, CHECK_PLAN_PROPOSAL_FILE);
  if (!existsSync(path)) return null;
  try {
    return readFileSync(path, "utf8");
  } catch {
    return null;
  }
}
