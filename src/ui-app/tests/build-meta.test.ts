/**
 * `.build-info.json` ({ hash, version }) and `.build-stamp.json` ({ generatedAt })
 * are the only build markers that ship in a standalone install — the release
 * tarball is `tar -C dist .`, so `package.json` is NOT included. A standalone
 * (curl / `repoos upgrade`) install must still report its version; the old
 * package.json-only path left it at "unknown" (UI showed a blank version + an
 * "unknown" build age).
 */
import { afterEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readBuildMetaFrom } from "../../core/build.js";

const roots: string[] = [];
afterEach(() => {
  for (const r of roots) rmSync(r, { recursive: true, force: true });
  roots.length = 0;
});
function tmp(): string {
  const d = mkdtempSync(join(tmpdir(), "repoos-buildmeta-"));
  roots.push(d);
  return d;
}

describe("readBuildMetaFrom", () => {
  it("reads version + buildAt from markers beside the module (standalone layout)", () => {
    const dir = tmp();
    writeFileSync(
      join(dir, ".build-info.json"),
      JSON.stringify({ hash: "abc", version: "0.5.32" }),
    );
    writeFileSync(
      join(dir, ".build-stamp.json"),
      JSON.stringify({ generatedAt: "2026-08-30T00:00:00.000Z" }),
    );
    expect(readBuildMetaFrom(dir)).toEqual({
      version: "0.5.32",
      buildAt: "2026-08-30T00:00:00.000Z",
    });
  });

  it("falls back to a legacy inline generatedAt in .build-info.json", () => {
    const dir = tmp();
    writeFileSync(
      join(dir, ".build-info.json"),
      JSON.stringify({ version: "0.5.30", generatedAt: "2026-08-01T00:00:00.000Z" }),
    );
    expect(readBuildMetaFrom(dir)).toEqual({
      version: "0.5.30",
      buildAt: "2026-08-01T00:00:00.000Z",
    });
  });

  it("finds markers in ../dist when the module runs from a source checkout", () => {
    const repo = tmp();
    const src = join(repo, "src");
    mkdirSync(src, { recursive: true });
    mkdirSync(join(repo, "dist"), { recursive: true });
    writeFileSync(join(repo, "dist", ".build-info.json"), JSON.stringify({ version: "0.5.33" }));
    // markerDir = <repo>/src (no markers) → falls through to <repo>/dist
    expect(readBuildMetaFrom(src).version).toBe("0.5.33");
  });

  it("does not throw when no marker sits beside the module", () => {
    // No .build-*.json in markerDir or ../dist. buildAt is null; version may
    // still resolve via the package.json last-resort fallback (this test runs
    // inside a real checkout), so only assert it never throws and buildAt=null.
    const meta = readBuildMetaFrom(join(tmp(), "nope"));
    expect(meta.buildAt).toBeNull();
    expect(meta.version === null || typeof meta.version === "string").toBe(true);
  });
});
