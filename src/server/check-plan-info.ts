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
import { resolveCheckPlan, parseCheckPlanConfig } from "../core/check-plan.js";
import { detectRepoMarkers } from "../core/check-runner.js";
import { parseFlatToml } from "../core/config.js";
import { preferBunForDevTasks } from "../core/runtime.js";
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
