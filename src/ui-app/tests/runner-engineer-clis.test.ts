import { afterEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "../../core/config.js";
import { resolveRemoteHosts } from "../../core/remote-hosts.js";
import {
  RUNNER_ENGINEER_CLI_PROBE_TOKEN,
  buildRunnerEngineerHostReport,
  declaredEngineerClis,
  parseRunnerEngineerProbeOutput,
  redactRunnerEngineerProbeOutput,
  runnerEngineerProbeCommand,
  type RunnerEngineerCliId,
} from "../../core/runner-engineer-clis.js";
import {
  checkRunnerEngineerClis,
  type RunRemoteFn,
  type RunnerSshHost,
} from "../../commands/runner-engineer.js";

const roots: string[] = [];
function tmpRoot(): string {
  const dir = mkdtempSync(join(tmpdir(), "repoos-runner-ec-"));
  roots.push(dir);
  return dir;
}
afterEach(() => {
  for (const r of roots) rmSync(r, { recursive: true, force: true });
  roots.length = 0;
});

function fakeProbeOutput(
  lines: Array<{
    cli: RunnerEngineerCliId;
    installed: boolean;
    version?: string;
    auth: "signed-in" | "not-signed-in" | "unknown";
    detail?: string;
  }>,
): string {
  return [RUNNER_ENGINEER_CLI_PROBE_TOKEN, ...lines.map((l) => JSON.stringify(l))].join("\n");
}

describe("runner engineer CLI probe parsing (#0915)", () => {
  it("parses probe lines after the token", () => {
    const out = fakeProbeOutput([
      {
        cli: "opencode",
        installed: true,
        version: "1.2.3",
        auth: "signed-in",
        detail: "opencode-go",
      },
    ]);
    expect(parseRunnerEngineerProbeOutput(out)).toEqual([
      {
        cli: "opencode",
        installed: true,
        version: "1.2.3",
        auth: "signed-in",
        detail: "opencode-go",
      },
    ]);
  });

  it("redacts token-shaped secrets from probe output", () => {
    const leaky = fakeProbeOutput([
      {
        cli: "codex",
        installed: true,
        auth: "signed-in",
        detail: "sk-proj-abcdefghijklmnopqrstuvwxyz123456",
      },
    ]);
    const redacted = redactRunnerEngineerProbeOutput(leaky);
    expect(redacted).not.toContain("sk-proj-abcdefghijklmnopqrstuvwxyz123456");
    expect(redacted).toContain("[redacted]");
    const parsed = parseRunnerEngineerProbeOutput(redacted);
    expect(parsed[0]?.detail).toContain("[redacted]");
  });

  it("marks declared cells red when missing, not signed in, or unknown", () => {
    const report = buildRunnerEngineerHostReport(
      { host: "bee", engineers: ["opencode", "codex", "cursor"] },
      undefined,
      [
        {
          cli: "opencode",
          installed: true,
          version: "v1",
          auth: "signed-in",
          detail: "opencode-go",
        },
        { cli: "codex", installed: false, auth: "unknown", detail: "not on PATH" },
        {
          cli: "cursor",
          installed: true,
          version: "0.9",
          auth: "not-signed-in",
          detail: "cursor-agent status",
        },
      ],
    );
    expect(report.ok).toBe(false);
    expect(report.cells.find((c) => c.cli === "opencode")?.ok).toBe(true);
    expect(report.cells.find((c) => c.cli === "codex")?.fix).toContain("npm install");
    expect(report.cells.find((c) => c.cli === "cursor")?.auth).toBe("not-signed-in");
  });
});

describe("declaredEngineerClis config", () => {
  it("reads engineers from [[remoteValidation.tailscaleHosts]] rows", () => {
    const root = tmpRoot();
    writeFileSync(
      join(root, "repoos.toml"),
      "[[remoteValidation.tailscaleHosts]]\n" +
        'host = "bee"\n' +
        'engineers = ["opencode", "codex"]\n',
    );
    const hosts = resolveRemoteHosts(loadConfig(root).remoteValidation);
    expect(declaredEngineerClis(hosts[0]!)).toEqual(["opencode", "codex"]);
  });
});

describe("checkRunnerEngineerClis with fake remote", () => {
  it("exits non-zero when a declared cell is red", async () => {
    const root = tmpRoot();
    writeFileSync(
      join(root, "repoos.toml"),
      '[remoteValidation]\nprovider = "tailscale"\n\n' +
        "[[remoteValidation.tailscaleHosts]]\n" +
        'host = "bee"\n' +
        'engineers = ["opencode"]\n',
    );
    const runRemote: RunRemoteFn = async (_host: RunnerSshHost, _cmd: string) => ({
      code: 0,
      timedOut: false,
      output: fakeProbeOutput([
        { cli: "opencode", installed: true, auth: "not-signed-in", detail: "models probe" },
      ]),
    });
    const { ok, reports } = await checkRunnerEngineerClis({ root, runRemote });
    expect(ok).toBe(false);
    expect(reports[0]?.cells[0]?.auth).toBe("not-signed-in");
  });

  it("fakebin-style states per CLI", async () => {
    const states: Record<RunnerEngineerCliId, "signed-in" | "not-signed-in" | "missing"> = {
      opencode: "signed-in",
      codex: "not-signed-in",
      cursor: "missing",
    };
    const root = tmpRoot();
    writeFileSync(
      join(root, "repoos.toml"),
      "[[remoteValidation.tailscaleHosts]]\n" +
        'host = "thinkpad"\n' +
        'engineers = ["opencode", "codex", "cursor"]\n',
    );
    const runRemote: RunRemoteFn = async () => ({
      code: 0,
      timedOut: false,
      output: fakeProbeOutput(
        (["opencode", "codex", "cursor"] as RunnerEngineerCliId[]).map((cli) => {
          const st = states[cli];
          if (st === "missing") {
            return { cli, installed: false, auth: "unknown" as const, detail: "not on PATH" };
          }
          return {
            cli,
            installed: true,
            version: "fake",
            auth: st,
            detail: st === "signed-in" ? "provider" : "auth",
          };
        }),
      ),
    });
    const { reports } = await checkRunnerEngineerClis({ root, runRemote });
    expect(reports[0]?.ok).toBe(false);
    expect(runnerEngineerProbeCommand(["opencode", "codex"])).toContain("opencode models");
    expect(runnerEngineerProbeCommand(["opencode"])).not.toContain("auth list");
  });
});
