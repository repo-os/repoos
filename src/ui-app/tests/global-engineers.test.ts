/**
 * Machine-wide engineer accounting (#0871): the concurrency cap subtracts
 * engineers running in other registered RepoOS servers.
 */
import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { effectiveAgentCapacity, registeredEngineerCount } from "../../core/global-engineers.js";
import {
  readServerRegistryEntry,
  updateServerRegistryEngineerCount,
  writeServerRegistryEntry,
  type ServerRegistryEntry,
} from "../../core/server-registry.js";

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function tmp(): string {
  const d = mkdtempSync(join(tmpdir(), "repoos-engineers-"));
  dirs.push(d);
  return d;
}

function entry(
  port: number,
  root: string,
  activeEngineers: number,
  pid = process.pid,
): ServerRegistryEntry {
  return {
    schema: 1,
    port,
    host: "127.0.0.1",
    pid,
    root,
    projectName: "test",
    version: "test",
    startedAt: new Date().toISOString(),
    kind: "server",
    activeEngineers,
  };
}

describe("registeredEngineerCount", () => {
  it("separates this server's engineers from other live servers", () => {
    const count = registeredEngineerCount("/repos/alpha", undefined, [
      entry(7171, "/repos/alpha", 2),
      entry(7272, "/repos/beta", 3),
      entry(7373, "/repos/gamma", 1),
    ]);
    expect(count.own).toBe(2);
    expect(count.others).toBe(4);
    expect(count.servers).toHaveLength(3);
  });

  it("ignores registry entries whose process is dead", () => {
    const count = registeredEngineerCount("/repos/alpha", undefined, [
      entry(7171, "/repos/alpha", 2),
      entry(7272, "/repos/beta", 9, 999_999_999),
    ]);
    expect(count.others).toBe(0);
    expect(count.servers).toHaveLength(1);
  });

  it("treats a missing count as zero", () => {
    const without = entry(7272, "/repos/beta", 0);
    delete without.activeEngineers;
    const count = registeredEngineerCount("/repos/alpha", undefined, [
      entry(7171, "/repos/alpha", 0),
      without,
    ]);
    expect(count.others).toBe(0);
  });
});

describe("effectiveAgentCapacity", () => {
  it("subtracts other servers' engineers", () => {
    expect(effectiveAgentCapacity(8, 3)).toBe(5);
  });

  it("never goes below one slot, so a stale count cannot deadlock starts", () => {
    expect(effectiveAgentCapacity(4, 40)).toBe(1);
    expect(effectiveAgentCapacity(1, 0)).toBe(1);
  });
});

describe("updateServerRegistryEngineerCount", () => {
  it("updates the count only for this process's own entry", () => {
    const dir = tmp();
    writeServerRegistryEntry(entry(7171, "/repos/alpha", 0), dir);
    updateServerRegistryEngineerCount(7171, 4, dir);
    expect(readServerRegistryEntry(7171, dir)?.activeEngineers).toBe(4);

    writeServerRegistryEntry(entry(7272, "/repos/beta", 0, 123_456_789), dir);
    updateServerRegistryEngineerCount(7272, 9, dir);
    expect(readServerRegistryEntry(7272, dir)?.activeEngineers).toBe(0);
  });
});
