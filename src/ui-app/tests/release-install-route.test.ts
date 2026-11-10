/**
 * Route-level wiring for the install detection behind
 * `GET /api/release/available` (#1073). The helper tests in releases.test.ts
 * prove `upgradeInstruction` in isolation; these prove the route feeds it the
 * same root and version `repoos upgrade` uses, for each on-disk install shape.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ServerResponse } from "node:http";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SOURCE_UPGRADE_COMMAND } from "../../commands/upgrade";
import { getAvailableRelease } from "../../server/routes/release";

// The install root is whatever `installRoot()` says `repoos upgrade` runs from.
// Point it at a fixture directory per case so the real structural probe runs.
const install = vi.hoisted(() => ({ root: "" }));
vi.mock("../../commands/upgrade", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../commands/upgrade")>();
  return { ...actual, installRoot: () => install.root };
});

/** Write `<dir>/.build-info.json` the way `scripts/copy-assets.mjs` does. */
function writeBuildInfo(dir: string, version: string): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, ".build-info.json"), JSON.stringify({ version }));
}

/** The offline payload: GitHub is disabled, so the route returns its fallback. */
async function offlineRelease(): Promise<{
  installKind: string;
  upgradeCommand: string;
  currentVersion: string | null;
}> {
  let body = "";
  const res = {
    writeHead: vi.fn(),
    end: vi.fn((chunk: string) => {
      body = chunk;
    }),
  } as unknown as ServerResponse;
  await getAvailableRelease({} as never, {} as never, res, {});
  return JSON.parse(body);
}

describe("GET /api/release/available install detection (#1073)", () => {
  let base: string;
  let previousDisable: string | undefined;

  beforeEach(() => {
    base = mkdtempSync(join(tmpdir(), "repoos-install-route-"));
    previousDisable = process.env.REPOOS_DISABLE_UPDATE_CHECK;
    // Offline: no GitHub call, so only the fallback payload (which also carries
    // installKind/upgradeCommand) is returned.
    process.env.REPOOS_DISABLE_UPDATE_CHECK = "1";
  });

  afterEach(() => {
    rmSync(base, { recursive: true, force: true });
    if (previousDisable === undefined) delete process.env.REPOOS_DISABLE_UPDATE_CHECK;
    else process.env.REPOOS_DISABLE_UPDATE_CHECK = previousDisable;
  });

  it("reports a standalone curl install as `repoos upgrade`", async () => {
    install.root = join(base, "install");
    writeBuildInfo(install.root, "0.5.79");

    const payload = await offlineRelease();
    expect(payload).toMatchObject({
      installKind: "standalone",
      upgradeCommand: "repoos upgrade",
      currentVersion: "0.5.79",
    });
  });

  it("reports a channel install with its channel form", async () => {
    install.root = join(base, "install");
    writeBuildInfo(install.root, "0.6.0-beta.1");

    const payload = await offlineRelease();
    expect(payload).toMatchObject({
      installKind: "standalone",
      upgradeCommand: "repoos upgrade --channel beta",
    });
  });

  it("reports a built source checkout as source, even though its build marker has a version", async () => {
    // `<repo>/dist` with `.git` beside it: the shape of this repo's linked dev
    // build. The build marker carries package.json's version, so only the
    // structural probe can tell it from a standalone install.
    mkdirSync(join(base, "repo", ".git"), { recursive: true });
    install.root = join(base, "repo", "dist");
    writeBuildInfo(install.root, "0.5.79");

    const payload = await offlineRelease();
    expect(payload).toMatchObject({
      installKind: "source",
      upgradeCommand: SOURCE_UPGRADE_COMMAND,
    });
  });

  it("reports a bare source run with no dist/ as source", async () => {
    // `bun src/...` runs from `<repo>/src` with no `.build-info.json`. The
    // server used to fall back to package.json and call this standalone.
    mkdirSync(join(base, "repo", "src"), { recursive: true });
    writeFileSync(join(base, "repo", "package.json"), JSON.stringify({ version: "0.5.79" }));
    install.root = join(base, "repo", "src");

    const payload = await offlineRelease();
    expect(payload).toMatchObject({
      installKind: "source",
      upgradeCommand: SOURCE_UPGRADE_COMMAND,
    });
  });

  it("reports a package-manager install with that manager's command", async () => {
    install.root = join(base, "node_modules", "@repo-os", "repoos", "dist");
    writeBuildInfo(install.root, "0.5.79");

    const payload = await offlineRelease();
    expect(payload).toMatchObject({
      installKind: "package-manager",
      upgradeCommand: "npm update -g @repo-os/repoos",
    });
  });
});
