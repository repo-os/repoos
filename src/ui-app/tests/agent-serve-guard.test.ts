/**
 * #0096 defense in depth — a managed agent process must never launch
 * `repoos serve` directly. The AgentRunner stamps every agent spawn with
 * REPOOS_AGENT=1; `directServeBlockedByAgent` then rejects a direct serve
 * attempt BEFORE it binds, so an accidental `repoos serve --port 7171` can
 * never grab the main server port. Preview children and reload replacements
 * (spawned by the main server, not by an agent) are exempt.
 */
import { describe, expect, it } from "vitest";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { directServeBlockedByAgent } from "../../commands/serve";

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

  function runServe(
    root: string,
    port: number,
    env: Record<string, string>,
  ): Promise<{ code: number | null; stdout: string; stderr: string }> {
    return new Promise((resolve) => {
      const child = spawn(
        process.execPath,
        [cliEntry(), "serve", "--port", String(port), "--host", "127.0.0.1"],
        { cwd: root, env: { ...process.env, ...env } },
      );
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (c: Buffer) => (stdout += c.toString("utf8")));
      child.stderr.on("data", (c: Buffer) => (stderr += c.toString("utf8")));
      child.on("close", (code) => resolve({ code, stdout, stderr }));
    });
  }

  it("rejects an agent's direct repoos serve and leaves the port free", async () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-guard-"));
    try {
      const { code, stderr } = await runServe(root, 0, {
        REPOOS_AGENT: "1",
        REPOOS_TASK_ID: "0096",
        REPOOS_API_URL: "http://127.0.0.1:7171",
      });
      expect(code).not.toBe(0);
      // Guidance points the agent at the managed preview — the one sanctioned
      // way to verify a UI.
      expect(stderr).toMatch(/may not launch `repoos serve`/i);
      expect(stderr).toMatch(/preview/i);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
