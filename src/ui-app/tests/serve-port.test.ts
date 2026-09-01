/**
 * `repoos serve` port resolution: an explicit `--port` wins, then repoos.toml
 * `servePort`, then a stable per-repo derived port (so two checkouts on one
 * machine don't both default to 7171 and reap each other's server).
 */
import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deriveServePort, resolveServePort, loadConfig } from "../../core/config";

const roots: string[] = [];
afterEach(() => {
  for (const r of roots) rmSync(r, { recursive: true, force: true });
  roots.length = 0;
});
function tmpRepo(toml = ""): string {
  const d = mkdtempSync(join(tmpdir(), "repoos-serveport-"));
  roots.push(d);
  writeFileSync(join(d, "repoos.toml"), toml);
  return d;
}

describe("deriveServePort", () => {
  it("is deterministic and in the 7200–7999 band", () => {
    const a = deriveServePort("/some/repo/path");
    expect(a).toBe(deriveServePort("/some/repo/path"));
    expect(a).toBeGreaterThanOrEqual(7200);
    expect(a).toBeLessThanOrEqual(7999);
  });

  it("gives different repos different ports", () => {
    expect(deriveServePort("/repo/one")).not.toBe(deriveServePort("/repo/two"));
  });
});

describe("resolveServePort precedence", () => {
  it("uses --port when given", () => {
    expect(resolveServePort("/x", { servePort: 9000 }, 4321)).toBe(4321);
  });
  it("falls back to repoos.toml servePort", () => {
    expect(resolveServePort("/x", { servePort: 9000 })).toBe(9000);
  });
  it("falls back to the derived port when nothing is set", () => {
    expect(resolveServePort("/repo/one", {})).toBe(deriveServePort("/repo/one"));
  });
  it("ignores a zero/invalid flag and toml value", () => {
    expect(resolveServePort("/repo/one", { servePort: 0 }, 0)).toBe(deriveServePort("/repo/one"));
  });
});

describe("loadConfig servePort", () => {
  it("reads a numeric servePort", () => {
    expect(loadConfig(tmpRepo("servePort = 7171\n")).servePort).toBe(7171);
  });
  it("accepts a quoted string value (older Settings writes)", () => {
    expect(loadConfig(tmpRepo('servePort = "8080"\n')).servePort).toBe(8080);
  });
  it("is undefined when unset or out of range", () => {
    expect(loadConfig(tmpRepo("")).servePort).toBeUndefined();
    expect(loadConfig(tmpRepo("servePort = 70000\n")).servePort).toBeUndefined();
  });
});
