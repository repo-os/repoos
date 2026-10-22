/**
 * `repoos runners check` and `repoos runners setup` (#0915).
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { findRepoRoot, loadConfig } from "../core/config.js";
import { resolveRemoteHosts, remoteHostUser } from "../core/remote-hosts.js";
import {
  buildRunnerEngineerHostReport,
  declaredEngineerClis,
  normalizeRunnerEngineerCliId,
  parseRunnerEngineerProbeOutput,
  runnerEngineerLoginSshCommand,
  runnerEngineerProbeCommand,
  runnerEngineerSetupCommand,
  type RunnerEngineerCliId,
  type RunnerEngineerHostReport,
} from "../core/runner-engineer-clis.js";
import type { RemoteValidationHost } from "../core/types.js";
import { sshTransferArgs } from "../server/bundle-upload.js";
import { c } from "../cli/colors.js";

function printJson(data: unknown): void {
  console.log(JSON.stringify(data, null, 2));
}

function printErr(message: string): void {
  console.error(c.red("  ✗ ") + message);
}

function parseCommonFlags(args: string[]): {
  rest: string[];
  opts: { json: boolean; port?: number };
  error?: string;
} {
  const opts = { json: false as boolean, port: undefined as number | undefined };
  const rest: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--json") opts.json = true;
    else if (a === "--port") {
      const p = args[++i];
      const n = Number(p);
      if (!p || !Number.isInteger(n) || n <= 0)
        return { rest, opts, error: "--port requires a positive integer" };
      opts.port = n;
    } else rest.push(a);
  }
  return { rest, opts };
}

const PROBE_TIMEOUT_MS = 45_000;
const SETUP_TIMEOUT_MS = 600_000;

export interface RunnerSshHost {
  ip: string;
  user: string;
  keyPath?: string;
}

export type RunRemoteFn = (
  host: RunnerSshHost,
  command: string,
  timeoutMs: number,
) => Promise<{ code: number | null; output: string; timedOut: boolean }>;

export function defaultRunRemote(): RunRemoteFn {
  return (host, command, timeoutMs) =>
    new Promise((resolve) => {
      const args = [...sshTransferArgs(host), `${host.user}@${host.ip}`, command];
      const child = spawn("ssh", args, { stdio: ["ignore", "pipe", "pipe"] });
      let output = "";
      let settled = false;
      const done = (code: number | null, timedOut: boolean): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve({ code, output, timedOut });
      };
      const timer = setTimeout(() => {
        try {
          child.kill("SIGKILL");
        } catch {
          /* gone */
        }
        done(null, true);
      }, timeoutMs);
      child.stdout?.on("data", (b: Buffer) => {
        output += b.toString("utf8");
      });
      child.stderr?.on("data", (b: Buffer) => {
        output += b.toString("utf8");
      });
      child.on("error", () => done(null, false));
      child.on("exit", (code) => done(code, false));
    });
}

function sshHostFor(
  rv: NonNullable<ReturnType<typeof loadConfig>["remoteValidation"]>,
  spec: RemoteValidationHost,
  keyPath?: string,
): RunnerSshHost {
  return {
    ip: spec.host,
    user: remoteHostUser(rv, spec),
    keyPath,
  };
}

function allProbeClis(hosts: RemoteValidationHost[]): RunnerEngineerCliId[] {
  const set = new Set<RunnerEngineerCliId>();
  for (const h of hosts) {
    for (const cli of declaredEngineerClis(h)) set.add(cli);
  }
  return [...set];
}

export async function checkRunnerEngineerClis(opts: {
  root?: string;
  runRemote?: RunRemoteFn;
  keyPath?: string;
}): Promise<{ reports: RunnerEngineerHostReport[]; ok: boolean }> {
  const root = opts.root ?? findRepoRoot();
  const config = loadConfig(root);
  const rv = config.remoteValidation;
  if (!rv) return { reports: [], ok: true };
  const hosts = resolveRemoteHosts(rv);
  const runRemote = opts.runRemote ?? defaultRunRemote();
  const keyPath = opts.keyPath;
  const reports: RunnerEngineerHostReport[] = [];
  let ok = true;

  for (const spec of hosts) {
    const declared = declaredEngineerClis(spec);
    if (!declared.length) continue;
    const ssh = sshHostFor(rv, spec, keyPath);
    const res = await runRemote(ssh, runnerEngineerProbeCommand(declared), PROBE_TIMEOUT_MS);
    const lines = res.code === 0 && !res.timedOut ? parseRunnerEngineerProbeOutput(res.output) : [];
    const report = buildRunnerEngineerHostReport(spec, rv, lines, new Date().toISOString());
    if (!report.ok) ok = false;
    if (res.timedOut) {
      ok = false;
      for (const cell of report.cells) {
        if (cell.declared && cell.ok) {
          cell.ok = false;
          cell.auth = "unknown";
          cell.detail = "ssh probe timed out";
        }
      }
      report.ok = false;
    } else if (res.code !== 0 && lines.length === 0) {
      ok = false;
      for (const cell of report.cells) {
        if (cell.declared) {
          cell.ok = false;
          cell.auth = "unknown";
          cell.detail = cell.detail ?? "ssh probe failed";
        }
      }
      report.ok = false;
    }
    reports.push(report);
  }
  return { reports, ok };
}

export function formatRunnerEngineerCheckTable(reports: RunnerEngineerHostReport[]): string {
  const lines: string[] = [];
  lines.push(c.dim("  engineer CLIs (declared hosts only)"));
  for (const r of reports) {
    lines.push(`  ${r.host} (${r.user})`);
    for (const cell of r.cells.filter((x) => x.declared)) {
      const state = cell.ok
        ? c.green("ok")
        : !cell.installed
          ? c.red("missing")
          : cell.auth === "not-signed-in"
            ? c.red("not signed in")
            : c.red("unknown");
      const ver = cell.version ? c.dim(` · ${cell.version}`) : "";
      const detail = cell.detail ? c.dim(` · ${cell.detail}`) : "";
      lines.push(`    ${cell.cli.padEnd(10)} ${state}${ver}${detail}`);
      if (!cell.ok && cell.fix) lines.push(c.yellow(`      fix: ${cell.fix}`));
    }
  }
  if (!reports.length) {
    lines.push(c.dim("  (no host declares engineers = […] in repoos.toml)"));
  }
  return lines.join("\n");
}

export async function setupRunnerEngineerClis(opts: {
  host: string;
  loginCli?: string;
  root?: string;
  runRemote?: RunRemoteFn;
  keyPath?: string;
  interactiveLogin?: (command: string) => Promise<number>;
}): Promise<number> {
  const root = opts.root ?? findRepoRoot();
  const config = loadConfig(root);
  const rv = config.remoteValidation;
  if (!rv) {
    printErr("remoteValidation is not configured");
    return 1;
  }
  const hosts = resolveRemoteHosts(rv);
  const spec = hosts.find((h) => h.host === opts.host);
  if (!spec) {
    printErr(`Host "${opts.host}" is not in the remoteValidation pool`);
    return 1;
  }
  const declared = declaredEngineerClis(spec);
  if (!declared.length) {
    printErr(
      `Host "${opts.host}" has no engineers = […] on its [[remoteValidation.tailscaleHosts]] row`,
    );
    return 1;
  }

  const loginCli = opts.loginCli ? normalizeRunnerEngineerCliId(opts.loginCli) : null;
  if (opts.loginCli && !loginCli) {
    printErr(`Unknown CLI "${opts.loginCli}" — use opencode, codex, or cursor`);
    return 1;
  }

  if (loginCli) {
    const cmd = runnerEngineerLoginSshCommand(rv, spec, loginCli);
    console.log(c.dim("  opening interactive login (RepoOS never sees credentials):"));
    console.log(`  ${cmd}`);
    const run = opts.interactiveLogin ?? runInteractiveShell;
    return await run(cmd);
  }

  const runRemote = opts.runRemote ?? defaultRunRemote();
  const ssh = sshHostFor(rv, spec, opts.keyPath);
  console.log(c.dim(`  installing declared CLIs on ${opts.host}…`));
  const installRes = await runRemote(ssh, runnerEngineerSetupCommand(declared), SETUP_TIMEOUT_MS);
  if (installRes.output.trim()) console.log(installRes.output.trimEnd());

  const check = await checkRunnerEngineerClis({
    root,
    runRemote,
    keyPath: opts.keyPath,
  });
  const report = check.reports.find((r) => r.host === opts.host);
  if (report) {
    for (const cell of report.cells) {
      if (cell.declared && cell.installed && cell.auth !== "signed-in" && cell.fix) {
        const loginLine = runnerEngineerLoginSshCommand(rv, spec, cell.cli);
        console.log(c.yellow(`  ${cell.cli}: sign in on the runner:`));
        console.log(`    ${loginLine}`);
      }
    }
  }
  return installRes.code === 0 && !installRes.timedOut ? (check.ok ? 0 : 1) : 1;
}

function runInteractiveShell(command: string): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn(command, { shell: true, stdio: "inherit" });
    child.on("exit", (code) => resolve(code ?? 1));
    child.on("error", () => resolve(1));
  });
}

export async function cmdRunnersCheck(args: string[]): Promise<number> {
  const { opts, error } = parseCommonFlags(args.filter((a) => a !== "check"));
  if (error) {
    printErr(error);
    return 1;
  }
  const keyPath = process.env.REPOOS_REMOTE_SSH_KEY;
  const { reports, ok } = await checkRunnerEngineerClis({
    keyPath: keyPath && existsSync(keyPath) ? keyPath : undefined,
  });
  if (opts.json) printJson({ ok, reports });
  else console.log(formatRunnerEngineerCheckTable(reports));
  return ok ? 0 : 1;
}

export async function cmdRunnersSetup(args: string[]): Promise<number> {
  const { rest, opts, error } = parseCommonFlags(args.filter((a) => a !== "setup"));
  if (error) {
    printErr(error);
    return 1;
  }
  let loginCli: string | undefined;
  const positional: string[] = [];
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === "--login") loginCli = rest[++i];
    else positional.push(rest[i]!);
  }
  const host = positional[0];
  if (!host) {
    printErr("Usage: repoos runners setup <host> [--login <cli>]");
    return 1;
  }
  const keyPath = process.env.REPOOS_REMOTE_SSH_KEY;
  const code = await setupRunnerEngineerClis({
    host,
    loginCli,
    keyPath: keyPath && existsSync(keyPath) ? keyPath : undefined,
  });
  if (opts.json) printJson({ host, loginCli: loginCli ?? null, exitCode: code });
  return code;
}
