import { afterEach, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  API_CREATOR,
  CLI_CREATOR,
  PM_CREATOR,
  resolveApiCreator,
  resolveCliCreator,
} from "./record-creator.js";

const envKeys = ["REPOOS_AGENT", "REPOOS_TASK_ID"] as const;
const saved: Record<string, string | undefined> = {};

afterEach(() => {
  for (const k of envKeys) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
    delete saved[k];
  }
});

function setEnv(key: (typeof envKeys)[number], value: string | undefined): void {
  if (!(key in saved)) saved[key] = process.env[key];
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

describe("resolveApiCreator", () => {
  it("uses the session email when present", () => {
    expect(resolveApiCreator("hello@example.com")).toBe("hello@example.com");
  });
  it("falls back to api", () => {
    expect(resolveApiCreator("")).toBe(API_CREATOR);
    expect(resolveApiCreator(null)).toBe(API_CREATOR);
  });
});

describe("resolveCliCreator", () => {
  it("returns pm for PM chat sessions", () => {
    setEnv("REPOOS_AGENT", "1");
    setEnv("REPOOS_TASK_ID", "pm-task-v2:0123");
    expect(resolveCliCreator()).toBe(PM_CREATOR);
  });

  it("returns git user.email for ordinary CLI use", () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-creator-"));
    try {
      execFileSync("git", ["init", "-q"], { cwd: root });
      execFileSync("git", ["config", "user.email", "cli@example.com"], { cwd: root });
      expect(resolveCliCreator(root)).toBe("cli@example.com");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("falls back to cli when git has no email", () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-creator-"));
    const prevGlobal = process.env.GIT_CONFIG_GLOBAL;
    const prevSystem = process.env.GIT_CONFIG_SYSTEM;
    process.env.GIT_CONFIG_GLOBAL = "/dev/null";
    process.env.GIT_CONFIG_SYSTEM = "/dev/null";
    try {
      execFileSync("git", ["init", "-q"], { cwd: root });
      expect(resolveCliCreator(root)).toBe(CLI_CREATOR);
    } finally {
      if (prevGlobal === undefined) delete process.env.GIT_CONFIG_GLOBAL;
      else process.env.GIT_CONFIG_GLOBAL = prevGlobal;
      if (prevSystem === undefined) delete process.env.GIT_CONFIG_SYSTEM;
      else process.env.GIT_CONFIG_SYSTEM = prevSystem;
      rmSync(root, { recursive: true, force: true });
    }
  });
});
