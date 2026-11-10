/**
 * The update banner's version check must follow the same channel as the
 * command it shows (#1073 review). A beta install is compared against the
 * newest beta build — the release `repoos upgrade --channel beta` installs —
 * not the stable latest, which excludes prereleases.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ServerResponse } from "node:http";

const install = vi.hoisted(() => ({ root: "", version: "" }));
vi.mock("../../commands/upgrade", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../commands/upgrade")>();
  return {
    ...actual,
    installRoot: () => install.root,
    readInstallVersion: () => install.version,
  };
});
vi.mock("../../core/build", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../core/build")>();
  return {
    ...actual,
    readBuildMeta: () => ({ version: install.version, buildAt: null, hash: null }),
  };
});

const release = (tag: string, body = `notes ${tag}`) => ({
  tag_name: tag,
  prerelease: tag.includes("-"),
  body,
  html_url: `https://github.com/repo-os/repoos/releases/tag/${tag}`,
  assets: [],
});

/** GitHub as the banner sees it: `/releases/latest` (stable) and the list (channels). */
function githubWith(list: ReturnType<typeof release>[], stable: ReturnType<typeof release>) {
  const fetchMock = vi.fn(async (url: string) => {
    if (url.endsWith("/releases/latest")) return Response.json(stable);
    if (url.includes("/releases?per_page=30")) return Response.json(list);
    return new Response("not found", { status: 404 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

async function availableRelease(): Promise<Record<string, unknown>> {
  const { getAvailableRelease } = await import("../../server/routes/release");
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

describe("GET /api/release/available follows the install's channel (#1073)", () => {
  let base: string;
  let previousDisable: string | undefined;

  beforeEach(async () => {
    vi.resetModules();
    vi.unstubAllGlobals();
    const { mkdtempSync, mkdirSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    base = mkdtempSync(join(tmpdir(), "repoos-release-channel-"));
    install.root = join(base, "install");
    mkdirSync(install.root, { recursive: true });
    previousDisable = process.env.REPOOS_DISABLE_UPDATE_CHECK;
    delete process.env.REPOOS_DISABLE_UPDATE_CHECK;
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    const { rmSync } = await import("node:fs");
    rmSync(base, { recursive: true, force: true });
    if (previousDisable === undefined) delete process.env.REPOOS_DISABLE_UPDATE_CHECK;
    else process.env.REPOOS_DISABLE_UPDATE_CHECK = previousDisable;
  });

  it("does not offer a stable release to a beta install when no newer beta exists", async () => {
    // The stable 0.5.81 is out, but `repoos upgrade --channel beta` would only
    // install the newest beta (0.5.80-beta.1) — so the banner must not claim 0.5.81.
    install.version = "0.5.80-beta.1";
    const fetchMock = githubWith([release("v0.5.80-beta.1")], release("v0.5.81"));

    const payload = await availableRelease();

    expect(payload).toMatchObject({
      currentVersion: "0.5.80-beta.1",
      latestVersion: "0.5.80-beta.1",
      available: false,
      installKind: "standalone",
      upgradeCommand: "repoos upgrade --channel beta",
    });
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
      expect.stringContaining("/releases?per_page=30"),
    ]);
  });

  it("offers a newer beta build to a beta install, skipping the stable release", async () => {
    install.version = "0.5.80-beta.1";
    githubWith(
      [release("v0.5.81"), release("v0.5.81-beta.2"), release("v0.5.80-beta.1")],
      release("v0.5.81"),
    );

    const payload = await availableRelease();

    expect(payload).toMatchObject({
      latestVersion: "0.5.81-beta.2",
      available: true,
      upgradeCommand: "repoos upgrade --channel beta",
      releaseUrl: "https://github.com/repo-os/repoos/releases/tag/v0.5.81-beta.2",
    });
  });

  it("offers a newer beta over an older one on the same base version", async () => {
    install.version = "0.5.81-beta.1";
    githubWith([release("v0.5.81-beta.2")], release("v0.5.80"));

    const payload = await availableRelease();

    expect(payload).toMatchObject({ latestVersion: "0.5.81-beta.2", available: true });
  });

  it("compares a stable install against the stable latest, not the channel list", async () => {
    install.version = "0.5.79";
    const fetchMock = githubWith([release("v0.6.0-beta.1")], release("v0.5.81"));

    const payload = await availableRelease();

    expect(payload).toMatchObject({
      latestVersion: "0.5.81",
      available: true,
      upgradeCommand: "repoos upgrade",
    });
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
      expect.stringContaining("/releases/latest"),
    ]);
  });

  it("reports no update when a channel install is already on the newest channel build", async () => {
    install.version = "0.6.0-beta.1";
    githubWith([release("v0.6.0-beta.1")], release("v0.5.81"));

    const payload = await availableRelease();

    expect(payload).toMatchObject({ latestVersion: "0.6.0-beta.1", available: false });
  });

  it("falls back to no version when the channel lookup finds no matching build", async () => {
    install.version = "0.6.0-rc.1";
    githubWith([release("v0.5.81")], release("v0.5.81"));

    const payload = await availableRelease();

    expect(payload).toMatchObject({
      latestVersion: null,
      available: false,
      upgradeCommand: "repoos upgrade --channel rc",
    });
  });
});
