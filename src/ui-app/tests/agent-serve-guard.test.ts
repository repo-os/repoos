/**
 * #0096 defense in depth — a managed agent process must never launch
 * `repoos serve` directly. The AgentRunner stamps every agent spawn with
 * REPOOS_AGENT=1; `directServeBlockedByAgent` then rejects a direct serve
 * attempt BEFORE it binds, so an accidental `repoos serve --port 7171` can
 * never grab the main server port. Preview children and reload replacements
 * (spawned by the main server, not by an agent) are exempt.
 */
import { describe, expect, it } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import { closeSync, mkdtempSync, openSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { directServeBlockedByAgent } from "../../commands/serve";

/**
 * Wall-clock budget for the real CLI child. A guard regression leaves a live
 * server, so fail on our own deadline with a readable message rather than
 * waiting for vitest's per-test timeout.
 */
const CHILD_DEADLINE_MS = 20_000;

describe("directServeBlockedByAgent (#0096 defense in depth)", () => {
  it("blocks a serve attempt from a managed agent process", () => {
    expect(
      directServeBlockedByAgent({
        REPOOS_AGENT: "1",
        REPOOS_TASK_ID: "0096",
        REPOOS_API_URL: "http://127.0.0.1:7171",
      }),
    ).toBe(true);
  });

  it("does not block when no agent marker is present", () => {
    expect(directServeBlockedByAgent({})).toBe(false);
    expect(directServeBlockedByAgent({ REPOOS_AGENT: "0" })).toBe(false);
    expect(directServeBlockedByAgent({ REPOOS_AGENT: undefined })).toBe(false);
  });

  it("exempts preview children spawned by the main server", () => {
    expect(
      directServeBlockedByAgent({
        REPOOS_AGENT: "1",
        REPOOS_PREVIEW_CHILD: "1",
      }),
    ).toBe(false);
  });

  it("exempts reload replacements spawned by the main server", () => {
    expect(
      directServeBlockedByAgent({
        REPOOS_AGENT: "1",
        REPOOS_RELOAD: "1",
      }),
    ).toBe(false);
  });

  it("exempts preview children even when they also carry the reload marker", () => {
    expect(
      directServeBlockedByAgent({
        REPOOS_AGENT: "1",
        REPOOS_PREVIEW_CHILD: "1",
        REPOOS_RELOAD: "1",
      }),
    ).toBe(false);
  });
});

describe("CLI rejection (real process)", () => {
  function cliEntry(): string {
    const here = dirname(fileURLToPath(import.meta.url)); // src/ui-app/tests
    return resolve(here, "..", "..", "..", "dist", "cli", "index.js");
  }

  interface ChildResult {
    code: number | null;
    signal: NodeJS.Signals | null;
    stderr: string;
    timedOut: boolean;
  }

  function runServe(root: string, port: number, env: Record<string, string>): Promise<ChildResult> {
    // A minimal, explicit child environment: everything the CLI needs to start
    // plus only the markers this test means to set. Inheriting the whole
    // process env was whack-a-mole — the control plane carries REPOOS_RELOAD /
    // REPOOS_PREVIEW_CHILD in its own environment for the lifetime of a
    // reload-started server, and either one exempts the child from the guard,
    // lets the real CLI bind a server, and hangs this test when the leak was
    // not scrubbed. With an explicit env the guard cannot be bypassed by
    // accident.
    const baseEnv: NodeJS.ProcessEnv = {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      TMPDIR: process.env.TMPDIR,
      LANG: process.env.LANG,
      // The serve guard is the subject here. Skip the CLI's build-staleness
      // re-exec so a runner whose `dist/` marker looks stale cannot turn this
      // into a multi-minute `bun run build` inside the test.
      REPOOS_STALENESS_REEXEC: "1",
    };
    // stderr goes to a FILE, not a pipe. On POSIX, writes to a pipe are
    // asynchronous; a child torn down on a memory-pressured runner can exit
    // before the guard's message flushes, which surfaced as a false failure on
    // empty stderr for an otherwise correct guard. File writes are
    // synchronous, so whatever the CLI managed to print survives the process.
    const stderrPath = join(root, "serve-stderr.log");
    const stderrFd = openSync(stderrPath, "w");
    let child: ChildProcess;
    try {
      child = spawn(
        process.execPath,
        [cliEntry(), "serve", "--port", String(port), "--host", "127.0.0.1"],
        {
          cwd: root,
          env: { ...baseEnv, ...env },
          stdio: ["ignore", "ignore", stderrFd],
        },
      );
    } finally {
      // The child holds its own duplicate; ours is no longer needed.
      closeSync(stderrFd);
    }

    return new Promise((resolvePromise) => {
      let spawnError = "";
      let timedOut = false;
      let settled = false;
      const finish = (code: number | null, signal: NodeJS.Signals | null): void => {
        if (settled) return;
        settled = true;
        clearTimeout(deadline);
        let stderr = "";
        try {
          stderr = readFileSync(stderrPath, "utf8");
        } catch {
          /* nothing captured */
        }
        resolvePromise({ code, signal, stderr: stderr + spawnError, timedOut });
      };
      const deadline = setTimeout(() => {
        timedOut = true;
        child.kill("SIGKILL");
      }, CHILD_DEADLINE_MS);
      child.on("error", (err) => {
        spawnError = `\n[spawn error] ${err.message}`;
        finish(null, null);
      });
      child.on("close", (code, signal) => finish(code, signal));
    });
  }

  it("rejects an agent's direct repoos serve and leaves the port free", async () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-guard-"));
    try {
      const { code, signal, stderr, timedOut } = await runServe(root, 0, {
        REPOOS_AGENT: "1",
        REPOOS_TASK_ID: "0096",
        REPOOS_API_URL: "http://127.0.0.1:7171",
      });
      // A regression leaves a bound server: fail fast with the captured output
      // instead of a bare timeout.
      expect(timedOut, `serve did not exit within ${CHILD_DEADLINE_MS}ms: ${stderr}`).toBe(false);
      expect(code, `exit ${code} (signal ${signal}): ${stderr}`).not.toBe(0);
      // Guidance points the agent at the managed preview — the one sanctioned
      // way to verify a UI.
      expect(stderr).toMatch(/may not launch `repoos serve`/i);
      expect(stderr).toMatch(/preview/i);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
