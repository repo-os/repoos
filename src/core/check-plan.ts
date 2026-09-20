/**
 * The declarative check plan (#0446) — what `repoos check` runs, resolved
 * from `repoos.toml` instead of assumed from RepoOS's own stack.
 *
 * Before this module the gate was hardcoded: it ran `bun run build`
 * unconditionally, then a fixed sequence of JS/RepoOS-shaped guards. That is
 * meaningless for a Go, Gradle/Android, Rust or mixed repo — a Go-only repo
 * was told its `bun run build` failed, and a repo with no JS at all was told
 * everything passed because every step "didn't apply".
 *
 * A plan is a versioned, committed list of steps:
 *
 * ```toml
 * [check]
 * version = 1
 *
 * [[check.steps]]
 * name = "go-build"
 * command = "go build ./..."
 * requires = ["go"]
 * ```
 *
 * plus built-in `kind`s for the guards that are genuinely stack-neutral
 * because they inspect the repo and skip with a stated reason when they do
 * not apply (`build`, `tests`, `format`, `lint`, `task-assets`, …).
 *
 * Resolution order, most explicit first:
 *
 * 1. `[[check.steps]]` declared in `repoos.toml` — runs exactly that.
 * 2. legacy `[check]` keys (`uiSmoke`, `uiStylesheet`, …) with no steps — the
 *    pre-#0446 behaviour, synthesised as a plan so it still runs, plus an
 *    actionable migration warning.
 * 3. inferred from repo markers (`go.mod`, `Cargo.toml`, `gradlew`,
 *    `package.json` scripts) — meaningful, but warned about as uncommitted.
 * 4. nothing — an EMPTY plan. That is never green: the gate fails with a
 *    "no check plan" diagnostic rather than reporting a vacuous pass.
 *
 * This module is pure (no fs, no subprocess) so plan resolution, profile
 * selection and changed-path selection are all unit-testable; the execution
 * engine lives in `check-runner.ts`.
 */
import type { CheckConfig, CheckStepConfig } from "./types.js";

/** Current `[check]` schema version. Bumped only with a migration. */
export const CHECK_PLAN_VERSION = 1;

/** Profile used when neither `defaultProfile` nor `--profile` is set. */
export const DEFAULT_PROFILE = "default";

/**
 * The profile that includes every declared step, including ones deliberately
 * held back from a routine run (`profiles = ["full"]`). Close-out runs this —
 * it is the final merge gate, not a fast pre-review pass.
 */
export const FULL_PROFILE = "full";

/** Default per-step timeout (10 min) — long enough for a real build. */
export const DEFAULT_STEP_TIMEOUT_MS = 600_000;

/**
 * Arguments the merge/close-out gate passes to `repoos check` (#0446): the
 * FULL profile, so a step a project deliberately holds back from a routine
 * run (`profiles = ["full"]`) still runs before anything merges. Close-out
 * never passes `--changed`: that is a fast pre-review mode, and the merge gate
 * is about the merged candidate, not a branch diff.
 */
export const CLOSEOUT_CHECK_ARGS: readonly string[] = ["--profile", FULL_PROFILE];

/**
 * Built-in step kinds. Each is stack-neutral: it inspects the repo and skips
 * with a stated reason when it does not apply.
 */
export const BUILTIN_CHECK_KINDS = [
  "staleness",
  "lockfile-sync",
  "zero-runtime-deps",
  "format",
  "lint",
  "build",
  "tests",
  "ui-smoke",
  "css-layers",
  "theme-contrast",
  "bare-require",
  "task-assets",
] as const;

export type BuiltinCheckKind = (typeof BUILTIN_CHECK_KINDS)[number];

export function isBuiltinCheckKind(v: string): v is BuiltinCheckKind {
  return (BUILTIN_CHECK_KINDS as readonly string[]).includes(v);
}

/** A fully resolved step: defaults applied, ready to select and run. */
export interface CheckStep {
  name: string;
  /** Built-in guard to run; absent for a raw `command` step. */
  kind?: BuiltinCheckKind;
  /** Shell command to run; absent for a `kind` step. */
  command?: string;
  /** Repo-relative working directory; undefined means the repo root. */
  cwd?: string;
  timeoutMs: number;
  /** False → advisory: a failure is reported but does not fail the gate. */
  required: boolean;
  /** Empty means "every profile". */
  profiles: string[];
  /** Empty means "always run", including in changed-path mode. */
  whenChanged: string[];
  requires: string[];
  dependsOn: string[];
}

export type PlanSource = "declared" | "legacy" | "inferred" | "empty";

export interface CheckPlan {
  version: number;
  defaultProfile: string;
  steps: CheckStep[];
  /** Where the plan came from — printed by the CLI so the gate is legible. */
  source: PlanSource;
  /** Advisory notes (inference, migration, dropped rows). Never fatal. */
  warnings: string[];
  /** Plan-level problems that should fail the gate rather than pass it. */
  errors: string[];
}

/** Repo markers the inference path reads; see `detectRepoMarkers`. */
export interface RepoMarkers {
  hasGoMod: boolean;
  hasCargoToml: boolean;
  hasGradlew: boolean;
  hasGradleBuild: boolean;
  hasPackageJson: boolean;
  hasBunLock: boolean;
  /** `package.json` `scripts`, when there is a package.json. */
  scripts: Record<string, string>;
}

export const EMPTY_MARKERS: RepoMarkers = {
  hasGoMod: false,
  hasCargoToml: false,
  hasGradlew: false,
  hasGradleBuild: false,
  hasPackageJson: false,
  hasBunLock: false,
  scripts: {},
};

// ── Config parsing ──────────────────────────────────────────────────────

function strList(value: unknown): string[] | undefined {
  const raw = Array.isArray(value) ? value : typeof value === "string" ? [value] : [];
  const list = raw
    .filter((v): v is string => typeof v === "string" && v.trim() !== "")
    .map((v) => v.trim());
  return list.length ? list : undefined;
}

function timeoutOf(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return Math.floor(value);
  if (typeof value === "string" && /^\d+$/.test(value.trim())) return Number(value.trim());
  return undefined;
}

/** Parse one `[[check.steps]]` row. Returns null when the row is unusable. */
function parseStepRow(raw: unknown): CheckStepConfig | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const name = typeof r.name === "string" ? r.name.trim() : "";
  const kind = typeof r.kind === "string" ? r.kind.trim() : "";
  const command = typeof r.command === "string" ? r.command.trim() : "";
  if (!name && !kind && !command) return null;

  const step: CheckStepConfig = {};
  if (name) step.name = name;
  if (kind) step.kind = kind;
  if (command) step.command = command;
  const cwd = typeof r.cwd === "string" ? r.cwd.trim() : "";
  if (cwd) step.cwd = cwd;
  const timeoutMs = timeoutOf(r.timeoutMs ?? r.timeout_ms);
  if (timeoutMs !== undefined) step.timeoutMs = timeoutMs;
  if (typeof r.required === "boolean") step.required = r.required;
  const profiles = strList(r.profiles);
  if (profiles) step.profiles = profiles;
  const whenChanged = strList(r.whenChanged ?? r.when_changed);
  if (whenChanged) step.whenChanged = whenChanged;
  const requires = strList(r.requires);
  if (requires) step.requires = requires;
  const dependsOn = strList(r.dependsOn ?? r.depends_on);
  if (dependsOn) step.dependsOn = dependsOn;
  return step;
}

/**
 * Read `[check] version`, `[check] defaultProfile` and `[[check.steps]]` from
 * the flattened TOML map produced by `parseFlatToml` (config.ts). Both the
 * `[check]` and legacy `[checks]` spellings are accepted, matching the other
 * `[check]` keys.
 */
export function parseCheckPlanConfig(
  parsed: Record<string, unknown>,
): Pick<CheckConfig, "version" | "defaultProfile" | "steps"> | undefined {
  const out: Pick<CheckConfig, "version" | "defaultProfile" | "steps"> = {};

  const version = parsed["check.version"] ?? parsed["checks.version"];
  if (typeof version === "number" && Number.isInteger(version) && version >= 1) {
    out.version = version;
  }

  const profile = parsed["check.defaultProfile"] ?? parsed["checks.defaultProfile"];
  if (typeof profile === "string" && profile.trim()) out.defaultProfile = profile.trim();

  const rows = parsed["check.steps"] ?? parsed["checks.steps"];
  if (Array.isArray(rows)) {
    const steps: CheckStepConfig[] = [];
    for (const raw of rows) {
      const step = parseStepRow(raw);
      if (step) steps.push(step);
    }
    if (steps.length) out.steps = steps;
  }

  return Object.keys(out).length > 0 ? out : undefined;
}

// ── Step resolution ─────────────────────────────────────────────────────

/** A step name the close-out pipeline can parse back out of the results block. */
const NAME_RE = /^[a-z][a-z0-9_.:-]*$/i;

/**
 * Resolve a declared row into a runnable step, or null when it can never run
 * (no `kind` and no `command`). Problems are reported as `warnings` so one
 * typo'd row doesn't take down the whole gate.
 */
function resolveStep(row: CheckStepConfig, index: number, warnings: string[]): CheckStep | null {
  const kind = row.kind && isBuiltinCheckKind(row.kind) ? row.kind : undefined;
  if (row.kind && !kind) {
    warnings.push(
      `[check] steps[${index + 1}]: unknown kind "${row.kind}" — expected one of: ${BUILTIN_CHECK_KINDS.join(", ")}`,
    );
  }
  const command = row.command?.trim() || undefined;
  if (!kind && !command) {
    warnings.push(
      `[check] steps[${index + 1}]${row.name ? ` ("${row.name}")` : ""}: needs either \`kind\` or \`command\` — row dropped`,
    );
    return null;
  }

  const fallbackName = kind ?? `step-${index + 1}`;
  const rawName = row.name?.trim() || fallbackName;
  if (!NAME_RE.test(rawName)) {
    warnings.push(
      `[check] steps[${index + 1}]: name "${rawName}" is not a bare identifier — the results block and \`dependsOn\` match on it, so use letters, digits, \`-\`, \`_\`, \`.\` or \`:\``,
    );
  }

  return {
    name: rawName,
    kind: command ? undefined : kind,
    command,
    cwd: row.cwd,
    timeoutMs: row.timeoutMs ?? DEFAULT_STEP_TIMEOUT_MS,
    required: row.required !== false,
    profiles: row.profiles ?? [],
    whenChanged: row.whenChanged ?? [],
    requires: row.requires ?? [],
    dependsOn: row.dependsOn ?? [],
  };
}

/**
 * Drop duplicate step names — the FIRST row wins and each later duplicate is
 * discarded with a warning. `dependsOn` matches by name, so two steps sharing
 * one would make the dependency ambiguous; keeping the first keeps the plan
 * deterministic under reordering of the duplicate pair only.
 */
function dedupeNames(steps: CheckStep[], warnings: string[]): CheckStep[] {
  const seen = new Set<string>();
  const out: CheckStep[] = [];
  for (const s of steps) {
    if (seen.has(s.name)) {
      warnings.push(`[check] steps: duplicate name "${s.name}" — the later row is ignored`);
      continue;
    }
    seen.add(s.name);
    out.push(s);
  }
  return out;
}

// ── Legacy (pre-#0446) plan ─────────────────────────────────────────────

/**
 * The exact step set and ordering `repoos check` ran before #0446, expressed
 * as a plan: build staleness, lockfile sync, zero-runtime-deps, fmt/lint,
 * build, the two stylesheet guards, bare-require, task assets, tests and the
 * UI smoke step — with fmt/lint gating build/tests/smoke via `dependsOn`.
 *
 * A repo still on the legacy keys keeps its behaviour (compatibility) and is
 * told how to migrate (the warning).
 */
export function legacyPlan(bunRunner: boolean): CheckStep[] {
  const runner = bunRunner ? "bun" : "npm";
  const fmt: CheckStep = {
    name: "check-fmt:check",
    kind: "format",
    timeoutMs: DEFAULT_STEP_TIMEOUT_MS,
    required: true,
    profiles: [],
    whenChanged: [],
    requires: [runner],
    dependsOn: [],
  };
  const lint: CheckStep = { ...fmt, name: "check-lint", kind: "lint" };
  const gate = ["check-fmt:check", "check-lint"];
  const step = (
    name: string,
    kind: BuiltinCheckKind,
    extra: Partial<CheckStep> = {},
  ): CheckStep => ({
    name,
    kind,
    timeoutMs: DEFAULT_STEP_TIMEOUT_MS,
    required: true,
    profiles: [],
    whenChanged: [],
    requires: [],
    dependsOn: [],
    ...extra,
  });

  return [
    step("staleness", "staleness"),
    step("lockfile-sync", "lockfile-sync", { requires: ["bun"] }),
    step("zero-runtime-deps", "zero-runtime-deps"),
    fmt,
    lint,
    step("build", "build", { requires: [runner], dependsOn: gate }),
    step("css-layers", "css-layers"),
    step("theme-contrast", "theme-contrast"),
    step("bare-require", "bare-require"),
    step("task-assets", "task-assets"),
    step("tests", "tests", { requires: [runner], dependsOn: gate }),
    step("ui-smoke", "ui-smoke", { dependsOn: gate }),
  ];
}

/** True when any legacy `[check]` key is set — i.e. the repo predates plans. */
export function hasLegacyCheckConfig(check: CheckConfig | undefined): boolean {
  if (!check) return false;
  return Boolean(
    check.uiSmoke ||
    check.uiStylesheet ||
    check.backdropToken ||
    check.themeScopes?.length ||
    check.contrastPairs?.length ||
    check.gradientTokens?.length ||
    check.bareRequireDirs?.length ||
    check.bareRequireExcludes?.length,
  );
}

// ── Inference ───────────────────────────────────────────────────────────

/**
 * Conventional path globs each inferred stack watches, so changed-path mode
 * (`repoos check --changed <ref>`) narrows to the stack that actually moved
 * instead of running every stack in a mixed repo (#0447). A change that spans
 * two stacks matches both sets, so both run — the fast mode never hides a
 * cross-stack change. A user-declared step with no `whenChanged` (a contract or
 * integration check) always runs, which is how a project makes a cross-cutting
 * step explicit.
 */
export const STACK_CHANGED: Record<string, string[]> = {
  go: ["**/*.go", "go.mod", "go.sum"],
  rust: ["**/*.rs", "Cargo.toml", "Cargo.lock"],
  gradle: [
    "**/*.kt",
    "**/*.java",
    "**/*.gradle",
    "**/*.gradle.kts",
    "gradle/**",
    "gradlew",
    "gradlew.bat",
  ],
  js: [
    "**/*.js",
    "**/*.mjs",
    "**/*.cjs",
    "**/*.ts",
    "**/*.mts",
    "**/*.cts",
    "**/*.tsx",
    "**/*.jsx",
    "**/*.vue",
    "package.json",
    "tsconfig.json",
    "bun.lock",
    "bun.lockb",
    "package-lock.json",
    "yarn.lock",
    "pnpm-lock.yaml",
  ],
};

/**
 * The stacks a marker set recognises, in a stable order. Used to warn about a
 * mixed repo (where a cross-cutting contract step is worth declaring) and by
 * the Checks surface to explain a step's changed-path scope.
 */
export function detectedStacks(markers: RepoMarkers): string[] {
  const out: string[] = [];
  if (markers.hasGoMod) out.push("go");
  if (markers.hasCargoToml) out.push("rust");
  if (markers.hasGradlew || markers.hasGradleBuild) out.push("gradle");
  if (markers.hasPackageJson) out.push("js");
  return out;
}

/**
 * A plan derived from repo markers — used only when nothing is declared. It is
 * deliberately conservative: real, conventional commands for the stack it can
 * see, and nothing (never a guessed pass) for what it can't.
 */
export function inferPlan(markers: RepoMarkers): CheckStep[] {
  const steps: CheckStep[] = [];
  // A mixed repo (say Go backend + JS frontend) would otherwise produce two
  // steps called "build"; `dependsOn` and the results block match by name, so
  // the second one is tagged with its stack instead of being dropped.
  const used = new Set<string>();
  const unique = (name: string, tag: string): string => {
    if (!used.has(name)) {
      used.add(name);
      return name;
    }
    const alt = `${name}-${tag}`;
    used.add(alt);
    return alt;
  };
  const push = (
    name: string,
    command: string,
    requires: string[],
    extra: Partial<CheckStep> = {},
  ): void => {
    steps.push({
      name,
      command,
      timeoutMs: DEFAULT_STEP_TIMEOUT_MS,
      required: true,
      profiles: [],
      whenChanged: [],
      requires,
      dependsOn: [],
      ...extra,
    });
  };
  const pushKind = (name: string, kind: BuiltinCheckKind, extra: Partial<CheckStep> = {}): void => {
    steps.push({
      name,
      kind,
      timeoutMs: DEFAULT_STEP_TIMEOUT_MS,
      required: true,
      profiles: [],
      whenChanged: [],
      requires: [],
      dependsOn: [],
      ...extra,
    });
  };

  const goChanged = STACK_CHANGED.go;
  const rustChanged = STACK_CHANGED.rust;
  const gradleChanged = STACK_CHANGED.gradle;
  const jsChanged = STACK_CHANGED.js;

  // Go: `go build ./...` compiles every package; `go test ./...` runs them.
  if (markers.hasGoMod) {
    push(unique("build", "go"), "go build ./...", ["go"], { whenChanged: goChanged });
    push(unique("tests", "go"), "go test ./...", ["go"], { whenChanged: goChanged });
  }

  // Rust: `cargo build` + `cargo test`, plus the formatter's own check mode.
  if (markers.hasCargoToml) {
    push(unique("build", "rust"), "cargo build", ["cargo"], { whenChanged: rustChanged });
    push(unique("check-fmt:check", "rust"), "cargo fmt --check", ["cargo"], {
      whenChanged: rustChanged,
    });
    push(unique("tests", "rust"), "cargo test", ["cargo"], { whenChanged: rustChanged });
  }

  // Android/Gradle: always prefer the committed wrapper so the build uses the
  // project's own Gradle version rather than whatever `gradle` is on PATH.
  if (markers.hasGradlew) {
    push(unique("build", "gradle"), "./gradlew assemble", [], { whenChanged: gradleChanged });
    push(unique("tests", "gradle"), "./gradlew test", [], { whenChanged: gradleChanged });
  } else if (markers.hasGradleBuild) {
    push(unique("build", "gradle"), "gradle build", ["gradle"], { whenChanged: gradleChanged });
    push(unique("tests", "gradle"), "gradle test", ["gradle"], { whenChanged: gradleChanged });
  }

  // JS/TS: the same zero-config script names `repoos check` always honoured.
  if (markers.hasPackageJson) {
    const runner = markers.hasBunLock ? "bun" : "npm";
    const has = (s: string): boolean => Boolean(markers.scripts[s]);
    const gate: string[] = [];
    if (has("fmt:check")) {
      const name = unique("check-fmt:check", "js");
      pushKind(name, "format", { requires: [runner], whenChanged: jsChanged });
      gate.push(name);
    }
    if (has("lint")) {
      const name = unique("check-lint", "js");
      pushKind(name, "lint", { requires: [runner], whenChanged: jsChanged });
      gate.push(name);
    }
    if (has("build")) {
      pushKind(unique("build", "js"), "build", {
        requires: [runner],
        dependsOn: [...gate],
        whenChanged: jsChanged,
      });
    }
    if (has("test")) {
      pushKind(unique("tests", "js"), "tests", {
        requires: [runner],
        dependsOn: [...gate],
        whenChanged: jsChanged,
      });
    }
    if (has("smoke")) {
      pushKind(unique("ui-smoke", "js"), "ui-smoke", {
        dependsOn: [...gate],
        whenChanged: jsChanged,
      });
    }
  }

  if (steps.length === 0) return steps;

  // The two guards that are RepoOS-generic rather than stack-specific, added
  // only once some stack was actually recognised — an unrecognisable repo must
  // still resolve to an EMPTY plan, never to a two-step plan that proves
  // nothing about the code. Both degrade to an explicit skip when they don't
  // apply (`staleness` without a build marker, `task-assets` outside git).
  steps.unshift({
    name: "staleness",
    kind: "staleness",
    timeoutMs: DEFAULT_STEP_TIMEOUT_MS,
    required: true,
    profiles: [],
    whenChanged: [],
    requires: [],
    dependsOn: [],
  });
  if (markers.hasPackageJson && markers.hasBunLock) {
    steps.splice(1, 0, {
      name: "lockfile-sync",
      kind: "lockfile-sync",
      timeoutMs: DEFAULT_STEP_TIMEOUT_MS,
      required: true,
      profiles: [],
      whenChanged: [],
      requires: ["bun"],
      dependsOn: [],
    });
  }
  steps.push({
    name: "task-assets",
    kind: "task-assets",
    timeoutMs: DEFAULT_STEP_TIMEOUT_MS,
    required: true,
    profiles: [],
    whenChanged: [],
    requires: [],
    dependsOn: [],
  });

  return steps;
}

// ── Public resolution ───────────────────────────────────────────────────

export interface ResolvePlanInput {
  check?: CheckConfig;
  /** Markers for the inference path; omit to skip inference (empty plan). */
  markers?: RepoMarkers;
  /** Whether `bun` is the preferred JS runner (a bun.lock exists and bun resolves). */
  bunRunner?: boolean;
}

const LEGACY_MIGRATION =
  "This repo still configures `repoos check` with the legacy per-step [check] keys " +
  "(uiSmoke/uiStylesheet/themeScopes/…). They still work, but the gate now runs a " +
  "declared plan: run `repoos check --print-plan` to emit the equivalent " +
  "[[check.steps]] and commit it to repoos.toml (see user-docs/check.md).";

/**
 * Resolve the plan for a repo. Never throws and never invents coverage: an
 * unrecognisable repo yields an EMPTY plan, which the gate must fail on
 * rather than report green.
 */
export function resolveCheckPlan(input: ResolvePlanInput): CheckPlan {
  const { check, markers, bunRunner = false } = input;
  const version = check?.version ?? CHECK_PLAN_VERSION;
  const defaultProfile = check?.defaultProfile?.trim() || DEFAULT_PROFILE;
  const warnings: string[] = [];
  const errors: string[] = [];

  if (check?.version !== undefined && check.version > CHECK_PLAN_VERSION) {
    errors.push(
      `[check] version ${check.version} is newer than this repoos build understands ` +
        `(v${CHECK_PLAN_VERSION}) — upgrade repoos, or lower [check] version, before trusting this gate`,
    );
  }

  const declared = (check?.steps ?? [])
    .map((row, i) => resolveStep(row, i, warnings))
    .filter((s): s is CheckStep => s !== null);

  if (declared.length > 0) {
    const steps = dedupeNames(declared, warnings);
    return { version, defaultProfile, steps, source: "declared", warnings, errors };
  }

  if (check?.steps?.length) {
    // Rows existed but every one was unusable — do not silently fall back to
    // a legacy/inferred plan that the repo never asked for.
    errors.push(
      "[check] declares [[check.steps]] but no row is usable (each needs a `kind` or a `command`)",
    );
    return { version, defaultProfile, steps: [], source: "empty", warnings, errors };
  }

  if (hasLegacyCheckConfig(check)) {
    warnings.push(LEGACY_MIGRATION);
    return {
      version,
      defaultProfile,
      steps: legacyPlan(bunRunner),
      source: "legacy",
      warnings,
      errors,
    };
  }

  if (markers) {
    const steps = inferPlan(markers);
    if (steps.length > 0) {
      warnings.push(
        "No [[check.steps]] in repoos.toml — this plan was inferred from the repo layout. " +
          "Commit it (`repoos check --print-plan`) so the gate is explicit and stable.",
      );
      const stacks = detectedStacks(markers);
      if (stacks.length > 1) {
        warnings.push(
          `Mixed stacks detected (${stacks.join(", ")}). Each inferred stack step is scoped to ` +
            "its own paths, so in changed-path mode a change spanning both runs both — but a " +
            "cross-stack contract test needs an explicit step of its own. Declare one with no " +
            "`whenChanged` (runs on any change) or globs covering both stacks, and put the slow " +
            'ones in `profiles = ["integration"]`.',
        );
      }
      return { version, defaultProfile, steps, source: "inferred", warnings, errors };
    }
  }

  return { version, defaultProfile, steps: [], source: "empty", warnings, errors };
}

// ── Selection: profiles, changed paths, dependencies ────────────────────

export type SkipReason = "profile" | "changed" | "blocked" | "optional";

export interface SelectedStep {
  step: CheckStep;
  /** Set when the step will not run this invocation, with the reason why. */
  skip?: { reason: SkipReason; detail: string };
}

export interface SelectOptions {
  profile?: string;
  /**
   * Changed-path mode: repo-relative paths that changed. `undefined` means a
   * full run (every step, regardless of `whenChanged`).
   */
  changedPaths?: string[];
}

/** Whether a step belongs to `profile`. `full` includes everything. */
export function stepInProfile(step: CheckStep, profile: string): boolean {
  if (profile === FULL_PROFILE) return true;
  if (step.profiles.length === 0) return true;
  return step.profiles.includes(profile);
}

/**
 * A step is cross-cutting when it has no `whenChanged`: it runs whatever
 * changed, so it is the natural place to hang a contract or integration check
 * that must not be skipped just because one side of the change did.
 */
export function isCrossCutting(step: CheckStep): boolean {
  return step.whenChanged.length === 0;
}

/**
 * The named profiles declared across a plan, in first-appearance order.
 * `default` and the universal `full` profile are excluded — callers add those
 * themselves, so a plan that declares only `["release"]` yields `["release"]`.
 */
export function listProfiles(plan: CheckPlan): string[] {
  const out = new Set<string>();
  for (const step of plan.steps) {
    for (const p of step.profiles) {
      if (p !== DEFAULT_PROFILE && p !== FULL_PROFILE) out.add(p);
    }
  }
  return [...out];
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Compile a tsconfig/gitignore-style path glob (`src/**`, `*.go`, `apps/web`)
 * to a regex matched against repo-relative paths. `**` spans directories, `*`
 * does not; a bare directory matches everything beneath it.
 */
export function globToRegExp(pattern: string): RegExp {
  let p = pattern.trim().replace(/\\/g, "/");
  while (p.startsWith("./")) p = p.slice(2);
  let re = "";
  for (let i = 0; i < p.length; i++) {
    const ch = p[i];
    if (ch === "*") {
      if (p[i + 1] === "*") {
        if (p[i + 2] === "/") {
          re += "(?:.*/)?";
          i += 2;
        } else {
          re += ".*";
          i += 1;
        }
      } else {
        re += "[^/]*";
      }
    } else if (ch === "?") {
      re += "[^/]";
    } else if (ch === "{") {
      const end = p.indexOf("}", i);
      if (end === -1) {
        re += "\\{";
      } else {
        re += `(?:${p
          .slice(i + 1, end)
          .split(",")
          .map(escapeRegExp)
          .join("|")})`;
        i = end;
      }
    } else {
      re += escapeRegExp(ch);
    }
  }
  return new RegExp(`^${re}(?:/.*)?$`);
}

/** Whether any of `step.whenChanged` globs matches one of `changedPaths`. */
export function stepMatchesChanged(step: CheckStep, changedPaths: string[]): boolean {
  if (step.whenChanged.length === 0) return true;
  const normalized = changedPaths.map((p) => p.replace(/\\/g, "/").replace(/^\.\//, ""));
  return step.whenChanged.some((pattern) => {
    const re = globToRegExp(pattern);
    return normalized.some((p) => re.test(p));
  });
}

/**
 * Names of `step.dependsOn` entries that already failed. A blocked step is
 * SKIPPED, not passed: the gate is already failing on the real cause, and
 * building or testing on top of it would only obscure that.
 */
export function blockingFailures(step: CheckStep, failedNames: Set<string>): string[] {
  return step.dependsOn.filter((d) => failedNames.has(d));
}

/**
 * Pick the steps this invocation runs, in declaration order, marking each
 * non-running step with why. Selection never silently drops coverage: a step
 * excluded by profile or by changed paths is reported as skipped.
 */
export function selectSteps(plan: CheckPlan, opts: SelectOptions = {}): SelectedStep[] {
  const profile = opts.profile?.trim() || plan.defaultProfile || DEFAULT_PROFILE;
  return plan.steps.map((step) => {
    if (!stepInProfile(step, profile)) {
      return {
        step,
        skip: {
          reason: "profile",
          detail: `skipped — not in profile "${profile}" (profiles: ${step.profiles.join(", ")})`,
        },
      };
    }
    if (opts.changedPaths && !stepMatchesChanged(step, opts.changedPaths)) {
      return {
        step,
        skip: {
          reason: "changed",
          detail: `skipped — no changed path matches ${step.whenChanged.join(", ")}`,
        },
      };
    }
    return { step };
  });
}

// ── Printing ────────────────────────────────────────────────────────────

function tomlString(s: string): string {
  return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function tomlList(values: string[]): string {
  return `[${values.map(tomlString).join(", ")}]`;
}

/**
 * Render a plan as the TOML that produces it — what `repoos check --print-plan`
 * prints so a legacy or inferred plan can be committed verbatim.
 *
 * Self-contained by construction: the built-in `kind`s read their vocabulary
 * from `[check]` (`uiStylesheet`, `themeScopes`, `contrastPairs`, `uiSmoke`,
 * `bareRequireDirs`), so a plan that uses them is only reproducible if those
 * keys come along. Emitting steps alone would silently drop those guards the
 * moment the output replaced the legacy keys it was generated from.
 */
export function formatPlanToml(plan: CheckPlan, check?: CheckConfig): string {
  const lines: string[] = [
    "[check]",
    `version = ${plan.version}`,
    `defaultProfile = ${tomlString(plan.defaultProfile)}`,
  ];
  // Legacy keys the built-in kinds read — copied across when the source config
  // still carries them.
  if (check?.uiStylesheet) lines.push(`uiStylesheet = ${tomlString(check.uiStylesheet)}`);
  if (check?.backdropToken) lines.push(`backdropToken = ${tomlString(check.backdropToken)}`);
  if (check?.gradientTokens?.length) {
    lines.push(`gradientTokens = ${tomlList(check.gradientTokens)}`);
  }
  if (check?.bareRequireDirs?.length) {
    lines.push(`bareRequireDirs = ${tomlList(check.bareRequireDirs)}`);
  }
  if (check?.bareRequireExcludes?.length) {
    lines.push(`bareRequireExcludes = ${tomlList(check.bareRequireExcludes)}`);
  }
  if (check?.uiSmoke) lines.push(`uiSmoke = ${tomlString(check.uiSmoke)}`);

  for (const s of plan.steps) {
    lines.push("", "[[check.steps]]", `name = ${tomlString(s.name)}`);
    if (s.kind) lines.push(`kind = ${tomlString(s.kind)}`);
    if (s.command) lines.push(`command = ${tomlString(s.command)}`);
    if (s.cwd) lines.push(`cwd = ${tomlString(s.cwd)}`);
    if (s.timeoutMs !== DEFAULT_STEP_TIMEOUT_MS) lines.push(`timeoutMs = ${s.timeoutMs}`);
    if (!s.required) lines.push("required = false");
    if (s.profiles.length) lines.push(`profiles = ${tomlList(s.profiles)}`);
    if (s.whenChanged.length) lines.push(`whenChanged = ${tomlList(s.whenChanged)}`);
    if (s.requires.length) lines.push(`requires = ${tomlList(s.requires)}`);
    if (s.dependsOn.length) lines.push(`dependsOn = ${tomlList(s.dependsOn)}`);
  }

  // Token vocabulary: arrays of tables, so they come after the steps (the
  // config reader is line-oriented and each `[[…]]` opens a new array table).
  for (const scope of check?.themeScopes ?? []) {
    lines.push("", "[[check.themeScopes]]", `selector = ${tomlString(scope.selector)}`);
    lines.push(`name = ${tomlString(scope.name)}`);
    if (scope.inherits?.length) lines.push(`inherits = ${tomlList(scope.inherits)}`);
  }
  for (const pair of check?.contrastPairs ?? []) {
    lines.push("", "[[check.contrastPairs]]", `fg = ${tomlString(pair.fg)}`);
    lines.push(`bg = ${tomlString(pair.bg)}`);
  }

  return `${lines.join("\n")}\n`;
}

/** One-line description of a step for CLI output. */
export function describeStep(step: CheckStep): string {
  if (step.command) {
    return step.cwd ? `${step.command} (in ${step.cwd})` : step.command;
  }
  return step.cwd ? `kind: ${step.kind} (in ${step.cwd})` : `kind: ${step.kind}`;
}
