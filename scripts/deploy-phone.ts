#!/usr/bin/env bun
/**
 * Build the RepoOS Hub debug APK, install it on Nick's phone over Tailscale +
 * adb, and launch the dev app (applicationId org.repoos.mobile.dev).
 *
 * Phone address comes from (first match wins):
 *   1. $REPOOS_HUB_PHONE            e.g. REPOOS_HUB_PHONE=100.x.x.x:43387
 *   2. $REPOOS_HUB_PHONE_PORT       port only, IP from ~/.config/repoos-hub/phone
 *   3. ~/.config/repoos-hub/phone   one line, "ip:port"
 *
 * Flags:  --no-build   install the existing APK only
 *         --no-scan    don't scan for a new port, just fail
 */
import { access, readFile, writeFile } from "node:fs/promises";
import { constants, readFileSync } from "node:fs";
import net from "node:net";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import {
  defaultAdbExec,
  runHubPhoneDeploy,
  scanWithNmap,
  type DeployDeps,
  type DeployFlags,
} from "./lib/hub-phone-deploy.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

function parseFlags(argv: string[]): DeployFlags {
  const flags: DeployFlags = { build: true, scan: true };
  for (const arg of argv) {
    if (arg === "--no-build") flags.build = false;
    else if (arg === "--no-scan") flags.scan = false;
    else if (arg === "-h" || arg === "--help") {
      const lines = readHelp();
      console.log(lines);
      process.exit(0);
    } else {
      console.error(`unknown flag: ${arg}`);
      process.exit(2);
    }
  }
  return flags;
}

function readHelp(): string {
  const src = readFileSync(fileURLToPath(import.meta.url), "utf8");
  return src
    .split("\n")
    .slice(1, 14)
    .join("\n")
    .replace(/^ \* ?/gm, "");
}


function log(msg: string): void {
  console.log(`\x1b[36m[deploy-phone]\x1b[0m ${msg}`);
}

function die(msg: string, code = 1): never {
  console.error(`\x1b[31m[deploy-phone]\x1b[0m ${msg}`);
  process.exit(code);
}

async function commandExists(name: string): Promise<boolean> {
  const which = process.platform === "win32" ? "where" : "which";
  return new Promise((resolve) => {
    const child = spawn(which, [name], { stdio: "ignore" });
    child.on("close", (code) => resolve(code === 0));
  });
}

async function scanOpenTcpPorts(ip: string, from: number, to: number): Promise<number[]> {
  if (await commandExists("nmap")) {
    const ports = await scanWithNmap(ip, from, to, (cmd, args) =>
      new Promise((resolve) => {
        const child = spawn(cmd, args, { stdio: ["ignore", "pipe", "ignore"] });
        let stdout = "";
        child.stdout?.on("data", (c) => {
          stdout += String(c);
        });
        child.on("close", (code) => resolve({ stdout, exitCode: code ?? 1 }));
      }),
    );
    if (ports.length) return ports;
  }
  const open: number[] = [];
  const batch = 256;
  for (let start = from; start <= to; start += batch) {
    const end = Math.min(start + batch - 1, to);
    const chunk = await Promise.all(
      Array.from({ length: end - start + 1 }, (_, i) => probeTcp(ip, start + i)),
    );
    for (let i = 0; i < chunk.length; i++) {
      if (chunk[i]) open.push(start + i);
    }
  }
  return open;
}

function probeTcp(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port, timeout: 1_000 });
    const done = (ok: boolean) => {
      socket.destroy();
      resolve(ok);
    };
    socket.on("connect", () => done(true));
    socket.on("timeout", () => done(false));
    socket.on("error", () => done(false));
  });
}

async function buildApk(): Promise<void> {
  const androidDir = join(repoRoot, "mobile/android");
  await new Promise<void>((resolve, reject) => {
    const child = spawn("./gradlew", ["--quiet", "assembleDebug"], {
      cwd: androidDir,
      stdio: "inherit",
      env: process.env,
    });
    child.on("close", (code) => (code === 0 ? resolve() : reject(new Error("gradle failed"))));
  });
}

async function gitShortHead(): Promise<string> {
  return new Promise((resolve) => {
    const child = spawn("git", ["rev-parse", "--short", "HEAD"], {
      cwd: repoRoot,
      stdio: ["ignore", "pipe", "ignore"],
    });
    let out = "";
    child.stdout?.on("data", (c) => {
      out += String(c);
    });
    child.on("close", (code) => resolve(code === 0 ? out.trim() : "uncommitted"));
  });
}

async function main(): Promise<void> {
  if (!(await commandExists("adb"))) {
    die("adb not on PATH (install: brew install --cask android-platform-tools)");
  }

  const deps: DeployDeps = {
    repoRoot,
    homeDir: homedir(),
    env: process.env,
    log,
    die,
    adbExec: defaultAdbExec("adb"),
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    pathExists: async (p) => {
      try {
        await access(p, constants.F_OK);
        return true;
      } catch {
        return false;
      }
    },
    readText: (p) => readFile(p, "utf8"),
    writeText: (p, body) => writeFile(p, body, "utf8"),
    buildApk,
    commandExists,
    scanOpenTcpPorts,
    gitShortHead,
  };

  const flags = parseFlags(process.argv.slice(2));
  await runHubPhoneDeploy(flags, deps);
}

main().catch((err) => die(err instanceof Error ? err.message : String(err)));