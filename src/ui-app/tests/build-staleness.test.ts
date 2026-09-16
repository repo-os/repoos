/**
 * `repoos check`'s first step is RepoOS's own build-staleness contract, keyed
 * off the `dist/.build-info.json` marker that only RepoOS's `bun run build`
 * writes. A checkout that has `src/` but a different build pipeline (no
 * `dist/`, or a `dist/` with no RepoOS marker) must degrade to a skip instead
 * of hard-failing `repoos check`; a checkout WITH the marker must still fail
 * when src/ has drifted from it. `stale` stays true in the skip cases so the
 * preview path still knows it needs to build (#0349).
 */
import { afterEach, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkBuildForRoot, shouldSkipBuild, type BuildCheckResult } from "../../core/build.js";

const roots: string[] = [];
afterEach(() => {
  for (const r of roots) rmSync(r, { recursive: true, force: true });
  roots.length = 0;
});
function tmp(): string {
  const d = mkdtempSync(join(tmpdir(), "repoos-staleness-"));
  roots.push(d);
  return d;
}

/** Mirror of core/build.ts hashSrcDir, so a fixture can write a FRESH marker. */
function srcHash(root: string): string {
  const hash = createHash("sha256");
  const files: string[] = [];
  const walk = (dir: string): void => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name === "node_modules") continue;
        walk(full);
      } else if (e.isFile()) files.push(full);
    }
  };
  walk(join(root, "src"));
  files.sort();
  for (const f of files) {
    hash.update(f.slice(root.length + 1));
    hash.update(readFileSync(f));
  }
  return hash.digest("hex");
}

function writeSrc(root: string): void {
  mkdirSync(join(root, "src"), { recursive: true });
  writeFileSync(join(root, "src", "index.ts"), "export const x = 1;\n");
}

describe("checkBuildForRoot — staleness applicability (#0349)", () => {
  it("treats a checkout with no src/ as published and not applicable", () => {
    const r = checkBuildForRoot(tmp());
    expect(r).toMatchObject({ stale: false, code: "published", applicable: false });
  });

  it("skips (does not fail) when src/ exists but there is no dist/ build", () => {
    const root = tmp();
    writeSrc(root);
    const r = checkBuildForRoot(root);
    expect(r.code).toBe("no-build");
    expect(r.applicable).toBe(false);
    // `stale` stays true so the preview path still rebuilds before serving.
    expect(r.stale).toBe(true);
    expect(r.message).toMatch(/skipping staleness check/i);
  });

  it("skips (does not fail) when dist/ exists without a RepoOS marker", () => {
    const root = tmp();
    writeSrc(root);
    mkdirSync(join(root, "dist"), { recursive: true });
    const r = checkBuildForRoot(root);
    expect(r.code).toBe("no-marker");
    expect(r.applicable).toBe(false);
    expect(r.stale).toBe(true);
    expect(r.message).toMatch(/skipping staleness check/i);
  });

  it("is fresh + applicable when the marker matches the current src hash", () => {
    const root = tmp();
    writeSrc(root);
    mkdirSync(join(root, "dist"), { recursive: true });
    writeFileSync(
      join(root, "dist", ".build-info.json"),
      JSON.stringify({ hash: srcHash(root), version: "1.0.0" }),
    );
    const r = checkBuildForRoot(root);
    expect(r.code).toBe("fresh");
    expect(r.stale).toBe(false);
    expect(r.applicable).toBe(true);
  });

  it("is stale + applicable (fails the gate) when the marker no longer matches src/", () => {
    const root = tmp();
    writeSrc(root);
    mkdirSync(join(root, "dist"), { recursive: true });
    writeFileSync(
      join(root, "dist", ".build-info.json"),
      JSON.stringify({ hash: "deadbeef", version: "1.0.0" }),
    );
    const r = checkBuildForRoot(root);
    expect(r.code).toBe("stale");
    expect(r.stale).toBe(true);
    expect(r.applicable).toBe(true);
  });

  it("treats a corrupt marker as applicable and stale (RepoOS's build is broken)", () => {
    const root = tmp();
    writeSrc(root);
    mkdirSync(join(root, "dist"), { recursive: true });
    writeFileSync(join(root, "dist", ".build-info.json"), "{ not json");
    const r = checkBuildForRoot(root);
    expect(r.code).toBe("corrupt");
    expect(r.stale).toBe(true);
    expect(r.applicable).toBe(true);
  });
});

/**
 * `bun run build` is staleness-aware (#0377) via `shouldSkipBuild`. It may skip
 * only when the marker proves src/ is unchanged; every other outcome and any
 * forced run must build. `scripts/build.mjs` is the only caller that acts on
 * this, but keeping the decision pure here covers the contract without spawning
 * a build.
 */
describe("shouldSkipBuild — bun run build's skip decision (#0377)", () => {
  const result = (code: BuildCheckResult["code"], stale: boolean): BuildCheckResult => ({
    code,
    stale,
    message: null,
    applicable: true,
  });

  it("skips only a verified-fresh build", () => {
    expect(shouldSkipBuild(result("fresh", false))).toBe(true);
  });

  it("never skips when dist is stale, missing, or has no marker", () => {
    for (const code of ["stale", "no-build", "no-marker", "corrupt", "published"] as const) {
      expect(shouldSkipBuild(result(code, code !== "published"))).toBe(false);
    }
  });

  it("force always builds, even on a fresh marker", () => {
    expect(shouldSkipBuild(result("fresh", false), true)).toBe(false);
    expect(shouldSkipBuild(result("stale", true), true)).toBe(false);
  });
});
