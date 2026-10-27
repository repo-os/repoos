/**
 * #0761 — command-based capture targets for non-web apps (native macOS,
 * iOS/Android, desktop). The pieces under test are pure/CLI-level: target
 * resolution, the docs skip, the config parser, and `runShotCommand` (which
 * runs a real shell command and collects the images it writes).
 */
import { describe, expect, it, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, basename, dirname } from "node:path";
import { loadConfig, parseShotConfig, SUPPORTED_TOML_KEYS } from "../../core/config";
import {
  allShotTargetNames,
  describeShotTargetPathMatches,
  resolveShotTargets,
  shotTargetsForArea,
  shotTargetsForPaths,
} from "../../core/shot-targets";
import { buildCapturePlan } from "../../core/shot-plan";
import {
  binaryAvailable,
  collectShotFiles,
  mimeForShotFile,
  runShotCommand,
  tailLines,
} from "../../core/shot-command";
import { localShotStore } from "../../server/shots";
import type { ShotConfig, ShotTargetConfig } from "../../core/types";

/** A 1x1 transparent PNG, base64-encoded. */
const PNG_1PX =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

const SHOT: ShotConfig = {
  targets: [
    { name: "mac", areas: ["mac"], paths: ["Sources/Divot/**"], command: "render" },
    { name: "ios", areas: ["ios"], paths: ["ios/**"], command: "simctl" },
  ],
};

const temps: string[] = [];
function tmp(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  temps.push(dir);
  return dir;
}
afterEach(() => {
  for (const t of temps.splice(0)) rmSync(t, { recursive: true, force: true });
});

describe("parseShotConfig (#0761)", () => {
  it("reads [[shot.targets]] rows, defaulting the name from areas", () => {
    const parsed = parseShotConfig({
      "shot.targets": [
        {
          name: "macOS app",
          areas: ["mac"],
          paths: ["Sources/**"],
          command: "swift test --filter Shots",
          output_glob: ["*.png"],
          requires: "xcrun",
          timeout_ms: 30000,
          cwd: "app",
        },
        { areas: ["ios"], command: "make shots" },
      ],
    });
    expect(parsed?.targets?.[0]).toEqual({
      name: "macOS app",
      areas: ["mac"],
      command: "swift test --filter Shots",
      paths: ["Sources/**"],
      cwd: "app",
      outputGlob: ["*.png"],
      requires: "xcrun",
      timeoutMs: 30000,
    });
    expect(parsed?.targets?.[1]).toMatchObject({ name: "ios", command: "make shots" });
  });

  it("drops a row without a command and disambiguates duplicate names", () => {
    const parsed = parseShotConfig({
      "shot.targets": [
        { name: "dup", areas: ["a"], command: "one" },
        { name: "dup", areas: ["a"], command: "two" },
        { name: "no-command", areas: ["b"] },
      ],
    });
    expect(parsed?.targets?.map((t) => t.name)).toEqual(["dup", "dup (2)"]);
  });

  it("returns undefined when no command target is declared", () => {
    expect(parseShotConfig({})).toBeUndefined();
    expect(parseShotConfig({ "shot.targets": [] })).toBeUndefined();
  });

  it("is documented in SUPPORTED_TOML_KEYS", () => {
    for (const key of [
      "shot.targets.name",
      "shot.targets.areas",
      "shot.targets.paths",
      "shot.targets.command",
      "shot.targets.cwd",
      "shot.targets.outputGlob",
      "shot.targets.requires",
      "shot.targets.timeoutMs",
    ]) {
      expect(SUPPORTED_TOML_KEYS).toContain(key);
    }
  });

  it("loads from repoos.toml end to end", () => {
    const dir = tmp("repoos-shot-cfg-");
    writeFileSync(
      join(dir, "repoos.toml"),
      [
        "[[shot.targets]]",
        'name = "macOS app"',
        'areas = ["mac"]',
        'paths = ["Sources/**"]',
        'command = "swift test"',
        'requires = "xcrun"',
        "",
      ].join("\n"),
    );
    const cfg = loadConfig(dir);
    expect(cfg.shot?.targets?.[0]).toMatchObject({
      name: "macOS app",
      areas: ["mac"],
      command: "swift test",
      requires: "xcrun",
    });
  });
});

describe("command-target resolution (#0761)", () => {
  it("matches changed paths and areas, and stays out of the way when nothing matches", () => {
    expect(shotTargetsForPaths(SHOT, ["Sources/Divot/App.swift"])).toEqual(["mac"]);
    expect(shotTargetsForPaths(SHOT, ["src/app.ts"])).toEqual([]);
    expect(shotTargetsForArea(SHOT, "ios")).toEqual(["ios"]);
    expect(shotTargetsForArea(SHOT, "core")).toEqual([]);
  });

  it("filters test artifacts before matching, like web targets", () => {
    expect(shotTargetsForPaths(SHOT, ["Sources/Divot/Tests/AppTests.swift"])).toEqual(["mac"]);
    expect(shotTargetsForPaths(SHOT, ["Sources/Divot/tests/setup/helper.swift"])).toEqual([]);
  });

  it("marks a docs-only match as contentOnly", () => {
    const matches = describeShotTargetPathMatches(SHOT, ["ios/README.md"]);
    expect(matches).toEqual([{ target: "ios", globs: ["ios/**"], contentOnly: true }]);
    const code = describeShotTargetPathMatches(SHOT, ["ios/App.swift"]);
    expect(code[0]?.contentOnly).toBe(false);
  });

  it("resolves a command target through resolveShotTargets (paths, area, --target)", () => {
    const byPaths = resolveShotTargets(
      undefined,
      "core",
      ["Sources/Divot/App.swift"],
      undefined,
      SHOT,
    );
    expect(byPaths.names).toEqual(["mac"]);
    expect(byPaths.source).toBe("paths");

    const byArea = resolveShotTargets(undefined, "ios", ["src/app.ts"], undefined, SHOT);
    expect(byArea.names).toEqual(["ios"]);
    expect(byArea.source).toBe("area");

    const byTarget = resolveShotTargets(undefined, "core", [], "mac", SHOT);
    expect(byTarget.names).toEqual(["mac"]);
    expect(byTarget.source).toBe("target");
  });

  it("points at the command-target declaration when nothing covers the diff", () => {
    const r = resolveShotTargets(undefined, "core", ["src/app.ts"], undefined, SHOT);
    expect(r.names).toEqual([]);
    expect(r.reason).toMatch(/\[\[shot.targets\]\]/);
  });

  it("keeps web behavior unchanged when both are configured", () => {
    const preview = {
      targets: [{ name: "web", areas: ["web"], paths: ["src/ui/**"], command: "bun dev" }],
    };
    // A web path resolves the web target.
    const web = resolveShotTargets(preview, "web", ["src/ui/App.vue"], undefined, SHOT);
    expect(web.names).toEqual(["web"]);
    // A native path still resolves the command target.
    const native = resolveShotTargets(preview, "mac", ["Sources/Divot/App.swift"], undefined, SHOT);
    expect(native.names).toEqual(["mac"]);
    // Both matched paths resolve both, web first.
    const both = resolveShotTargets(
      preview,
      "web",
      ["src/ui/App.vue", "Sources/Divot/App.swift"],
      undefined,
      SHOT,
    );
    expect(both.names).toEqual(["web", "mac"]);
  });

  it("lists command target names alongside web names for --shots validation", () => {
    const preview = {
      command: "bun dev",
      targets: [{ name: "web", areas: ["web"], command: "bun dev" }],
    };
    expect(allShotTargetNames(preview, SHOT)).toEqual(["default", "web", "mac", "ios"]);
  });
});

describe("buildCapturePlan with command targets (#0761)", () => {
  const commandTargets = new Set(["mac"]);

  it("does not docs-skip a command target and omits its route", () => {
    const built = buildCapturePlan(["mac"], [], {
      commandTargets,
      docsContentOnly: new Set(["mac"]),
    });
    expect(built.autoSkips).toEqual([]);
    expect(built.entries).toHaveLength(1);
    expect(built.entries[0].target).toBe("mac");
    expect(built.entries[0].route).toBeUndefined();
    expect(built.entries[0].provenance).toEqual({ kind: "auto" });
  });

  it("still docs-skips a web target", () => {
    const built = buildCapturePlan(["docs"], [], {
      commandTargets,
      docsContentOnly: new Set(["docs"]),
    });
    expect(built.entries).toEqual([]);
    expect(built.autoSkips[0]).toMatch(/skipped: no docs shot declared/);
  });

  it("drops page-only fields (highlight/selector/steps) from a declared command shot", () => {
    const built = buildCapturePlan(
      ["mac"],
      [
        {
          target: "mac",
          label: "Menu bar open",
          highlight: ".unused",
          selector: ".unused",
          steps: [{ click: ".unused" }],
        },
      ],
      { commandTargets },
    );
    expect(built.entries).toHaveLength(1);
    expect(built.entries[0]).toMatchObject({ target: "mac", label: "Menu bar open" });
    expect(built.entries[0].highlight).toBeUndefined();
    expect(built.entries[0].selector).toBeUndefined();
    expect(built.entries[0].steps).toBeUndefined();
    expect(built.entries[0].route).toBeUndefined();
  });

  it("keeps a declared route-less command shot even for a docs-content target", () => {
    const built = buildCapturePlan(["mac"], [{ target: "mac" }], {
      commandTargets,
      docsContentOnly: new Set(["mac"]),
    });
    expect(built.errors).toEqual([]);
    expect(built.entries).toHaveLength(1);
  });
});

describe("runShotCommand (#0761)", () => {
  function target(overrides: Partial<ShotTargetConfig> = {}): ShotTargetConfig {
    return { name: "mac", areas: ["mac"], command: "true", ...overrides };
  }

  // A command that writes a real PNG into REPOOS_SHOT_DIR.
  const writePng = `printf '%s' '${Buffer.from(PNG_1PX, "base64").toString("base64")}' | base64 -d > "$REPOOS_SHOT_DIR/shot.png"`;

  it("runs the command in the worktree and collects the images it wrote", () => {
    const worktree = tmp("repoos-shot-cmd-wt-");
    const out = tmp("repoos-shot-cmd-out-");
    const outcome = runShotCommand(target({ command: writePng }), worktree, out);
    expect(outcome.status).toBe("captured");
    if (outcome.status !== "captured") return;
    expect(outcome.files).toHaveLength(1);
    expect(outcome.files[0].name).toBe("shot.png");
    expect(outcome.files[0].mime).toBe("image/png");
    expect(outcome.files[0].data.length).toBeGreaterThan(0);
  });

  it("honors outputGlob and collapses a nested directory walk", () => {
    const worktree = tmp("repoos-shot-cmd-glob-");
    const out = tmp("repoos-shot-cmd-out-");
    const cmd =
      `mkdir -p "$REPOOS_SHOT_DIR/nested" && ` +
      `cp -r /dev/null "$REPOOS_SHOT_DIR/nested/a.png" 2>/dev/null || true; ` +
      `printf 'x' > "$REPOOS_SHOT_DIR/nested/a.png"; ` +
      `printf 'x' > "$REPOOS_SHOT_DIR/nested/b.txt"; ` +
      `printf 'x' > "$REPOOS_SHOT_DIR/top.png"`;
    const outcome = runShotCommand(
      target({ command: cmd, outputGlob: ["nested/*.png"] }),
      worktree,
      out,
    );
    expect(outcome.status).toBe("captured");
    if (outcome.status !== "captured") return;
    expect(outcome.files.map((f) => f.name)).toEqual(["nested/a.png"]);
  });

  it("skips cleanly when the required binary is missing, without running the command", () => {
    const worktree = tmp("repoos-shot-cmd-req-");
    const out = tmp("repoos-shot-cmd-out-");
    // Marker file proves the command did NOT run.
    const marker = join(worktree, "ran.txt");
    const outcome = runShotCommand(
      target({ command: `echo hi > ${marker}`, requires: "definitely-not-a-real-binary-0761" }),
      worktree,
      out,
    );
    expect(outcome.status).toBe("skipped");
    if (outcome.status !== "skipped") return;
    expect(outcome.reason).toMatch(/not installed/);
    expect(() => readFileSync(marker)).toThrow();
  });

  it("times out a hung command and records the output tail", () => {
    const worktree = tmp("repoos-shot-cmd-timeout-");
    const out = tmp("repoos-shot-cmd-out-");
    const outcome = runShotCommand(
      target({ command: "echo starting; sleep 5", timeoutMs: 300 }),
      worktree,
      out,
    );
    expect(outcome.status).toBe("failed");
    if (outcome.status !== "failed") return;
    expect(outcome.reason).toMatch(/timed out after 300ms/);
  });

  it("skips visibly when the command produces no image files", () => {
    const worktree = tmp("repoos-shot-cmd-none-");
    const out = tmp("repoos-shot-cmd-out-");
    const outcome = runShotCommand(target({ command: "echo nothing here" }), worktree, out);
    expect(outcome.status).toBe("skipped");
    if (outcome.status !== "skipped") return;
    expect(outcome.reason).toMatch(/produced no image files/);
  });

  it("fails with the stdout/stderr tail when the command exits non-zero with no files", () => {
    const worktree = tmp("repoos-shot-cmd-fail-");
    const out = tmp("repoos-shot-cmd-out-");
    const outcome = runShotCommand(target({ command: "echo boom >&2; exit 3" }), worktree, out);
    expect(outcome.status).toBe("failed");
    if (outcome.status !== "failed") return;
    expect(outcome.reason).toMatch(/exited 3/);
    expect(outcome.reason).toMatch(/boom/);
  });

  it("collects files even when the command exits non-zero, with a warning", () => {
    const worktree = tmp("repoos-shot-cmd-partial-");
    const out = tmp("repoos-shot-cmd-out-");
    const outcome = runShotCommand(target({ command: `${writePng}; exit 1` }), worktree, out);
    expect(outcome.status).toBe("captured");
    if (outcome.status !== "captured") return;
    expect(outcome.files).toHaveLength(1);
    expect(outcome.warnings[0]).toMatch(/exited 1/);
  });

  it("never writes outside the injected REPOOS_SHOT_DIR by default", () => {
    const worktree = tmp("repoos-shot-cmd-tracked-");
    const out = tmp("repoos-shot-cmd-out-");
    const outcome = runShotCommand(target({ command: writePng }), worktree, out);
    expect(outcome.status).toBe("captured");
    // The command wrote only under `out`; nothing landed in the worktree.
    expect(collectShotFiles(worktree, ["**/*.png"])).toEqual([]);
  });

  it("rejects cwd that escapes the worktree via traversal", () => {
    const worktree = tmp("repoos-shot-cmd-escape-");
    const out = tmp("repoos-shot-cmd-out-");
    const outcome = runShotCommand(target({ command: writePng, cwd: "../../../" }), worktree, out);
    expect(outcome.status).toBe("failed");
    if (outcome.status === "failed") {
      expect(outcome.reason).toContain("escapes the worktree");
    }
    expect(collectShotFiles(out, ["**/*.png"])).toEqual([]);
  });

  it("runs with cwd set to the target's subdirectory", () => {
    const worktree = tmp("repoos-shot-cmd-cwd-");
    mkdirSync(join(worktree, "app"), { recursive: true });
    const out = tmp("repoos-shot-cmd-out-");
    const cmd = `pwd > "$REPOOS_SHOT_DIR/where.txt"; ${writePng}`;
    const outcome = runShotCommand(target({ command: cmd, cwd: "app" }), worktree, out);
    expect(outcome.status).toBe("captured");
    if (outcome.status !== "captured") return;
    // The `where.txt` is not an image, so read it directly.
    const where = readFileSync(join(out, "where.txt"), "utf8").trim();
    expect(where.endsWith("/app")).toBe(true);
  });
});

describe("shot-command helpers", () => {
  it("classifies image MIME types", () => {
    expect(mimeForShotFile("a.png")).toBe("image/png");
    expect(mimeForShotFile("a.JPG")).toBe("image/jpeg");
    expect(mimeForShotFile("a.webp")).toBe("image/webp");
    expect(mimeForShotFile("a.unknown")).toBe("image/png");
  });

  it("tails the last non-empty lines", () => {
    expect(tailLines("a\n\nb\nc\n", 2)).toBe("b\nc");
    expect(tailLines("", 5)).toBe("");
  });

  it("detects a present binary and a missing one", () => {
    expect(binaryAvailable("sh")).toBe(true);
    expect(binaryAvailable("definitely-not-real-0761-xyz")).toBe(false);
    expect(binaryAvailable("")).toBe(true);
  });
});

describe("handoff capture plans a command target (#0761)", () => {
  /** Real git repo + linked worktree, so `computeTaskShotContext` sees the diff. */
  function fixture(): { root: string; worktree: string; taskId: string } {
    const root = tmp("repoos-shot-handoff-");
    const git = (...args: string[]): string =>
      execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
    git("init", "-q");
    git("config", "user.email", "t@example.com");
    git("config", "user.name", "Test");
    git("branch", "-M", "main");
    mkdirSync(join(root, "work"), { recursive: true });
    writeFileSync(join(root, "README.md"), "hi\n");
    writeFileSync(join(root, ".gitignore"), "work/.attachments/\n");
    git("add", ".");
    git("commit", "-q", "-m", "init");
    const branch = "feat/mac";
    git("branch", branch);
    const worktree = join(dirname(root), `${basename(root)}-worktrees`, "mac");
    execFileSync("git", ["worktree", "add", worktree, branch], {
      cwd: root,
      stdio: ["ignore", "ignore", "ignore"],
    });
    mkdirSync(join(worktree, "Sources", "Divot"), { recursive: true });
    writeFileSync(join(worktree, "Sources", "Divot", "App.swift"), "print(1)\n");
    execFileSync("git", ["add", "."], { cwd: worktree });
    execFileSync("git", ["commit", "-q", "-m", "feat"], { cwd: worktree });
    return { root, worktree, taskId: "0761h" };
  }

  it("returns a route-less command entry for an auto-matched path", async () => {
    const { planAutoCapture } = await import("../../server/shot-capture.js");
    const { root, taskId } = fixture();
    const config = loadConfig(root);
    config.shot = SHOT;
    const task = {
      id: taskId,
      title: "t",
      path: `work/${taskId}.md`,
      absPath: join(root, "work", `${taskId}.md`),
      status: "active",
      branch: "feat/mac",
      area: "mac",
      body: "## Problem\nx\n",
    } as unknown as import("../../core/types").Task;
    const plan = await planAutoCapture(config, task);
    expect("entries" in plan).toBe(true);
    if (!("entries" in plan)) return;
    expect(plan.entries).toHaveLength(1);
    expect(plan.entries[0].target).toBe("mac");
    expect(plan.entries[0].route).toBeUndefined();
    expect(plan.entries[0].provenance).toEqual({
      kind: "auto",
      globs: ["Sources/Divot/**"],
    });
  });

  it("skips with an actionable reason when the diff matches no capture target", async () => {
    const { planAutoCapture } = await import("../../server/shot-capture.js");
    const { root, taskId } = fixture();
    const config = loadConfig(root);
    config.shot = SHOT;
    const task = {
      id: taskId,
      title: "t",
      path: `work/${taskId}.md`,
      absPath: join(root, "work", `${taskId}.md`),
      status: "active",
      branch: "feat/mac",
      // Area is neither a preview target nor a command target, and the declared
      // paths match nothing — the stand-down names the declaration path.
      area: "core",
      body: "## Problem\nx\n",
    } as unknown as import("../../core/types").Task;
    // Point the target globs away from the diff.
    config.shot = { targets: [{ name: "mac", areas: ["mac"], paths: ["Other/**"], command: "x" }] };
    const plan = await planAutoCapture(config, task);
    expect("reason" in plan).toBe(true);
    if (!("reason" in plan)) return;
    expect(plan.reason).toMatch(/touches no capture target/i);
  });
});

describe("Settings schema for [[shot.targets]] (#0761)", () => {
  it("exposes a schema entry that resolves to the repoos.toml tab", async () => {
    const { getConfigSchema } = await import("../../core/config.js");
    const { resolveSettingLocation } = await import("../src/settings-location.js");
    const field = getConfigSchema().find((f) => f.key === "shot.targets");
    expect(field).toMatchObject({ type: "array", restartRequired: true });
    // Raw-TOML-only array-of-tables, like [[preview.targets]]: the schema entry
    // exists so search can point at the toml tab, but there is no UI row.
    const loc = resolveSettingLocation("shot.targets", field, { inspectorAvailable: true });
    expect(loc).toEqual({ tab: "toml", hasUiRow: false });
  });
});

describe("command shots are stored gitignored (#0761)", () => {
  function makeRepo(): string {
    const root = tmp("repoos-shot-cmd-store-");
    mkdirSync(join(root, "work"), { recursive: true });
    writeFileSync(join(root, ".gitignore"), "work/.attachments/\n");
    const git = (...args: string[]): string =>
      execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
    git("init", "-q");
    git("config", "user.email", "t@example.com");
    git("config", "user.name", "Test");
    git("add", ".gitignore");
    git("commit", "-q", "-m", "init");
    return root;
  }

  it("stores a command shot with its marker and never shows it in git status", () => {
    const root = makeRepo();
    const config = loadConfig(root);
    const store = localShotStore(config, "0761");
    const saved = store.save({
      target: "mac",
      command: "command",
      label: "Menu bar open",
      mime: "image/png",
      data: PNG_1PX,
    });
    expect("error" in saved).toBe(false);
    if ("error" in saved) return;
    expect(saved.path.startsWith("work/.attachments/0761/shots/")).toBe(true);
    const listed = store.list();
    expect(listed[0].command).toBe("command");
    expect(listed[0].route).toBeUndefined();
    const status = execFileSync("git", ["status", "--porcelain"], {
      cwd: root,
      encoding: "utf8",
    }).trim();
    expect(status).toBe("");
  });
});
