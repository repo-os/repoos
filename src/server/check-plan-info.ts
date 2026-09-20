/**
 * Resolved check-plan metadata for the integration pipeline's tooltips (#0458).
 *
 * The pinned integration bar used to describe its stages with text hardcoded to
 * RepoOS's own JS flow ("tsc + asset bundling", "the complete test suite"). That
 * is wrong for any other repo: the actual merge gate is whatever the repo
 * declares under `[[check.steps]]` in its `repoos.toml` (#0446). This module
 * resolves that plan (declared, legacy or inferred) into a small serialisable
 * shape the browser can render — one entry per step with its label, command,
 * timeout and dependencies — so the tooltip is derived from the config rather
 * than guessed.
 */
import {
  DEFAULT_PROFILE,
  FULL_PROFILE,
  isCrossCutting,
  listProfiles,
  parseCheckPlanConfig,
  resolveCheckPlan,
  selectSteps,
  type PlanSource,
} from "../core/check-plan.js";
import { detectRepoMarkers, installHint, missingBinaries } from "../core/check-runner.js";
import { parseFlatToml } from "../core/config.js";
import { preferBunForDevTasks } from "../core/runtime.js";
import { readCheckRun, type CheckRunRecord } from "../core/check-results-store.js";
import { changedPathsSince } from "../commands/check.js";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { CheckConfig, RepoOSConfig } from "../core/types.js";

/** One resolved `[[check.steps]]` entry, as the UI tooltip needs it. */
export interface PipelineCheckStep {
  name: string;
  /** Built-in guard kind, when the step is one (absent for a raw command). */
  kind?: string;
  /** Shell command, when the step runs one. */
  command?: string;
  /** Repo-relative working directory; absent means the repo root. */
  cwd?: string;
  timeoutMs: number;
  /** False → advisory: a failure does not fail the gate. */
  required: boolean;
  /** Names of steps this one runs after. */
  dependsOn: string[];
  profiles: string[];
}

/** The repo's resolved check plan, ready to render in a pipeline tooltip. */
export interface PipelineCheckPlan {
  source: "declared" | "legacy" | "inferred" | "empty";
  defaultProfile: string;
  steps: PipelineCheckStep[];
}

/**
 * The `[check]` config to resolve from. Prefers the on-disk `repoos.toml` so a
 * plan edited during a long check run is reflected on the next snapshot, rather
 * than the server's boot-time copy. Legacy keys the resolver needs (uiSmoke,
 * uiStylesheet, …) are still merged in from the boot config; a read or parse
 * failure falls back to it entirely.
 */
function currentCheckConfig(config: RepoOSConfig): CheckConfig | undefined {
  try {
    const tomlPath = join(config.root, "repoos.toml");
    if (!existsSync(tomlPath)) return config.check;
    const parsed = parseFlatToml(readFileSync(tomlPath, "utf8"));
    const plan = parseCheckPlanConfig(parsed);
    return plan ? { ...config.check, ...plan } : config.check;
  } catch {
    return config.check;
  }
}

/**
 * Resolve the repo's check plan for display. Never throws: a plan that cannot
 * be read resolves to an empty one, and the tooltip falls back to a generic
 * description rather than blanking out.
 */
export function resolvePipelineCheckPlan(config: RepoOSConfig): PipelineCheckPlan {
  try {
    const plan = resolveCheckPlan({
      check: currentCheckConfig(config),
      markers: detectRepoMarkers(config.root),
      bunRunner: preferBunForDevTasks(config.root),
    });
    return {
      source: plan.source,
      defaultProfile: plan.defaultProfile,
      steps: plan.steps.map((s) => ({
        name: s.name,
        kind: s.kind,
        command: s.command,
        cwd: s.cwd,
        timeoutMs: s.timeoutMs,
        required: s.required,
        dependsOn: [...s.dependsOn],
        profiles: [...s.profiles],
      })),
    };
  } catch {
    return { source: "empty", defaultProfile: "default", steps: [] };
  }
}

/** One step of the Checks surface, with everything needed to explain it. */
export interface CheckPlanStepView {
  name: string;
  kind?: string;
  command?: string;
  /** Repo-relative working directory; absent means the repo root. */
  cwd?: string;
  timeoutMs: number;
  required: boolean;
  profiles: string[];
  whenChanged: string[];
  dependsOn: string[];
  requires: string[];
  /** No `whenChanged` → runs on any change (a contract/integration step). */
  crossCutting: boolean;
  /** Whether the selected profile includes this step. */
  selected: boolean;
  /** Set when the step will not run this invocation, with the reason why. */
  skip?: { reason: string; detail: string };
  /**
   * Declared prerequisites that are not on PATH, each with install advice.
   * A non-empty list on a required, selected step is the UI's "this will not
   * pass here" signal — never a green check.
   */
  missing: { tool: string; hint: string }[];
}

/** The resolved check plan as the Checks surface renders it. */
export interface CheckPlanView {
  source: PlanSource;
  defaultProfile: string;
  /** The profile this view was resolved for. */
  profile: string;
  /** Every profile the UI can switch to: the default, named ones, and `full`. */
  profiles: string[];
  /** Git ref when the view is a changed-path pass, and the paths it matched. */
  changedRef?: string;
  changedPaths?: string[];
  warnings: string[];
  errors: string[];
  steps: CheckPlanStepView[];
  /** The most recent completed run for this repo, if one was recorded. */
  lastRun: CheckRunRecord | null;
}

export interface CheckPlanViewOptions {
  profile?: string;
  /** Git ref for changed-path mode. Unresolvable refs degrade with a warning. */
  changedRef?: string;
}

/**
 * Resolve the full check plan for the Checks surface (#0447): the plan, its
 * profiles, which steps the selected profile runs and why others don't, the
 * declared prerequisites that are missing, and the last recorded run.
 *
 * It reuses the engine's own `resolveCheckPlan` / `selectSteps` /
 * `missingBinaries` — the UI never re-implements execution or selection. Never
 * throws: an unreadable plan degrades to an empty view rather than blanking the
 * page.
 */
export function resolveCheckPlanView(
  config: RepoOSConfig,
  opts: CheckPlanViewOptions = {},
): CheckPlanView {
  const check = currentCheckConfig(config);
  const plan = resolveCheckPlan({
    check,
    markers: detectRepoMarkers(config.root),
    bunRunner: preferBunForDevTasks(config.root),
  });
  const profile = opts.profile?.trim() || plan.defaultProfile || DEFAULT_PROFILE;

  const warnings = [...plan.warnings];
  let changedPaths: string[] | undefined;
  if (opts.changedRef) {
    const paths = changedPathsSince(config.root, opts.changedRef);
    if (paths === null) {
      warnings.push(
        `changed-path mode: "${opts.changedRef}" is not a commit, branch or tag this repo can resolve — showing the full plan`,
      );
    } else {
      changedPaths = paths;
    }
  }

  const selected = selectSteps(plan, { profile, changedPaths });
  const profiles = [
    ...new Set([plan.defaultProfile || DEFAULT_PROFILE, ...listProfiles(plan), FULL_PROFILE]),
  ];

  return {
    source: plan.source,
    defaultProfile: plan.defaultProfile,
    profile,
    profiles,
    changedRef: changedPaths ? opts.changedRef : undefined,
    changedPaths,
    warnings,
    errors: [...plan.errors],
    steps: selected.map(({ step, skip }) => ({
      name: step.name,
      kind: step.kind,
      command: step.command,
      cwd: step.cwd,
      timeoutMs: step.timeoutMs,
      required: step.required,
      profiles: [...step.profiles],
      whenChanged: [...step.whenChanged],
      dependsOn: [...step.dependsOn],
      requires: [...step.requires],
      crossCutting: isCrossCutting(step),
      selected: !skip,
      skip: skip ? { reason: skip.reason, detail: skip.detail } : undefined,
      missing: missingBinaries(step.requires).map((tool) => ({ tool, hint: installHint(tool) })),
    })),
    lastRun: readCheckRun(config.root, config.cacheDir),
  };
}
