/**
 * Easter eggs bundle #1026 — init template paths, serve banner, CLI docs,
 * empty-repo git edge cases, quieter list, doc nits, schedule template warnings.
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { scaffoldInto } from "../../commands/init.js";
import {
  renderServeBanner,
  resolveServeHost,
  formatServeBindBannerValue,
} from "../../commands/serve.js";
import { collectStatus } from "../../commands/status.js";
import { cmdScheduleNew, cmdScheduleUpdate } from "../../commands/schedule.js";
import { NO_CHECK_PLAN_CLI_HINT } from "../../core/check-skip.js";
import { loadConfig } from "../../core/config.js";
import { runDoctor } from "../../core/doctor.js";
import { currentBranch, gitIdentityConfigured, isGitRepo } from "../../core/git.js";
import { findMissingAgentsMdPaths } from "../../core/project-docs.js";
import { scheduleTemplateWarning } from "../../core/schedule.js";

const REPO_ROOT = resolve(__dirname, "../../..");
const cliDoc = readFileSync(join(REPO_ROOT, "user-docs/cli.md"), "utf8");
const conceptsDoc = readFileSync(join(REPO_ROOT, "user-docs/concepts.md"), "utf8");

describe("easter eggs #1026", () => {
  const roots: string[] = [];
  afterEach(() => {
    for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true });
  });

  it("E1: fresh init AGENTS.md passes doctor path check", async () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-1026-init-"));
    roots.push(root);
    scaffoldInto(root, "demo", "", "new");
    const agents = readFileSync(join(root, "AGENTS.md"), "utf8");
    expect(findMissingAgentsMdPaths(root, agents)).toEqual([]);
    const report = await runDoctor({ root, probePort: 1, hasBinary: () => true });
    const agentsFinding = report.findings.find((f) => f.title.includes("AGENTS.md path"));
    expect(agentsFinding?.severity).not.toBe("warn");
  });

  it("E2: serve banner and resolveServeHost name bind interfaces", () => {
    expect(resolveServeHost(undefined).host).toBe("127.0.0.1");
    expect(resolveServeHost("0.0.0.0").tailscaleDetected).toBe(false);
    const plain = renderServeBanner("0.1.0", [
      { label: "Bind", value: formatServeBindBannerValue("127.0.0.1", false) },
      { label: "Local", value: "http://127.0.0.1:1" },
    ]);
    expect(plain).toContain("127.0.0.1 (localhost only)");
    expect(plain).toMatch(/Bind\s+127\.0\.0\.1/);
    const wide = renderServeBanner("0.1.0", [
      {
        label: "Bind",
        value: formatServeBindBannerValue("0.0.0.0", true),
      },
      { label: "Local", value: "http://127.0.0.1:1" },
    ]);
    expect(wide).toContain("0.0.0.0 (all interfaces");
    expect(wide).toContain("--host 127.0.0.1");
    expect(formatServeBindBannerValue("0.0.0.0", false)).toContain("explicit --host");
  });

  it("E3: cli.md documents uninstall, service, and version", () => {
    expect(cliDoc).toMatch(/### `repoos uninstall`/);
    expect(cliDoc).toMatch(/### `repoos service`/);
    expect(cliDoc).toMatch(/### `repoos --version`/);
  });

  it("E4: zero-commit repo reports branch and env-var git identity", async () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-1026-git-"));
    roots.push(root);
    mkdirSync(join(root, "work"), { recursive: true });
    writeFileSync(
      join(root, "repoos.toml"),
      'workDir = "work"\ndocsDir = "docs"\ncacheDir = ".repoos"\n',
    );
    const git = (args: string[]) =>
      spawnSync("git", ["-C", root, ...args], { encoding: "utf8" }).stdout.trim();
    git(["init", "-q"]);
    expect(isGitRepo(root)).toBe(true);
    expect(currentBranch(root)).toBe(git(["symbolic-ref", "--short", "HEAD"]));
    expect(
      gitIdentityConfigured(root, {
        GIT_AUTHOR_NAME: "T",
        GIT_AUTHOR_EMAIL: "t@e.com",
        GIT_COMMITTER_NAME: "T",
        GIT_COMMITTER_EMAIL: "t@e.com",
      }),
    ).toBe(true);

    const snap = await collectStatus(loadConfig(root), { probeTimeoutMs: 200, probePort: 1 });
    expect(snap.git.branch).toBeTruthy();
  });

  it("E5: list API fallback prints one short server line", async () => {
    vi.resetModules();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { cmdList } = await import("../../commands/tasks.js");
    const root = mkdtempSync(join(tmpdir(), "repoos-1026-list-"));
    roots.push(root);
    mkdirSync(join(root, "work"), { recursive: true });
    writeFileSync(
      join(root, "repoos.toml"),
      'workDir = "work"\ndocsDir = "docs"\ncacheDir = ".repoos"\n',
    );
    writeFileSync(
      join(root, "work/0001-test.md"),
      '---\nid: "0001"\ntitle: T\nstatus: inbox\npriority: p2\n---\n',
    );
    const prev = process.cwd();
    process.chdir(root);
    try {
      await cmdList();
    } finally {
      process.chdir(prev);
    }
    expect(warn.mock.calls.some((c) => String(c[0]).includes("Server unavailable"))).toBe(true);
    expect(
      warn.mock.calls.some((c) => String(c[0]).includes("Can't reach the RepoOS server at")),
    ).toBe(false);
    warn.mockRestore();
  });

  it("E6: check hint and concepts doc mention URL and runtime db", () => {
    expect(NO_CHECK_PLAN_CLI_HINT).toContain("https://docs.repoos.org/check");
    expect(NO_CHECK_PLAN_CLI_HINT).not.toContain("user-docs/check.md");
    expect(conceptsDoc).toContain("repoos.db");
    expect(conceptsDoc).toContain("no separate board");
  });

  it("E7: schedule template warnings for incomplete and human assignee", () => {
    const incomplete = scheduleTemplateWarning({ body: "## Purpose\nOnly this.\n" });
    expect(incomplete).toMatch(/missing sections/i);
    const pad = "Substantive schedule template body text. ".repeat(12);
    const complete = scheduleTemplateWarning({
      body: [
        "## Problem",
        pad,
        "## Desired UX",
        pad,
        "## Acceptance criteria",
        "- [ai] Automated check passes.",
        "## Notes for AI",
        pad,
      ].join("\n\n"),
    });
    expect(complete).toBeNull();
    expect(
      scheduleTemplateWarning({
        body: "",
        taskAssignedTo: "human",
      }),
    ).toBeNull();
    expect(scheduleTemplateWarning({ body: "", taskAssignedTo: "ai" })).not.toBeNull();
  });

  it("E7: schedule CLI prints template warning on new and update", () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-1026-sched-"));
    roots.push(root);
    mkdirSync(join(root, "work"), { recursive: true });
    mkdirSync(join(root, "schedules"), { recursive: true });
    writeFileSync(
      join(root, "repoos.toml"),
      'workDir = "work"\ndocsDir = "docs"\ncacheDir = ".repoos"\nschedulesDir = "schedules"\n',
    );
    const prev = process.cwd();
    const logs: string[] = [];
    const logSpy = vi.spyOn(console, "log").mockImplementation((...a) => {
      logs.push(a.map(String).join(" "));
    });
    process.chdir(root);
    try {
      cmdScheduleNew([
        "--title",
        "Incomplete",
        "--task-title",
        "Run",
        "--cadence",
        "daily",
        "--timezone",
        "UTC",
        "--time-of-day",
        "09:00",
        "--body",
        "## Purpose\nOnly",
      ]);
      expect(logs.some((l) => l.includes("schedule template is underspecified"))).toBe(true);
      const beforeUpdate = logs.length;
      const pad = "Substantive schedule template body text. ".repeat(12);
      const completeBody = [
        "## Problem",
        pad,
        "## Desired UX",
        pad,
        "## Acceptance criteria",
        "- [ai] Automated check passes.",
        "## Notes for AI",
        pad,
      ].join("\n\n");
      cmdScheduleUpdate(["0001", "--body", completeBody]);
      expect(
        logs.slice(beforeUpdate).some((l) => l.includes("schedule template is underspecified")),
      ).toBe(false);
    } finally {
      process.chdir(prev);
      logSpy.mockRestore();
    }
  });
});
