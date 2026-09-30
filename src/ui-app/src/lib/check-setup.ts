/**
 * #0592 — the actionable "no checks configured" helpers: a one-click task
 * filing for "set up check.steps in repoos.toml" and the copy-paste CLI hint.
 *
 * The task goes through the NORMAL creation path (`POST /api/tasks`), so the
 * PM/agent pipeline and the board pick it up like any other task — never a
 * hand-written work/ file.
 */
import { api } from "../api";
import type { Task } from "../types";

/** The pre-filled title for the check-setup task. */
export const CHECK_SETUP_TASK_TITLE = "Set up check.steps in repoos.toml";

/** The body the one-click task gets: instructions for the assigned agent. */
export function checkSetupTaskBody(): string {
  return [
    "This repo has no `[[check.steps]]` check plan in `repoos.toml`, so `repoos check` currently",
    'skips the gate with a **"No check plan configured"** notice — nothing is verified.',
    "That's fine while there is no code to build or test; set checks up once the repo is",
    "scaffolded enough (ideally right after the first scaffolding task lands).",
    "",
    "For the assigned agent:",
    "",
    "1. Run `repoos check --print-plan` — it prints a starting `[[check.steps]]` TOML resolved",
    "   from what is already in the repo (works once a `package.json`, `go.mod`, `Cargo.toml`",
    "   or `gradlew` exists).",
    "2. Review the proposed steps and adjust them to the stack — format/lint, build, tests,",
    "   smoke, whichever genuinely apply.",
    "3. Add them under `[[check.steps]]` in `repoos.toml` (and any `[[check.themeScopes]]` /",
    "   `[[check.contrastPairs]]` the guards need).",
    "4. Run `repoos check` until it passes — the gate must not report green on an empty plan,",
    "   but a configured plan has nothing to pass yet if the steps skip cleanly.",
    "",
    "Reference: user-docs/check.md.",
  ].join("\n");
}

/** The single-line hint behind the "copy" affordance in the reminder UI. */
export function checkSetupCliHint(): string {
  return (
    "Add checks: `repoos check --print-plan` prints a starting [[check.steps]] TOML " +
    "(works once a package.json, go.mod, Cargo.toml or gradlew exists) — commit the steps " +
    "to repoos.toml. See user-docs/check.md."
  );
}

/** File the check-setup task through the normal task-creation endpoint. */
export async function fileCheckSetupTask(): Promise<Task> {
  return api<Task>("/api/tasks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: CHECK_SETUP_TASK_TITLE,
      type: "chore",
      body: checkSetupTaskBody(),
    }),
  });
}

/**
 * #0592: true ONLY for a genuinely empty, error-free plan — the state where
 * `repoos check` SKIPS the gate and the amber reminder applies. A plan that
 * resolves to zero steps WITH errors (unusable declared rows, newer schema)
 * fails the gate red and must never read as "no checks configured".
 */
export function isGenuinelyEmptyPlan(plan: {
  source: string;
  steps: { length: number };
  errors?: unknown[];
}): boolean {
  return plan.source === "empty" && plan.steps.length === 0 && (plan.errors?.length ?? 0) === 0;
}
