import { mkdir, readFile, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { hubLaunchComponent } from "./launch-component.js";

export const APP_ID_BASE = "org.repoos.mobile";
export const APP_ID_SUFFIX = ".dev";
export const ACTIVITY_CLASS = "org.repoos.mobile.MainActivity";
export const APP_ID = `${APP_ID_BASE}${APP_ID_SUFFIX}`;
export const SCAN_FROM = 30_000;
export const SCAN_TO = 49_999;

export const PHONE_CONFIG_REL = ".config/repoos-hub/phone";

export type DeployFlags = { build: boolean; scan: boolean };

export type PhoneTarget = { ip: string; port: string };

export type AdbExec = (
  args: string[],
  opts?: { serial?: string; timeoutMs?: number },
) => Promise<{ stdout: string; stderr: string; exitCode: number }>;

export type DeployDeps = {
  repoRoot: string;
  homeDir: string;
  env: NodeJS.ProcessEnv;
  log: (msg: string) => void;
  die: (msg: string, code?: number) => never;
  adbExec: AdbExec;
  sleep: (ms: number) => Promise<void>;
  pathExists: (path: string) => Promise<boolean>;
  readText: (path: string) => Promise<string>;
  writeText: (path: string, body: string) => Promise<void>;
  buildApk?: () => Promise<void>;
  commandExists: (name: string) => Promise<boolean>;
  scanOpenTcpPorts: (ip: string, from: number, to: number) => Promise<number[]>;
  gitShortHead: () => Promise<string>;
};

export function phoneConfigPath(homeDir: string): string {
  return join(homeDir, PHONE_CONFIG_REL);
}

export function resolvePhoneTarget(
  env: NodeJS.ProcessEnv,
  savedLine: string,
): PhoneTarget | { error: string } {
  const saved = savedLine.replace(/\s/g, "");
  const full = env.REPOOS_HUB_PHONE?.trim();
  if (full) {
    return splitTarget(full);
  }
  const portOnly = env.REPOOS_HUB_PHONE_PORT?.trim();
  if (portOnly) {
    const savedIp = saved.includes(":") ? saved.split(":")[0] : saved;
    if (!savedIp) {
      return {
        error:
          "REPOOS_HUB_PHONE_PORT is set but no IP is saved in ~/.config/repoos-hub/phone — set REPOOS_HUB_PHONE=ip:port once.",
      };
    }
    return { ip: savedIp, port: portOnly };
  }
  if (saved) {
    return splitTarget(saved);
  }
  return {
    error:
      "No phone target configured. Set REPOOS_HUB_PHONE=ip:port or save ip:port in ~/.config/repoos-hub/phone.",
  };
}

export function splitTarget(target: string): PhoneTarget | { error: string } {
  const colon = target.lastIndexOf(":");
  if (colon === -1) {
    return { ip: target, port: "" };
  }
  const ip = target.slice(0, colon);
  const port = target.slice(colon + 1);
  if (!ip) {
    return { error: `invalid phone target '${target}' (missing IP)` };
  }
  return { ip, port };
}

export function formatSerial(ip: string, port: string): string {
  return port ? `${ip}:${port}` : ip;
}

export function unreachableMessage(ip: string, configPath: string): string {
  return `Can't reach the phone at ${ip} over adb.
  On the phone: make sure Tailscale is connected, then Settings > Developer options >
  Wireless debugging is ON, and read the 'IP address & Port' line.
  Then re-run with:  REPOOS_HUB_PHONE_PORT=<port> just deploy-phone --no-build
  (or put '${ip}:<port>' in ${configPath}). If the phone was re-paired/reset, pair again
  with: adb pair ${ip}:<pairing-port> <code>`;
}

export function signatureMismatchMessage(serial: string, appId: string): string {
  return `signature mismatch with the installed app. Uninstall once: adb -s ${serial} uninstall ${appId}`;
}

export async function isDeviceReady(adbExec: AdbExec, serial: string): Promise<boolean> {
  const { stdout } = await adbExec(["get-state"], { serial });
  return stdout.trim() === "device";
}

export async function tryConnect(
  adbExec: AdbExec,
  sleep: (ms: number) => Promise<void>,
  serial: string,
): Promise<boolean> {
  if (await isDeviceReady(adbExec, serial)) return true;
  await adbExec(["connect", serial], { timeoutMs: 8_000 });
  await sleep(1_000);
  return isDeviceReady(adbExec, serial);
}

export async function findConnectedSerial(
  adbExec: AdbExec,
  ip: string,
): Promise<string | null> {
  const { stdout } = await adbExec(["devices"]);
  for (const line of stdout.split("\n")) {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 2 || parts[1] !== "device") continue;
    const serial = parts[0]!;
    if (serial.startsWith(`${ip}:`)) return serial;
  }
  return null;
}

export async function connectToPhone(
  deps: Pick<DeployDeps, "adbExec" | "sleep" | "log">,
  ip: string,
  port: string,
  allowScan: boolean,
  scanOpenTcpPorts: (ip: string, from: number, to: number) => Promise<number[]>,
): Promise<string | null> {
  const { adbExec, sleep, log } = deps;
  if (port) {
    const serial = formatSerial(ip, port);
    if (await tryConnect(adbExec, sleep, serial)) return serial;
  }
  const existing = await findConnectedSerial(adbExec, ip);
  if (existing) return existing;

  if (!allowScan) return null;

  if (port) {
    await adbExec(["disconnect", formatSerial(ip, port)]).catch(() => {});
  }
  log(`port ${port || "<none>"} didn't answer; scanning ${ip}:${SCAN_FROM}-${SCAN_TO} for adb...`);
  const openPorts = await scanOpenTcpPorts(ip, SCAN_FROM, SCAN_TO);
  for (const p of openPorts) {
    log(`open port ${p}, trying adb connect`);
    const candidate = formatSerial(ip, String(p));
    if (await tryConnect(adbExec, sleep, candidate)) return candidate;
    await adbExec(["disconnect", candidate]).catch(() => {});
  }
  return null;
}

export async function scanWithNmap(
  ip: string,
  from: number,
  to: number,
  run: (cmd: string, args: string[]) => Promise<{ stdout: string; exitCode: number }>,
): Promise<number[]> {
  const { stdout, exitCode } = await run("nmap", [
    "-Pn",
    "-T4",
    "--min-rate",
    "2000",
    "-p",
    `${from}-${to}`,
    ip,
    "-oG",
    "-",
  ]);
  if (exitCode !== 0) return [];
  const ports: number[] = [];
  for (const line of stdout.split("\n")) {
    for (const match of line.matchAll(/(\d+)\/open/g)) {
      ports.push(Number(match[1]));
    }
  }
  return ports;
}

export function defaultAdbExec(adbBin: string): AdbExec {
  return (args, opts) =>
    new Promise((resolve) => {
      const full = opts?.serial ? ["-s", opts.serial, ...args] : args;
      const child = spawn(adbBin, full, { stdio: ["ignore", "pipe", "pipe"] });
      let stdout = "";
      let stderr = "";
      child.stdout?.on("data", (chunk) => {
        stdout += String(chunk);
      });
      child.stderr?.on("data", (chunk) => {
        stderr += String(chunk);
      });
      const timeout = opts?.timeoutMs
        ? setTimeout(() => {
            child.kill("SIGTERM");
          }, opts.timeoutMs)
        : null;
      child.on("close", (code) => {
        if (timeout) clearTimeout(timeout);
        resolve({ stdout, stderr, exitCode: code ?? 1 });
      });
    });
}

export async function runHubPhoneDeploy(
  flags: DeployFlags,
  deps: DeployDeps,
): Promise<void> {
  const configPath = phoneConfigPath(deps.homeDir);
  const apk = join(
    deps.repoRoot,
    "mobile/android/app/build/outputs/apk/debug/app-debug.apk",
  );
  const activity = hubLaunchComponent(APP_ID, ACTIVITY_CLASS);

  let saved = "";
  try {
    saved = (await deps.readText(configPath)).trim();
  } catch {
    /* no saved config yet */
  }

  const resolved = resolvePhoneTarget(deps.env, saved);
  if ("error" in resolved) {
    deps.die(resolved.error);
  }
  const { ip, port } = resolved;

  if (flags.build) {
    deps.log("building debug APK");
    if (deps.buildApk) {
      await deps.buildApk();
    } else {
      deps.die("buildApk dependency is required when build=1");
    }
  }
  if (!(await deps.pathExists(apk))) {
    deps.die(`no APK at ${apk} (run without --no-build)`);
  }

  const serial = await connectToPhone(
    deps,
    ip,
    port,
    flags.scan,
    deps.scanOpenTcpPorts,
  );
  if (!serial) {
    deps.die(unreachableMessage(ip, configPath));
  }

  if (serial !== saved.replace(/\s/g, "")) {
    await mkdir(dirname(configPath), { recursive: true });
    await deps.writeText(configPath, `${serial}\n`);
    deps.log(`saved ${serial} to ${configPath}`);
  }

  const modelOut = await deps.adbExec(["shell", "getprop", "ro.product.model"], {
    serial,
  });
  const model = modelOut.stdout.replace(/\r/g, "").trim();
  deps.log(`installing on ${serial}${model ? ` (${model})` : ""}`);

  const install = await deps.adbExec(["install", "-r", "-d", apk], { serial });
  const installText = `${install.stdout}\n${install.stderr}`;
  if (install.exitCode !== 0) {
    if (installText.includes("INSTALL_FAILED_UPDATE_INCOMPATIBLE")) {
      deps.die(signatureMismatchMessage(serial, APP_ID));
    }
    deps.die(`adb install failed\n${installText.trim()}`);
  }

  deps.log(`launching ${activity}`);
  await deps.adbExec(["shell", "am", "force-stop", APP_ID], { serial });
  await deps.adbExec(["shell", "am", "start", "-W", "-n", activity], { serial });

  const rev = await deps.gitShortHead();
  deps.log(`done: ${rev} is on the phone`);
}