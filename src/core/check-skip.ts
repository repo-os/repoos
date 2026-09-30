/**
 * The third check outcome, `skipped` (#0592).
 *
 * A repo whose resolved plan has zero steps AND zero errors — no declared
 * `[[check.steps]]`, no legacy `[check]` keys, nothing inferable (an early
 * planning-phase repo: stories/tasks/docs only) — has nothing to verify, and
 * today that hard-fails every handoff to review. `repoos check` now exits 0
 * for that case and prints an actionable reminder instead; any plan with
 * `errors`, or a `--changed` ref git cannot resolve, still fails exactly as
 * before.
 *
 * Shared so the CLI, the server and the UI all agree on the exact notice text:
 * the UI detects a skipped run in a streamed check's output by this marker
 * (a skipped gate exits 0, so the exit code alone reads as green).
 */

/** The exact notice `repoos check` prints for a gate skipped on an empty plan. */
export const NO_CHECK_PLAN_NOTICE = "No check plan configured — nothing to verify.";

/** The concrete copy-paste hint the reminder offers the user (CLI and UI). */
export const NO_CHECK_PLAN_CLI_HINT =
  "run `repoos check --print-plan` for a starting [[check.steps]] TOML " +
  "(works once a package.json, go.mod, Cargo.toml or gradlew exists), " +
  "then commit the steps to repoos.toml — user-docs/check.md explains the gate";

/** The reminder lines `repoos check` prints under the notice — short, actionable. */
export function noCheckPlanReminderLines(): string[] {
  return [
    "Nothing was verified because this repo has no checks configured. That's fine while " +
      "there is no code to build or test — set checks up once the repo is scaffolded enough.",
    `When it is: ${NO_CHECK_PLAN_CLI_HINT}.`,
  ];
}

/**
 * Detect a skipped (no-plan) run in a check's captured output. Streamed output
 * is colour-stripped (`stripAnsi`) before it reaches the UI, so the plain
 * marker matches; a run without output cannot be identified and reads green,
 * which is why the CLI also records the durable `skipped` history row itself.
 */
export function checkRunSkipped(output: string | undefined | null): boolean {
  return Boolean(output && output.includes(NO_CHECK_PLAN_NOTICE.trimEnd()));
}
