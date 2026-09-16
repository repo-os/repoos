import { afterEach, describe, expect, it, vi } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RepoOSConfig } from "../../core/types";
import type { RemoteValidator, CheckSummary } from "../../server/remote-validation";
import { cutNewRelease, getReleaseStatus, type ReleaseCommandRunner } from "../../server/release";
import { collectReleaseCommits, releaseNotesPrompt } from "../../server/release";
import { generateReleaseNotes } from "../../server/routes/release.js";
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
    const calls: string[] = [];
    const runner: ReleaseCommandRunner = async (command, args, _cwd, _timeout, env) => {
      calls.push([command, ...args].join(" "));
      if (command !== "git") {
        if (command === process.execPath && args.some((a) => a.endsWith("check")))
          expect(env?.["REPOOS_SKIP_TESTS"]).toBe("1");
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
    expect(calls.some((c) => c === "git rev-parse HEAD")).toBe(true);
  });

  it("does not call the remote runner when useForReleases is unset", async () => {
    const cfg: RepoOSConfig = {
      ...config(),
      remoteValidation: { enabled: true, useForReleases: false },
    };
    let called = false;
    const runner: ReleaseCommandRunner = async (command, args) => {
      if (command !== "git") return { code: 0, stdout: "check passed", stderr: "" };
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
    const calls: string[] = [];
    const runner: ReleaseCommandRunner = async (command, args, _cwd, _timeout, env) => {
      calls.push([command, ...args].join(" "));
      if (command !== "git") {
        if (command === process.execPath && args.some((a) => a.endsWith("check")))
          expect(env?.["REPOOS_SKIP_TESTS"]).toBeUndefined();
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
    expect(calls.some((c) => c === "git rev-parse HEAD")).toBe(true);
  });
});

describe("AI-draftable release notes (#0361)", () => {
  it("collects commit subjects since the last reachable tag", async () => {
    const cfg = config();
    const runner: ReleaseCommandRunner = async (_command, args) => {
      const key = args.join(" ");
      if (key === "describe --tags --abbrev=0") return { code: 0, stdout: "v1.2.2\n", stderr: "" };
      if (key.startsWith("log v1.2.2..HEAD"))
        return { code: 0, stdout: "abc123 fix a thing\ndef456 add a feature\n", stderr: "" };
      return { code: 1, stdout: "", stderr: "" };
    };
    const result = await collectReleaseCommits(cfg, runner);
    expect(result.sinceTag).toBe("v1.2.2");
    expect(result.commits).toEqual(["abc123 fix a thing", "def456 add a feature"]);
    expect(result.truncated).toBe(false);
  });

  it("falls back to the full history when there is no previous release", async () => {
    const cfg = config();
    const runner: ReleaseCommandRunner = async (_command, args) => {
      const key = args.join(" ");
      if (key === "describe --tags --abbrev=0")
        return { code: 128, stdout: "", stderr: "No names found" };
      if (key.startsWith("log HEAD"))
        return { code: 0, stdout: "aaa initial commit\n", stderr: "" };
      return { code: 1, stdout: "", stderr: "" };
    };
    const result = await collectReleaseCommits(cfg, runner);
    expect(result.sinceTag).toBeNull();
    expect(result.commits).toEqual(["aaa initial commit"]);
  });

  it("caps the commit list and flags truncation", async () => {
    const cfg = config();
    const many = Array.from({ length: 5 }, (_, i) => `c${i} subject ${i}`).join("\n");
    const runner: ReleaseCommandRunner = async (_command, args) => {
      const key = args.join(" ");
      if (key === "describe --tags --abbrev=0") return { code: 0, stdout: "v1.0.0\n", stderr: "" };
      if (key.startsWith("log v1.0.0..HEAD")) return { code: 0, stdout: `${many}\n`, stderr: "" };
      return { code: 1, stdout: "", stderr: "" };
    };
    const result = await collectReleaseCommits(cfg, runner, 3);
    expect(result.commits).toHaveLength(3);
    expect(result.truncated).toBe(true);
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
describe("POST /api/release/notes (route, #0361)", () => {
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

  afterEach(() => {
    vi.mocked(runPrompt).mockReset();
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
    await generateReleaseNotes({ config: cfg } as never, makeReq(), res as never, {});
    expect(capture.statusCode).toBe(400);
    expect(capture.body.error).toContain("No agent is enabled");
    expect(runPrompt).not.toHaveBeenCalled();
  });

  it("responds 200 with empty notes without calling the agent when there are no commits", async () => {
    const cfg = config(); // fresh temp dir, no .git — git commands fail, commits: []
    const { capture, res } = makeRes();
    await generateReleaseNotes({ config: cfg } as never, makeReq(), res as never, {});
    expect(capture.statusCode).toBe(200);
    expect(capture.body).toEqual({ notes: "", sinceTag: null, commitCount: 0, truncated: false });
    expect(runPrompt).not.toHaveBeenCalled();
  });

  it("records the one-shot session usage under sessionType release-notes with a null taskId", async () => {
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

    const { capture, res } = makeRes();
    await generateReleaseNotes({ config: cfg } as never, makeReq(), res as never, {});

    expect(capture.statusCode).toBe(200);
    expect(capture.body.notes).toBe("- Fixed a thing");
    expect(runPrompt).toHaveBeenCalledTimes(1);

    const db = new RepoOSDb(cfg.root);
    const row = db.getSessionTypeStats().find((r) => r.sessionType === "release-notes");
    expect(row).toBeDefined();
    expect(row!.totalTokens).toBe(400);
    db.close();
  });

  it("still records the session (as errored) and responds 502 when the agent run fails", async () => {
    const cfg = config();
    realGit(cfg.root, ["init", "-q"]);
    realGit(cfg.root, ["config", "user.email", "t@example.com"]);
    realGit(cfg.root, ["config", "user.name", "Test"]);
    realGit(cfg.root, ["commit", "--allow-empty", "-m", "fix a thing"]);
    vi.mocked(runPrompt).mockResolvedValue({ ok: false, error: "mocked: agent timed out" });

    const { capture, res } = makeRes();
    await generateReleaseNotes({ config: cfg } as never, makeReq(), res as never, {});

    expect(capture.statusCode).toBe(502);
    const db = new RepoOSDb(cfg.root);
    const row = db.getSessionTypeStats().find((r) => r.sessionType === "release-notes");
    expect(row).toBeDefined();
    db.close();
  });
});
