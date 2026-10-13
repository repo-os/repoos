/**
 * #0769 — a `## Shots` entry for a command capture target can choose WHICH
 * images the command produces and which of them become this shot: an `env` map,
 * `args`, and a per-entry `glob`. The pieces under test are pure/CLI-level:
 * entry validation, plan building (selection threaded, near-duplicates kept
 * distinct), `runShotCommand` (env reaches the command; a glob narrows the
 * collected files), the per-task automatic cap, and the `repoos shot
 * --env/--glob` parser. No browser.
 */
import { describe, expect, it, afterEach } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildCapturePlan, parseShotPlan } from "../../core/shot-plan";
import { validateDeclaredShotTargets } from "../../core/shot-plan";
import { parseShotArgs } from "../../commands/shot";
import { collectShotFiles, runShotCommand, type CapturedShotFile } from "../../core/shot-command";
import { DEFAULT_MAX_AUTO_SHOTS, type ShotConfig, type ShotTargetConfig } from "../../core/types";

const PNG_1PX =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

function bodyWithShots(json: string): string {
  return ["## Problem", "x", "", "## Shots", "", "```json", json, "```", "", "## Activity"].join(
    "\n",
  );
}

const COMMAND_TARGETS = new Set(["Divot bar"]);

const temps: string[] = [];
function tmp(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  temps.push(dir);
  return dir;
}
afterEach(() => {
  for (const t of temps.splice(0)) rmSync(t, { recursive: true, force: true });
});

describe("parseShotPlan — command selection fields (#0769)", () => {
  it("accepts env/args/glob on a declared entry", () => {
    const { shots, errors } = parseShotPlan(
      bodyWithShots(
        '[{"target":"Divot bar","label":"World clock","env":{"DIVOT_SNAPSHOT_ONLY":"worldclock"},"args":["--only","worldclock"],"glob":"*worldclock*.png"}]',
      ),
    );
    expect(errors).toEqual([]);
    expect(shots[0]).toMatchObject({
      target: "Divot bar",
      label: "World clock",
      env: { DIVOT_SNAPSHOT_ONLY: "worldclock" },
      args: ["--only", "worldclock"],
      glob: "*worldclock*.png",
    });
  });

  it("rejects env keys that are not simple identifiers", () => {
    const { shots, errors } = parseShotPlan(
      bodyWithShots('[{"target":"Divot bar","env":{"BAD KEY":"x"}}]'),
    );
    expect(shots).toEqual([]);
    expect(errors[0]).toMatch(/not a valid environment variable name/);
  });

  it("rejects a non-string env value, a non-array args and an empty glob", () => {
    expect(parseShotPlan(bodyWithShots('[{"target":"mac","env":{"A":5}}]')).errors[0]).toMatch(
      /"env" value for "A" expects a string/,
    );
    expect(parseShotPlan(bodyWithShots('[{"target":"mac","args":"nope"}]')).errors[0]).toMatch(
      /"args" expects an array of strings/,
    );
    expect(parseShotPlan(bodyWithShots('[{"target":"mac","glob":""}]')).errors[0]).toMatch(
      /"glob" expects a non-empty glob string/,
    );
  });
});

describe("validateDeclaredShotTargets — command fields rejected for web targets (#0769)", () => {
  const shot: ShotConfig = {
    targets: [{ name: "Divot bar", areas: ["mac"], command: "render" }],
  };

  it("accepts env/args/glob on a command target", () => {
    const errors = validateDeclaredShotTargets(
      [{ target: "Divot bar", env: { ONLY: "x" }, glob: "*.png" }],
      undefined,
      shot,
    );
    expect(errors).toEqual([]);
  });

  it("rejects env/args/glob on a web target with a clear message", () => {
    const errors = validateDeclaredShotTargets(
      [{ target: "web", env: { ONLY: "x" } }],
      { command: "bun dev", targets: [{ name: "web", areas: ["web"], command: "bun dev" }] },
      shot,
    );
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/"env" are for a command capture target/);
    expect(errors[0]).toMatch(/"web" is a web preview target/);
  });

  it("rejects command fields with no target (default web target)", () => {
    const errors = validateDeclaredShotTargets([{ glob: "*.png" }], { command: "bun dev" }, shot);
    expect(errors[0]).toMatch(/"glob" only apply to a command capture target/);
  });
});

describe("buildCapturePlan — selection threaded onto command entries (#0769)", () => {
  it("carries env/glob onto the command entry and keeps two entries distinct", () => {
    const built = buildCapturePlan(
      ["Divot bar"],
      [
        { target: "Divot bar", label: "World clock", glob: "*worldclock*.png" },
        { target: "Divot bar", label: "Battery", glob: "*battery*.png" },
      ],
      { commandTargets: COMMAND_TARGETS },
    );
    expect(built.errors).toEqual([]);
    expect(built.collapsed).toEqual([]);
    expect(built.entries).toHaveLength(2);
    expect(built.entries.map((e) => e.glob)).toEqual(["*worldclock*.png", "*battery*.png"]);
    expect(built.entries.every((e) => e.target === "Divot bar")).toBe(true);
    // A command entry never gains a route.
    expect(built.entries.every((e) => e.route === undefined)).toBe(true);
  });

  it("collapses two identical env/glob entries into one capture", () => {
    const built = buildCapturePlan(
      ["Divot bar"],
      [
        { target: "Divot bar", label: "A", env: { ONLY: "clock" } },
        { target: "Divot bar", label: "B", env: { ONLY: "clock" } },
      ],
      { commandTargets: COMMAND_TARGETS },
    );
    expect(built.entries).toHaveLength(1);
    expect(built.collapsed).toEqual(["B"]);
  });

  it("applies caller --env/--glob to the undeclared command fallback only", () => {
    const built = buildCapturePlan(["Divot bar"], [], {
      commandTargets: COMMAND_TARGETS,
      env: { DIVOT_SNAPSHOT_ONLY: "worldclock" },
      glob: "*worldclock*.png",
    });
    expect(built.entries).toHaveLength(1);
    expect(built.entries[0].env).toEqual({ DIVOT_SNAPSHOT_ONLY: "worldclock" });
    expect(built.entries[0].glob).toBe("*worldclock*.png");
  });

  it("never puts --env/--glob on a web fallback entry", () => {
    const built = buildCapturePlan(["web"], [], {
      commandTargets: COMMAND_TARGETS,
      env: { DIVOT_SNAPSHOT_ONLY: "worldclock" },
      glob: "*.png",
    });
    expect(built.entries[0].env).toBeUndefined();
    expect(built.entries[0].glob).toBeUndefined();
    expect(built.entries[0].route).toBe("/");
  });
});

describe("runShotCommand — env/args/glob selection (#0769)", () => {
  function target(overrides: Partial<ShotTargetConfig> = {}): ShotTargetConfig {
    return { name: "Divot bar", areas: ["mac"], command: "true", ...overrides };
  }

  /** Writes one PNG per name passed in `$REPOOS_SHOT_DIR`. */
  function writePngs(names: string[]): string {
    const arg = names.map((n) => `"$REPOOS_SHOT_DIR/${n}"`).join(" ");
    return names
      .map((n) => `printf '%s' '${PNG_1PX}' | base64 -d > "$REPOOS_SHOT_DIR/${n}"`)
      .concat([`test -n ${arg} || true`])
      .join("; ");
  }

  it("passes declared env through to the command, unchanged", () => {
    const worktree = tmp("repoos-0769-env-wt-");
    const out = tmp("repoos-0769-env-out-");
    // The command writes a text file naming the env value it saw; a text file
    // is not an image, so it is read directly rather than collected.
    const outcome = runShotCommand(
      target({
        command: `printf '%s' "$DIVOT_SNAPSHOT_ONLY" > "$REPOOS_SHOT_DIR/seen.txt"; ${writePngs(["a.png"])}`,
      }),
      worktree,
      out,
      { env: { DIVOT_SNAPSHOT_ONLY: "worldclock" } },
    );
    expect(outcome.status).toBe("captured");
    expect(readFileSync(join(out, "seen.txt"), "utf8")).toBe("worldclock");
  });

  it("passes declared args as quoted tokens, not interpolated shell", () => {
    const worktree = tmp("repoos-0769-args-wt-");
    const out = tmp("repoos-0769-args-out-");
    // A declared value with a `;` must arrive as DATA (one shell-quoted token),
    // never be re-parsed as a command separator. The appended token is argv for
    // the command, so the arg-reading `sh` must be the LAST thing on the line.
    // `$1` is the token; `_` stands in as `$0`.
    const outcome = runShotCommand(
      target({
        command: `${writePngs(["a.png"])}; sh -c 'printf "%s" "$1" > "$REPOOS_SHOT_DIR/arg.txt"' _`,
      }),
      worktree,
      out,
      { args: ["--only; rm -rf /"] },
    );
    expect(outcome.status).toBe("captured");
    expect(readFileSync(join(out, "arg.txt"), "utf8")).toBe("--only; rm -rf /");
  });

  it("narrows the collected files to the per-entry glob", () => {
    const worktree = tmp("repoos-0769-glob-wt-");
    const out = tmp("repoos-0769-glob-out-");
    const outcome = runShotCommand(
      target({
        command: writePngs(["bar.png", "worldclock.png", "battery.png"]),
        outputGlob: ["*.png"],
      }),
      worktree,
      out,
      { outputGlob: ["*worldclock*.png"] },
    );
    expect(outcome.status).toBe("captured");
    if (outcome.status !== "captured") return;
    expect(outcome.files.map((f: CapturedShotFile) => f.name)).toEqual(["worldclock.png"]);
  });

  it("skips visibly when the narrowing glob matches nothing", () => {
    const worktree = tmp("repoos-0769-glob-none-wt-");
    const out = tmp("repoos-0769-glob-none-out-");
    const outcome = runShotCommand(
      target({ command: writePngs(["bar.png"]), outputGlob: ["*.png"] }),
      worktree,
      out,
      { outputGlob: ["*worldclock*.png"] },
    );
    expect(outcome.status).toBe("skipped");
    if (outcome.status !== "skipped") return;
    expect(outcome.reason).toMatch(/matching \*worldclock\*\.png/);
  });
});

describe("repoos shot --env/--glob parsing (#0769)", () => {
  it("collects repeated --env KEY=VAL pairs and --glob", () => {
    const opts = parseShotArgs([
      "--target",
      "Divot bar",
      "--env",
      "DIVOT_SNAPSHOT_ONLY=worldclock",
      "--env",
      "OTHER=1",
      "--glob",
      "*worldclock*.png",
    ]);
    expect(opts.error).toBeUndefined();
    expect(opts.env).toEqual({ DIVOT_SNAPSHOT_ONLY: "worldclock", OTHER: "1" });
    expect(opts.glob).toBe("*worldclock*.png");
  });

  it("rejects a malformed --env value", () => {
    expect(parseShotArgs(["--env", "no-equals"]).error).toMatch(/--env expects KEY=VALUE/);
    expect(parseShotArgs(["--env", "1BAD=x"]).error).toMatch(/valid variable name/);
  });
});

describe("automatic command capture cap (#0769)", () => {
  it("defaults to a sensible cap and is a documented config key", async () => {
    const { getConfigSchema, loadConfig, SUPPORTED_TOML_KEYS, parseShotConfig } =
      await import("../../core/config.js");
    expect(DEFAULT_MAX_AUTO_SHOTS).toBe(12);
    const field = getConfigSchema().find((f) => f.key === "shot.maxAutoShots");
    expect(field).toMatchObject({ type: "number", tier: "live", default: DEFAULT_MAX_AUTO_SHOTS });
    expect(SUPPORTED_TOML_KEYS).toContain("shot.maxAutoShots");

    const dir = tmp("repoos-0769-cap-");
    const { writeFileSync } = await import("node:fs");
    writeFileSync(join(dir, "repoos.toml"), "shot.maxAutoShots = 3\n");
    const cfg = loadConfig(dir);
    expect(cfg.shot?.maxAutoShots).toBe(3);
    // The cap is a sibling of the targets array: it parses even with no rows.
    expect(parseShotConfig({ "shot.maxAutoShots": 3 })).toEqual({
      targets: [],
      maxAutoShots: 3,
    });
  });

  it("has a Settings control on General", async () => {
    const { getConfigSchema } = await import("../../core/config.js");
    const { resolveSettingLocation } = await import("../src/settings-location.js");
    const field = getConfigSchema().find((f) => f.key === "shot.maxAutoShots");
    const loc = resolveSettingLocation("shot.maxAutoShots", field, { inspectorAvailable: true });
    expect(loc).toEqual({ tab: "general", hasUiRow: true });
  });

  it("keeps only the first N automatic images and notes the rest not shown", async () => {
    const { captureCommandEntries } = await import("../../server/shot-capture.js");
    const { localShotStore } = await import("../../server/shots.js");
    const { loadConfig } = await import("../../core/config.js");
    const root = tmp("repoos-0769-cap-store-");
    const config = loadConfig(root);
    // Five PNGs, a cap of two: three should be dropped with a visible note.
    const command = Array.from(
      { length: 5 },
      (_, i) => `printf '%s' '${PNG_1PX}' | base64 -d > "$REPOOS_SHOT_DIR/shot${i}.png"`,
    ).join("; ");
    config.shot = {
      maxAutoShots: 2,
      targets: [{ name: "Divot bar", areas: ["mac"], command, outputGlob: ["*.png"] }],
    };
    const store = localShotStore(config, "0769cap");
    const batch = captureCommandEntries({
      config,
      task: { id: "0769cap" } as unknown as import("../../core/types").Task,
      entries: [
        {
          target: "Divot bar",
          label: "Bar",
          provenance: { kind: "auto" },
        },
      ],
      commandRoot: root,
      planFingerprint: "fp",
      store,
      ensureCleared: () => {},
    });
    expect(batch.captured).toBe(2);
    expect(batch.evidence[0].shots).toHaveLength(2);
    expect(batch.evidence[0].warnings?.join(" ")).toMatch(/3 more images not shown/);
    expect(batch.evidence[0].warnings?.join(" ")).toMatch(/cap 2 per task/);
  });

  it("never caps a declared entry", async () => {
    const { captureCommandEntries } = await import("../../server/shot-capture.js");
    const { localShotStore } = await import("../../server/shots.js");
    const { loadConfig } = await import("../../core/config.js");
    const root = tmp("repoos-0769-cap-declared-");
    const config = loadConfig(root);
    const command = Array.from(
      { length: 5 },
      (_, i) => `printf '%s' '${PNG_1PX}' | base64 -d > "$REPOOS_SHOT_DIR/shot${i}.png"`,
    ).join("; ");
    config.shot = {
      maxAutoShots: 2,
      targets: [{ name: "Divot bar", areas: ["mac"], command, outputGlob: ["*.png"] }],
    };
    const store = localShotStore(config, "0769dec");
    const batch = captureCommandEntries({
      config,
      task: { id: "0769dec" } as unknown as import("../../core/types").Task,
      entries: [
        {
          target: "Divot bar",
          label: "World clock",
          provenance: { kind: "declared", label: "World clock" },
        },
      ],
      commandRoot: root,
      planFingerprint: "fp",
      store,
      ensureCleared: () => {},
    });
    expect(batch.captured).toBe(5);
    expect(batch.evidence[0].shots).toHaveLength(5);
    expect(batch.evidence[0].warnings?.join(" ") ?? "").not.toMatch(/not shown/);
  });
});
