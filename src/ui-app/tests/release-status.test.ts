import { afterEach, describe, expect, it, vi } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RepoOSConfig } from "../../core/types";
import type { RemoteValidator, CheckSummary } from "../../server/remote-validation";
import { cutNewRelease, getReleaseStatus, type ReleaseCommandRunner } from "../../server/release";
import { collectReleaseCommits, releaseNotesPrompt } from "../../server/release";
import {
  generateReleaseNotes,
  getReleaseNotesRun,
  whenNotesRunSettles,
} from "../../server/routes/release.js";
import { runPrompt } from "../../server/agents.js";
import { RepoOSDb, resetDbInstance } from "../../core/db.js";

// Mock only runPrompt so the route's agent-resolution/DB-recording logic runs
// for real (#0361's route-level coverage) without spawning a CLI.
vi.mock("../../server/agents.js", async () => {
  const actual =
    await vi.importActual<typeof import("../../server/agents.js")>("../../server/agents.js");
  return { ...actual, runPrompt: vi.fn() };
});

const roots: string[] = [];
afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })));

function initGitRepo(root: string): void {
  execFileSync("git", ["init", "-q"], { cwd: root });
  execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: root });
  execFileSync("git", ["config", "user.name", "Test"], { cwd: root });
  execFileSync("git", ["commit", "--allow-empty", "-qm", "init"], { cwd: root });
}

function config(): RepoOSConfig {
  const root = mkdtempSync(join(tmpdir(), "repoos-release-ui-"));
  roots.push(root);
  writeFileSync(join(root, "package.json"), JSON.stringify({ version: "1.2.3" }));
  return {
    root,
    workDir: "work",
    docsDir: "docs",
    skillsDir: "skills",
    taskExtensions: [".md"],
    defaultStatus: "inbox",
    defaultAssignee: "unassigned",
    cacheDir: ".repoos",
    release: { enabled: true, provider: "git-tag", repository: "repo-os/repoos" },
  };
}

function git({
  dirty = "",
  tag = "",
}: { dirty?: string; tag?: string } = {}): ReleaseCommandRunner {
  return async (_command, args) => {
    const key = args.join(" ");
    if (key === "branch --show-current") return { code: 0, stdout: "main\n", stderr: "" };
    if (key === "status --porcelain") return { code: 0, stdout: dirty, stderr: "" };
    if (key === "rev-parse --short HEAD" || key === "rev-parse HEAD")
      return { code: 0, stdout: "abc123\n", stderr: "" };
    if (key === "describe --tags --abbrev=0") return { code: 0, stdout: "v1.2.2\n", stderr: "" };
    if (key === "tag --list v1.2.3") return { code: 0, stdout: tag, stderr: "" };
    return { code: 1, stdout: "", stderr: "" };
  };
}

describe("git-tag release status", () => {
  it("is invisible when no repository opts in", async () => {
    const status = await getReleaseStatus({ ...config(), release: undefined }, git());
    expect(status).toMatchObject({ enabled: false, ready: false });
  });

  it("is ready only on clean configured main with a new tag", async () => {
    const status = await getReleaseStatus(config(), git());
    expect(status).toMatchObject({
      ready: true,
      tag: "v1.2.3",
      releaseUrl: "https://github.com/repo-os/repoos/releases/tag/v1.2.3",
    });
  });

  it("does not offer a duplicate or dirty release", async () => {
    const status = await getReleaseStatus(
      config(),
      git({ dirty: " M src/a.ts\n", tag: "v1.2.3\n" }),
    );
    expect(status.ready).toBe(false);
    expect(status.released).toBe(true);
    expect(status.blockers).toEqual(
      expect.arrayContaining([
        "Commit or stash all working-tree changes first.",
        "v1.2.3 already exists.",
      ]),
    );
  });

  it("commits the chosen version before verifying, pushing main, and pushing its tag", async () => {
    const cfg = config();
    const calls: string[] = [];
    const runner: ReleaseCommandRunner = async (command, args) => {
      calls.push([command, ...args].join(" "));
      if (command !== "git") return { code: 0, stdout: "check passed", stderr: "" };
      if (["add", "commit", "push"].includes(args[0]) || (args[0] === "tag" && args[1] === "-a")) {
        return { code: 0, stdout: "", stderr: "" };
      }
      return git()("git", args, cfg.root);
    };
    const result = await cutNewRelease(cfg, "1.2.4", "v1.2.4", runner);
    expect(result.ok).toBe(true);
    expect(JSON.parse(readFileSync(join(cfg.root, "package.json"), "utf8")).version).toBe("1.2.4");
    expect(calls).toEqual(
      expect.arrayContaining([
        "git add -- package.json",
        "git commit -o -m release: v1.2.4 -- package.json",
        "bun run build",
        "git push origin main",
        "git tag -a v1.2.4 -m Release v1.2.4",
        "git push origin v1.2.4",
      ]),
    );
    // The rebuild must happen before repoos check (whose staleness gate it
    // defuses) and before any ref is pushed.
    expect(calls.indexOf("bun run build")).toBeLessThan(
      calls.findIndex((c) => c.includes("dist") && c.includes("check")),
    );
    expect(calls.indexOf("bun run build")).toBeLessThan(calls.indexOf("git push origin main"));
  });

  it("checkpoints a routine repoos.toml save that lands during the check window", async () => {
    const cfg = config();
    const calls: string[] = [];
    // Clean at the pre-flight gate; the settings API writes repoos.toml whole
    // while `repoos check` runs, so it shows dirty afterwards — until the
    // release's own checkpoint commit clears it.
    let phase: "before" | "dirty" | "committed" = "before";
    const runner: ReleaseCommandRunner = async (command, args) => {
      calls.push([command, ...args].join(" "));
      const key = args.join(" ");
      if (command !== "git") {
        if (key.includes("dist") && key.includes("check")) phase = "dirty";
        return { code: 0, stdout: "check passed", stderr: "" };
      }
      if (key === "commit -m chore: checkpoint bookkeeping/config before release") {
        phase = "committed";
        return { code: 0, stdout: "", stderr: "" };
      }
      if (["add", "commit", "push"].includes(args[0]) || (args[0] === "tag" && args[1] === "-a")) {
        return { code: 0, stdout: "", stderr: "" };
      }
      const dirty = phase === "dirty" ? " M repoos.toml\n" : "";
      return git({ dirty })("git", args, cfg.root);
    };
    const result = await cutNewRelease(cfg, "1.2.4", "v1.2.4", runner);
    expect(result.ok).toBe(true);
    expect(calls).toEqual(
      expect.arrayContaining([
        "git add -- repoos.toml",
        "git commit -m chore: checkpoint bookkeeping/config before release",
        "git push origin main",
      ]),
    );
  });

  it("still aborts when an unrelated source file is dirty after the check", async () => {
    const cfg = config();
    let dirtyAfterCheck = "";
    const runner: ReleaseCommandRunner = async (command, args) => {
      const key = args.join(" ");
      if (command !== "git") {
        if (key.includes("dist") && key.includes("check")) dirtyAfterCheck = " M src/a.ts\n";
        return { code: 0, stdout: "check passed", stderr: "" };
      }
      if (["add", "commit", "push"].includes(args[0]) || (args[0] === "tag" && args[1] === "-a")) {
        return { code: 0, stdout: "", stderr: "" };
      }
      return git({ dirty: dirtyAfterCheck })("git", args, cfg.root);
    };
    const result = await cutNewRelease(cfg, "1.2.4", "v1.2.4", runner);
    expect(result.ok).toBe(false);
    expect(result.output).toContain("Repository state changed");
  });

  it("aborts before pushing anything when the pre-check rebuild fails", async () => {
    const cfg = config();
    const calls: string[] = [];
    const runner: ReleaseCommandRunner = async (command, args) => {
      calls.push([command, ...args].join(" "));
      if (command === "bun") return { code: 1, stdout: "", stderr: "tsc: Type error in foo.ts" };
      if (command !== "git") return { code: 0, stdout: "check passed", stderr: "" };
      if (["add", "commit", "push"].includes(args[0]) || (args[0] === "tag" && args[1] === "-a")) {
        return { code: 0, stdout: "", stderr: "" };
      }
      return git()("git", args, cfg.root);
    };
    const result = await cutNewRelease(cfg, "1.2.4", "v1.2.4", runner);
    expect(result.ok).toBe(false);
    expect(result.output).toContain("Type error");
    expect(calls).not.toContain("git push origin main");
    expect(calls).not.toContain("git tag -a v1.2.4 -m Release v1.2.4");
  });

  it("offloads the test suite to the remote runner and skips local tests on green", async () => {
    const cfg: RepoOSConfig = {
      ...config(),
      remoteValidation: { enabled: true, useForReleases: true },
    };
    initGitRepo(cfg.root);
    const calls: string[] = [];
    const runner: ReleaseCommandRunner = async (command, args, _cwd, _timeout, env) => {
      calls.push([command, ...args].join(" "));
      if (command !== "git") {
        if (command === process.execPath && args.some((a) => a.endsWith("check"))) {
          expect(env?.["REPOOS_SKIP_TESTS"]).toBe("1");
          expect(env?.["REPOOS_REMOTE_VALIDATION_DONE"]).toBe("1");
        }
        return { code: 0, stdout: "check passed", stderr: "" };
      }
      if (["add", "commit", "push"].includes(args[0]) || (args[0] === "tag" && args[1] === "-a")) {
        return { code: 0, stdout: "", stderr: "" };
      }
      return git()("git", args, cfg.root);
    };
    const remoteValidator: RemoteValidator = {
      validate: async (): Promise<CheckSummary> => ({ ok: true, stage: "check" }),
      reconcile: async () => {},
      dispose: async () => {},
      logPath: () => "/tmp/none.log",
    };
    const result = await cutNewRelease(cfg, "1.2.4", "v1.2.4", runner, undefined, remoteValidator);
    expect(result.ok).toBe(true);
  });

  it("does not call the remote runner when useForReleases is unset", async () => {
    const cfg: RepoOSConfig = {
      ...config(),
      remoteValidation: { enabled: true, useForReleases: false },
    };
    initGitRepo(cfg.root);
    let called = false;
    const runner: ReleaseCommandRunner = async (command, args) => {
      if (command !== "git") {
        if (command === process.execPath && args.some((a) => a.endsWith("check"))) {
          expect(args).toContain("--local-tests");
        }
        return { code: 0, stdout: "check passed", stderr: "" };
      }
      if (["add", "commit", "push"].includes(args[0]) || (args[0] === "tag" && args[1] === "-a")) {
        return { code: 0, stdout: "", stderr: "" };
      }
      return git()("git", args, cfg.root);
    };
    const remoteValidator: RemoteValidator = {
      validate: async () => {
        called = true;
        return { ok: true, stage: "check" };
      },
      reconcile: async () => {},
      dispose: async () => {},
      logPath: () => "/tmp/none.log",
    };
    const result = await cutNewRelease(cfg, "1.2.4", "v1.2.4", runner, undefined, remoteValidator);
    expect(result.ok).toBe(true);
    expect(called).toBe(false);
  });

  it("fails the release on a real remote gate failure (non-transient)", async () => {
    const cfg: RepoOSConfig = {
      ...config(),
      remoteValidation: { enabled: true, useForReleases: true },
    };
    initGitRepo(cfg.root);
    const runner: ReleaseCommandRunner = async (command, args) => {
      if (command !== "git") return { code: 0, stdout: "check passed", stderr: "" };
      if (["add", "commit", "push"].includes(args[0]) || (args[0] === "tag" && args[1] === "-a")) {
        return { code: 0, stdout: "", stderr: "" };
      }
      return git()("git", args, cfg.root);
    };
    const remoteValidator: RemoteValidator = {
      validate: async (): Promise<CheckSummary> => ({
        ok: false,
        stage: "check",
        transient: false,
        detail: "remote validation failed (exit 1) — 1 failed",
      }),
      reconcile: async () => {},
      dispose: async () => {},
      logPath: () => "/tmp/none.log",
    };
    const result = await cutNewRelease(cfg, "1.2.4", "v1.2.4", runner, undefined, remoteValidator);
    expect(result.ok).toBe(false);
    expect(result.output).toContain("Remote validation failed");
  });

  it("falls back to the full local gate on transient infra failure when fallbackToLocal is set", async () => {
    const cfg: RepoOSConfig = {
      ...config(),
      remoteValidation: { enabled: true, useForReleases: true, fallbackToLocal: true },
    };
    initGitRepo(cfg.root);
    const calls: string[] = [];
    const runner: ReleaseCommandRunner = async (command, args, _cwd, _timeout, env) => {
      calls.push([command, ...args].join(" "));
      if (command !== "git") {
        if (command === process.execPath && args.some((a) => a.endsWith("check"))) {
          expect(env?.["REPOOS_SKIP_TESTS"]).toBeUndefined();
          expect(env?.["REPOOS_REMOTE_VALIDATION_DONE"]).toBe("1");
        }
        return { code: 0, stdout: "check passed", stderr: "" };
      }
      if (["add", "commit", "push"].includes(args[0]) || (args[0] === "tag" && args[1] === "-a")) {
        return { code: 0, stdout: "", stderr: "" };
      }
      return git()("git", args, cfg.root);
    };
    const remoteValidator: RemoteValidator = {
      validate: async (): Promise<CheckSummary> => ({
        ok: false,
        stage: "check",
        transient: true,
        detail: "ssh connection dropped",
      }),
      reconcile: async () => {},
      dispose: async () => {},
      logPath: () => "/tmp/none.log",
    };
    const result = await cutNewRelease(cfg, "1.2.4", "v1.2.4", runner, undefined, remoteValidator);
    expect(result.ok).toBe(true);
  });
});

/** A `%x1e%H%x1f%h%x1f%s` + --name-only log chunk, one commit per record. */
function logChunk(
  entries: { sha: string; short: string; subject: string; paths?: string[] }[],
): string {
  return entries
    .map(
      (e) =>
        `\x1e${e.sha}\x1f${e.short}\x1f${e.subject}\n${(e.paths ?? []).map((p) => `${p}\n`).join("")}`,
    )
    .join("");
}

describe("AI-draftable release notes (#0361)", () => {
  it("collects commit subjects since the last reachable tag", async () => {
    const cfg = config();
    const runner: ReleaseCommandRunner = async (_command, args) => {
      const key = args.join(" ");
      if (key === "rev-parse HEAD") return { code: 0, stdout: "ffff0000\n", stderr: "" };
      if (key === "describe --tags --abbrev=0") return { code: 0, stdout: "v1.2.2\n", stderr: "" };
      if (key.startsWith("log v1.2.2..HEAD"))
        return {
          code: 0,
          stdout: logChunk([
            { sha: "aaaa0002", short: "ab1", subject: "add a feature", paths: ["src/b.ts"] },
            { sha: "aaaa0001", short: "cd1", subject: "fix a thing", paths: ["src/a.ts"] },
          ]),
          stderr: "",
        };
      return { code: 1, stdout: "", stderr: "" };
    };
    const result = await collectReleaseCommits(cfg, runner);
    expect(result.sinceTag).toBe("v1.2.2");
    expect(result.head).toBe("ffff0000");
    expect(result.commits).toEqual(["ab1 add a feature", "cd1 fix a thing"]);
    expect(result.relevantShas).toEqual(["aaaa0002", "aaaa0001"]);
    expect(result.truncated).toBe(false);
  });

  it("falls back to the full history when there is no previous release", async () => {
    const cfg = config();
    const runner: ReleaseCommandRunner = async (_command, args) => {
      const key = args.join(" ");
      if (key === "describe --tags --abbrev=0")
        return { code: 128, stdout: "", stderr: "No names found" };
      if (key.startsWith("log HEAD"))
        return {
          code: 0,
          stdout: logChunk([{ sha: "aaaa0003", short: "aa1", subject: "initial commit" }]),
          stderr: "",
        };
      return { code: 1, stdout: "", stderr: "" };
    };
    const result = await collectReleaseCommits(cfg, runner);
    expect(result.sinceTag).toBeNull();
    expect(result.commits).toEqual(["aa1 initial commit"]);
    expect(result.relevantShas).toEqual(["aaaa0003"]);
  });

  it("caps the commit list and flags truncation", async () => {
    const cfg = config();
    const many = Array.from({ length: 5 }, (_, i) => ({
      sha: `sha${i}000${i}`,
      short: `c${i}`,
      subject: `subject ${i}`,
      paths: [`src/f${i}`],
    }));
    const runner: ReleaseCommandRunner = async (_command, args) => {
      const key = args.join(" ");
      if (key === "describe --tags --abbrev=0") return { code: 0, stdout: "v1.0.0\n", stderr: "" };
      if (key.startsWith("log v1.0.0..HEAD"))
        return { code: 0, stdout: logChunk(many), stderr: "" };
      return { code: 1, stdout: "", stderr: "" };
    };
    const result = await collectReleaseCommits(cfg, runner, 3);
    expect(result.commits).toHaveLength(3);
    expect(result.relevantShas).toHaveLength(3);
    expect(result.truncated).toBe(true);
  });

  it("drops work-dir-only bookkeeping commits from the summary and the key (#0605)", async () => {
    const cfg = config(); // workDir: "work"
    const runner: ReleaseCommandRunner = async (_command, args) => {
      const key = args.join(" ");
      if (key === "describe --tags --abbrev=0") return { code: 0, stdout: "v1.2.2\n", stderr: "" };
      if (key.startsWith("log v1.2.2..HEAD"))
        return {
          code: 0,
          stdout: logChunk([
            // Newest first, as `git log` yields them. The two work-only
            // commits must vanish; the mixed one stays.
            {
              sha: "aaaa0005",
              short: "bk2",
              subject: "status flip",
              paths: ["work/other.md", "work/one/two.md"],
            },
            {
              sha: "aaaa0004",
              short: "mx1",
              subject: "moved task file + touched src",
              paths: ["work/0605.md", "src/b.ts"],
            },
            {
              sha: "aaaa0003",
              short: "bk1",
              subject: "docs(0605): add task",
              paths: ["work/0605.md"],
            },
            { sha: "aaaa0002", short: "ab1", subject: "feat: real change", paths: ["src/a.ts"] },
          ]),
          stderr: "",
        };
      return { code: 1, stdout: "", stderr: "" };
    };
    const result = await collectReleaseCommits(cfg, runner);
    // Newest first; the two work-only commits are gone.
    expect(result.commits).toEqual(["mx1 moved task file + touched src", "ab1 feat: real change"]);
    expect(result.relevantShas).toEqual(["aaaa0004", "aaaa0002"]);
  });

  it("keeps empty commits (they touch nothing, so they are not bookkeeping)", async () => {
    const cfg = config();
    const runner: ReleaseCommandRunner = async (_command, args) => {
      const key = args.join(" ");
      if (key === "describe --tags --abbrev=0") return { code: 1, stdout: "", stderr: "no tags" };
      if (key.startsWith("log HEAD"))
        return {
          code: 0,
          stdout: logChunk([
            { sha: "aaaa0007", short: "st1", subject: "real commit", paths: ["README.md"] },
            { sha: "aaaa0006", short: "em1", subject: "checkpoint marker" },
          ]),
          stderr: "",
        };
      return { code: 1, stdout: "", stderr: "" };
    };
    const result = await collectReleaseCommits(cfg, runner);
    expect(result.commits).toEqual(["st1 real commit", "em1 checkpoint marker"]);
    expect(result.relevantShas).toEqual(["aaaa0007", "aaaa0006"]);
  });

  it("builds a prompt naming the version, the range, and the commits", () => {
    const prompt = releaseNotesPrompt(["abc123 fix a thing"], {
      sinceTag: "v1.2.2",
      version: "1.2.3",
    });
    expect(prompt).toContain("1.2.3");
    expect(prompt).toContain("v1.2.2");
    expect(prompt).toContain("abc123 fix a thing");
  });

  it("writes supplied notes into the annotated tag body", async () => {
    const cfg = config();
    const calls: string[] = [];
    const runner: ReleaseCommandRunner = async (command, args) => {
      calls.push([command, ...args].join(" "));
      if (command !== "git") return { code: 0, stdout: "check passed", stderr: "" };
      if (["add", "commit", "push"].includes(args[0]) || (args[0] === "tag" && args[1] === "-a")) {
        return { code: 0, stdout: "", stderr: "" };
      }
      return git()("git", args, cfg.root);
    };
    const result = await cutNewRelease(
      cfg,
      "1.2.4",
      "v1.2.4",
      runner,
      undefined,
      undefined,
      "## Highlights\n- shiny",
    );
    expect(result.ok).toBe(true);
    // `--cleanup=verbatim` keeps the Markdown heading; the second -m is the body.
    expect(calls).toContain(
      "git tag -a v1.2.4 --cleanup=verbatim -m Release v1.2.4 -m ## Highlights\n- shiny",
    );
  });

  it("keeps the plain tag annotation when notes are empty or whitespace", async () => {
    const cfg = config();
    const calls: string[] = [];
    const runner: ReleaseCommandRunner = async (command, args) => {
      calls.push([command, ...args].join(" "));
      if (command !== "git") return { code: 0, stdout: "check passed", stderr: "" };
      if (["add", "commit", "push"].includes(args[0]) || (args[0] === "tag" && args[1] === "-a")) {
        return { code: 0, stdout: "", stderr: "" };
      }
      return git()("git", args, cfg.root);
    };
    const result = await cutNewRelease(
      cfg,
      "1.2.4",
      "v1.2.4",
      runner,
      undefined,
      undefined,
      "   \n  ",
    );
    expect(result.ok).toBe(true);
    expect(calls).toContain("git tag -a v1.2.4 -m Release v1.2.4");
  });
});

// ── POST /api/release/notes, exercised directly against the route handler
// (#0361 review: acceptance criterion #8 — usage recording — was previously
// only verified by the reviewer's manual read, not pinned by a test).
function realGit(root: string, args: string[]): void {
  execFileSync("git", args, { cwd: root, stdio: "ignore" });
}
function makeRes(): { capture: { statusCode: number; body: any }; res: unknown } {
  const capture = { statusCode: 0, body: undefined as any };
  const res = {
    writeHead: (status: number) => {
      capture.statusCode = status;
    },
    end: (data?: string) => {
      if (data) capture.body = JSON.parse(data);
    },
  };
  return { capture, res };
}
const makeReq = (body: unknown = {}) =>
  ({
    [Symbol.asyncIterator]: async function* () {
      yield Buffer.from(JSON.stringify(body), "utf8");
    },
  }) as unknown as never;

/** Route ctx with an emitEvent no-op (#0605 events aren't asserted here). */
const notesCtx = (cfg: RepoOSConfig) => ({ config: cfg, emitEvent: () => {} }) as unknown as never;

describe("POST /api/release/notes (route, #0361)", () => {
  afterEach(async () => {
    vi.mocked(runPrompt).mockReset();
    // Drain any detached draft run before the next test's fresh tmp root
    // (and its DB instance) takes over.
    await whenNotesRunSettles();
    // recordOneShotSession uses the process-global DB singleton (keyed by
    // whichever root first initialized it, ignoring the root on later
    // calls) — reset it so each test's fresh tmp root gets its own instance.
    resetDbInstance();
  });

  it("responds 400 without calling the agent when none is enabled", async () => {
    const disabled = { name: "pm", cli: "opencode", model: "default", enabled: false };
    const disabledEngineer = {
      name: "engineer",
      cli: "opencode",
      model: "default",
      enabled: false,
    };
    const cfg = { ...config(), agents: [disabled, disabledEngineer] } as RepoOSConfig;
    const { capture, res } = makeRes();
    await generateReleaseNotes(notesCtx(cfg), makeReq(), res as never, {});
    expect(capture.statusCode).toBe(400);
    expect(capture.body.error).toContain("No agent is enabled");
    expect(runPrompt).not.toHaveBeenCalled();
  });

  it("responds 200 with empty notes without calling the agent when there are no commits", async () => {
    const cfg = config(); // fresh temp dir, no .git — git commands fail, relevant: []
    const { capture, res } = makeRes();
    await generateReleaseNotes(notesCtx(cfg), makeReq(), res as never, {});
    expect(capture.statusCode).toBe(200);
    expect(capture.body).toEqual({ notes: "", sinceTag: null, commitCount: 0, truncated: false });
    expect(runPrompt).not.toHaveBeenCalled();
  });

  it("accepts the request with 202 + a running state, then the run succeeds and the draft is served", async () => {
    const cfg = config();
    realGit(cfg.root, ["init", "-q"]);
    realGit(cfg.root, ["config", "user.email", "t@example.com"]);
    realGit(cfg.root, ["config", "user.name", "Test"]);
    realGit(cfg.root, ["commit", "--allow-empty", "-m", "fix a thing"]);
    vi.mocked(runPrompt).mockResolvedValue({
      ok: true,
      output: "- Fixed a thing",
      elapsedMs: 500,
      totalTokens: 400,
      costUsd: 0.001,
    });

    const post = makeRes();
    await generateReleaseNotes(notesCtx(cfg), makeReq(), post.res as never, {});
    expect(post.capture.statusCode).toBe(202);
    expect(post.capture.body.run).toMatchObject({ state: "running", notes: null, error: null });

    await whenNotesRunSettles();
    const get = makeRes();
    await getReleaseNotesRun(notesCtx(cfg), makeReq(), get.res as never, {});
    expect(get.capture.statusCode).toBe(200);
    expect(get.capture.body).toMatchObject({
      state: "succeeded",
      notes: "- Fixed a thing",
      sinceTag: null,
      truncated: false,
      error: null,
    });

    // House rule: the one-shot call is recorded under sessionType
    // release-notes with a null taskId even from the detached run.
    const db = new RepoOSDb(cfg.root);
    const row = db.getSessionTypeStats().find((r) => r.sessionType === "release-notes");
    expect(row).toBeDefined();
    expect(row!.totalTokens).toBe(400);
    db.close();
  });

  it("surfaces the agent failure through the run state (and still records the session)", async () => {
    const cfg = config();
    realGit(cfg.root, ["init", "-q"]);
    realGit(cfg.root, ["config", "user.email", "t@example.com"]);
    realGit(cfg.root, ["config", "user.name", "Test"]);
    realGit(cfg.root, ["commit", "--allow-empty", "-m", "fix a thing"]);
    vi.mocked(runPrompt).mockResolvedValue({ ok: false, error: "mocked: agent timed out" });

    const post = makeRes();
    await generateReleaseNotes(notesCtx(cfg), makeReq(), post.res as never, {});
    expect(post.capture.statusCode).toBe(202);

    await whenNotesRunSettles();
    const get = makeRes();
    await getReleaseNotesRun(notesCtx(cfg), makeReq(), get.res as never, {});
    expect(get.capture.body).toMatchObject({
      state: "failed",
      error: "mocked: agent timed out",
      notes: null,
    });

    const db = new RepoOSDb(cfg.root);
    const row = db.getSessionTypeStats().find((r) => r.sessionType === "release-notes");
    expect(row).toBeDefined();
    db.close();
  });

  it("returns the existing run instead of spawning a second agent while one is in flight", async () => {
    const cfg = config();
    realGit(cfg.root, ["init", "-q"]);
    realGit(cfg.root, ["config", "user.email", "t@example.com"]);
    realGit(cfg.root, ["config", "user.name", "Test"]);
    realGit(cfg.root, ["commit", "--allow-empty", "-m", "fix a thing"]);
    let release!: (result: unknown) => void;
    vi.mocked(runPrompt).mockImplementation(
      () =>
        new Promise((resolve) => {
          release = resolve as (result: unknown) => void;
        }),
    );

    const first = makeRes();
    await generateReleaseNotes(notesCtx(cfg), makeReq(), first.res as never, {});
    expect(first.capture.statusCode).toBe(202);

    const second = makeRes();
    await generateReleaseNotes(notesCtx(cfg), makeReq(), second.res as never, {});
    // Same run handed back — one POST, one agent, one draft.
    expect(second.capture.statusCode).toBe(202);
    expect(second.capture.body.run.state).toBe("running");
    expect(runPrompt).toHaveBeenCalledTimes(1);

    release({ ok: true, output: "- Fixed a thing", elapsedMs: 5, totalTokens: 10, costUsd: 0 });
    await whenNotesRunSettles();
    const get = makeRes();
    await getReleaseNotesRun(notesCtx(cfg), makeReq(), get.res as never, {});
    expect(get.capture.body.state).toBe("succeeded");
    expect(runPrompt).toHaveBeenCalledTimes(1);
  });
});

// ── The AI-draft cache (#0590): a cut that fails its checks and is retried
// must not pay for the same release notes twice, only a successful draft may
// ever be stored — and (since #0605) bookkeeping-only commits on main must
// not invalidate a saved draft.

describe("POST /api/release/notes draft cache (#0590, #0605)", () => {
  afterEach(async () => {
    vi.mocked(runPrompt).mockReset();
    await whenNotesRunSettles();
    resetDbInstance();
  });

  /** A repo with `count` commits and no tags, so HEAD is the whole context. */
  function repoWithCommits(count = 1): RepoOSConfig {
    const cfg = config();
    realGit(cfg.root, ["init", "-q"]);
    realGit(cfg.root, ["config", "user.email", "t@example.com"]);
    realGit(cfg.root, ["config", "user.name", "Test"]);
    for (let i = 0; i < count; i++) {
      realGit(cfg.root, ["commit", "--allow-empty", "-m", `change ${i}`]);
    }
    return cfg;
  }

  function cacheFile(cfg: RepoOSConfig): string {
    return join(cfg.root, cfg.cacheDir, "release-notes.json");
  }

  function cachedEntries(cfg: RepoOSConfig): Record<string, { notes: string; head: string }> {
    const parsed = JSON.parse(readFileSync(cacheFile(cfg), "utf8")) as {
      entries: Record<string, { notes: string; head: string }>;
    };
    return parsed.entries;
  }

  function headOf(cfg: RepoOSConfig): string {
    return execFileSync("git", ["rev-parse", "HEAD"], { cwd: cfg.root, encoding: "utf8" }).trim();
  }

  /** Fire the POST, then settle the detached run and read the tracked state. */
  async function draft(cfg: RepoOSConfig) {
    const post = makeRes();
    await generateReleaseNotes(notesCtx(cfg), makeReq(), post.res as never, {});
    await whenNotesRunSettles();
    const get = makeRes();
    await getReleaseNotesRun(notesCtx(cfg), makeReq(), get.res as never, {});
    return { post: post.capture, run: get.capture.body as Record<string, unknown> };
  }

  /** Instant re-request — expects the synchronous cache-hit response. */
  async function recache(cfg: RepoOSConfig) {
    const post = makeRes();
    await generateReleaseNotes(notesCtx(cfg), makeReq(), post.res as never, {});
    return post.capture;
  }

  function agentDrafts(): void {
    vi.mocked(runPrompt).mockResolvedValue({
      ok: true,
      output: "- Fixed a thing",
      elapsedMs: 500,
      totalTokens: 400,
      costUsd: 0.001,
    });
  }

  it("stores a successful draft and serves it again without calling the agent", async () => {
    const cfg = repoWithCommits();
    agentDrafts();

    const first = await draft(cfg);
    expect(first.post.statusCode).toBe(202);
    expect(first.run).toMatchObject({ state: "succeeded", notes: "- Fixed a thing" });
    expect(existsSync(cacheFile(cfg))).toBe(true);

    const second = await recache(cfg);
    expect(second.statusCode).toBe(200);
    expect(second.body.cached).toBe(true);
    expect(second.body.cachedAt).toBeTruthy();
    expect(second.body.notes).toBe("- Fixed a thing");
    // One agent call, one recorded session: a hit never reaches runPrompt.
    expect(runPrompt).toHaveBeenCalledTimes(1);
  });

  it("cachedOnly answers a saved draft on a hit and never starts the agent on a miss", async () => {
    const cfg = repoWithCommits();
    agentDrafts();
    const lookup = async () => {
      const post = makeRes();
      await generateReleaseNotes(
        notesCtx(cfg),
        makeReq({ cachedOnly: true }),
        post.res as never,
        {},
      );
      return post.capture;
    };

    const miss = await lookup();
    expect(miss.statusCode).toBe(200);
    expect(miss.body.notes).toBe("");
    expect(miss.body.cached).toBeUndefined();
    expect(runPrompt).not.toHaveBeenCalled();

    await draft(cfg);
    const hit = await lookup();
    expect(hit.body).toMatchObject({ cached: true, notes: "- Fixed a thing" });
    expect(runPrompt).toHaveBeenCalledTimes(1);
  });

  it("regenerates once a source commit moves the relevant context, then serves the new draft from cache", async () => {
    const cfg = repoWithCommits();
    agentDrafts();

    await draft(cfg);
    expect(runPrompt).toHaveBeenCalledTimes(1);

    realGit(cfg.root, ["commit", "--allow-empty", "-m", "a genuinely new change"]);
    const changed = await draft(cfg);
    expect(changed.run.state).toBe("succeeded");
    expect((await recache(cfg)).body.cached).toBe(true);
    expect(runPrompt).toHaveBeenCalledTimes(2);
  });

  it("keeps the cached draft when a task-file-only commit lands on main (#0605)", async () => {
    const cfg = repoWithCommits();
    agentDrafts();
    await draft(cfg);
    expect(runPrompt).toHaveBeenCalledTimes(1);

    // The exact churn that used to force a regeneration: a `docs(NNNN): add
    // task` bookkeeping commit under the work dir moves HEAD but describes no
    // release content.
    mkdirSync(join(cfg.root, "work"), { recursive: true });
    writeFileSync(join(cfg.root, "work", "0605-x.md"), "task file\n");
    realGit(cfg.root, ["add", "work"]);
    realGit(cfg.root, ["commit", "-m", "docs(0605): add task"]);

    const reused = await recache(cfg);
    expect(reused.statusCode).toBe(200);
    expect(reused.body.cached).toBe(true);
    expect(reused.body.notes).toBe("- Fixed a thing");
    expect(runPrompt).toHaveBeenCalledTimes(1);
  });

  it("keeps a successful tracked run current after bookkeeping-only commits (#0630 review)", async () => {
    const cfg = repoWithCommits();
    agentDrafts();
    await draft(cfg);

    mkdirSync(join(cfg.root, "work"), { recursive: true });
    writeFileSync(join(cfg.root, "work", "0630-x.md"), "task file\n");
    realGit(cfg.root, ["add", "work"]);
    realGit(cfg.root, ["commit", "-m", "docs(0630): add task"]);

    const get = makeRes();
    await getReleaseNotesRun(notesCtx(cfg), makeReq(), get.res as never, {});
    expect(get.capture.body).toMatchObject({ state: "succeeded", stale: false });
  });

  it("marks a tracked run stale when sinceTag changes without a HEAD change (#0630 review)", async () => {
    const cfg = repoWithCommits(2);
    agentDrafts();
    await draft(cfg);
    const head = headOf(cfg);

    realGit(cfg.root, ["tag", "v0.9.0", "HEAD~1"]);
    expect(headOf(cfg)).toBe(head);

    const get = makeRes();
    await getReleaseNotesRun(notesCtx(cfg), makeReq(), get.res as never, {});
    expect(get.capture.body).toMatchObject({ state: "succeeded", stale: true });
  });

  it("invalidates the draft when a source commit moves the context even after bookkeeping", async () => {
    const cfg = repoWithCommits();
    agentDrafts();
    await draft(cfg);

    mkdirSync(join(cfg.root, "work"), { recursive: true });
    writeFileSync(join(cfg.root, "work", "0605-x.md"), "task file\n");
    realGit(cfg.root, ["add", "work"]);
    realGit(cfg.root, ["commit", "-m", "docs(0605): add task"]);
    expect((await recache(cfg)).body.cached).toBe(true);

    // One real source commit flips the key and pays for a fresh draft.
    writeFileSync(join(cfg.root, "src.ts"), "export {}\n");
    realGit(cfg.root, ["add", "src.ts"]);
    realGit(cfg.root, ["commit", "-m", "feat: the actual change"]);

    const fresh = await draft(cfg);
    expect(fresh.post.statusCode).toBe(202);
    expect(runPrompt).toHaveBeenCalledTimes(2);
    expect((await recache(cfg)).body.cached).toBe(true);
  });

  it("regenerates when a new tag shortens the range under an unchanged HEAD", async () => {
    const cfg = repoWithCommits(2);
    agentDrafts();

    const before = await draft(cfg);
    expect(before.run.sinceTag).toBeNull();

    // Same HEAD (no new source commit — the tag itself is the only change):
    // new range, so the old draft is stale even though the key's shas changed
    // only via the tag movement.
    realGit(cfg.root, ["tag", "v0.9.0", "HEAD~1"]);
    const after = await draft(cfg);
    expect(after.run.sinceTag).toBe("v0.9.0");
    expect(runPrompt).toHaveBeenCalledTimes(2);

    expect((await recache(cfg)).body.cached).toBe(true);
    expect(runPrompt).toHaveBeenCalledTimes(2);
  });

  it("stores nothing for a failed or empty agent run", async () => {
    const failed = repoWithCommits();
    vi.mocked(runPrompt).mockResolvedValue({ ok: false, error: "mocked: agent timed out" });
    const failedDraft = await draft(failed);
    expect(failedDraft.post.statusCode).toBe(202);
    expect(failedDraft.run.state).toBe("failed");
    expect(existsSync(cacheFile(failed))).toBe(false);

    const empty = repoWithCommits();
    vi.mocked(runPrompt).mockResolvedValue({ ok: true, output: "", elapsedMs: 5 });
    const emptyDraft = await draft(empty);
    expect(emptyDraft.run.state).toBe("failed");
    expect(emptyDraft.run.error).toContain("no release notes");
    expect(existsSync(cacheFile(empty))).toBe(false);
  });

  it("leaves a good entry in place when a later draft fails", async () => {
    const cfg = repoWithCommits();
    agentDrafts();
    await draft(cfg);
    const goodHead = headOf(cfg);

    realGit(cfg.root, ["commit", "--allow-empty", "-m", "one more change"]);
    vi.mocked(runPrompt).mockResolvedValue({ ok: false, error: "mocked: agent timed out" });
    expect((await draft(cfg)).run.state).toBe("failed");

    const entries = cachedEntries(cfg);
    expect(Object.keys(entries)).toHaveLength(1);
    // The stored draft still points at the commit context it was made from.
    expect(entries[Object.keys(entries)[0]].head).toBe(goodHead);
    expect(entries[Object.keys(entries)[0]].notes).toBe("- Fixed a thing");
  });
});
