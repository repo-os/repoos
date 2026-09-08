import { afterEach, describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { emptyTunnelConfig, renderCloudflaredConfig, type TunnelConfig } from "./tunnel.js";
import {
  annotateStale,
  emptyRegistry,
  parseRegistry,
  readRegistry,
  reconcileIdentity,
  removeApp,
  serializeRegistry,
  syncFromRepo,
  unionApps,
  upsertApp,
  withRegistryLock,
  writeRegistry,
  type TunnelRegistry,
} from "./tunnel-registry.js";

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
  dirs.length = 0;
});

function tmpDir(prefix: string): string {
  const d = mkdtempSync(join(tmpdir(), prefix));
  dirs.push(d);
  return d;
}

function tunnelWithApps(tunnelId: string, name: string, apps: TunnelConfig["apps"]): TunnelConfig {
  return { ...emptyTunnelConfig(), tunnelId, name, apps };
}

describe("registry parse/serialize round-trip", () => {
  it("round-trips identity and apps through TOML", () => {
    const reg: TunnelRegistry = {
      tunnelId: "tunnel-abc",
      tunnelName: "repoos-bee",
      domain: "repoos.org",
      apps: {
        dashboard: {
          hostname: "dashboard.repoos.org",
          service: "http://localhost:3000",
          access: ["alice@example.com"],
          ownerRoot: "/repos/a",
        },
        dev: {
          hostname: "dev.repoos.org",
          service: "http://localhost:7171",
          access: [],
          noAccess: true,
          ownerRoot: "/repos/b",
        },
      },
    };
    const parsed = parseRegistry(serializeRegistry(reg));
    expect(parsed).toEqual(reg);
  });

  it("reads a missing file as an empty registry", () => {
    const dir = tmpDir("repoos-registry-missing-");
    const reg = readRegistry(join(dir, "does-not-exist.toml"));
    expect(reg).toEqual(emptyRegistry());
  });

  it("persists and re-reads via an explicit path", () => {
    const dir = tmpDir("repoos-registry-io-");
    const path = join(dir, "tunnel-apps.toml");
    const reg = emptyRegistry();
    reg.tunnelId = "t-1";
    reg.tunnelName = "repoos-box";
    upsertApp(
      reg,
      "dev",
      { hostname: "dev.repoos.org", service: "http://localhost:7171", access: [] },
      "/repos/a",
    );
    writeRegistry(reg, path);
    expect(readRegistry(path)).toEqual(reg);
  });
});

describe("reconcileIdentity", () => {
  it("adopts the repo's identity when the registry has none yet", () => {
    const reg = emptyRegistry();
    const tunnel = tunnelWithApps("tunnel-1", "repoos-box", {});
    tunnel.domain = "repoos.org";
    const conflict = reconcileIdentity(reg, tunnel);
    expect(conflict).toBeNull();
    expect(reg.tunnelId).toBe("tunnel-1");
    expect(reg.tunnelName).toBe("repoos-box");
    expect(reg.domain).toBe("repoos.org");
  });

  it("no-ops when the repo isn't set up yet (no tunnelId)", () => {
    const reg = emptyRegistry();
    reg.tunnelId = "existing";
    const tunnel = tunnelWithApps("", "", {});
    expect(reconcileIdentity(reg, tunnel)).toBeNull();
    expect(reg.tunnelId).toBe("existing");
  });

  it("passes silently when the repo's identity matches the registry's", () => {
    const reg = emptyRegistry();
    reg.tunnelId = "tunnel-1";
    reg.tunnelName = "repoos-box";
    const tunnel = tunnelWithApps("tunnel-1", "repoos-box", {});
    expect(reconcileIdentity(reg, tunnel)).toBeNull();
  });

  it("refuses (never silently picks one) when tunnelIds disagree", () => {
    const reg = emptyRegistry();
    reg.tunnelId = "tunnel-1";
    reg.tunnelName = "repoos-box";
    const tunnel = tunnelWithApps("tunnel-2", "repoos-other", {});
    const conflict = reconcileIdentity(reg, tunnel);
    expect(conflict).toMatch(/does not match/);
    expect(conflict).toContain("tunnel-1");
    expect(conflict).toContain("tunnel-2");
    // registry identity must be left untouched
    expect(reg.tunnelId).toBe("tunnel-1");
  });
});

describe("syncFromRepo (seed / update / drop)", () => {
  it("seeds every app from an empty registry (single pre-existing repo)", () => {
    const reg = emptyRegistry();
    const tunnel = tunnelWithApps("tunnel-1", "repoos-box", {
      dashboard: { hostname: "dashboard.repoos.org", service: "http://localhost:3000", access: [] },
      api: { hostname: "api.repoos.org", service: "http://localhost:4000", access: [] },
    });
    const seeded = syncFromRepo(reg, tunnel, "/repos/a");
    expect(seeded.sort()).toEqual(["api", "dashboard"]);
    expect(reg.apps.dashboard).toMatchObject({
      hostname: "dashboard.repoos.org",
      ownerRoot: "/repos/a",
    });
    expect(reg.apps.api).toMatchObject({ hostname: "api.repoos.org", ownerRoot: "/repos/a" });
  });

  it("is a no-op on a second call — never re-seeds or duplicates", () => {
    const reg = emptyRegistry();
    const tunnel = tunnelWithApps("tunnel-1", "repoos-box", {
      dashboard: { hostname: "dashboard.repoos.org", service: "http://localhost:3000", access: [] },
    });
    syncFromRepo(reg, tunnel, "/repos/a");
    const secondPass = syncFromRepo(reg, tunnel, "/repos/a");
    expect(secondPass).toEqual([]);
    expect(Object.keys(reg.apps)).toEqual(["dashboard"]);
  });

  it("seeds a SECOND pre-existing repo's own apps without touching the first repo's", () => {
    // The exact "celleris + dev" bug scenario: two repos already publishing
    // apps before this registry existed. Repo A migrates first...
    const reg = emptyRegistry();
    const repoA = tunnelWithApps("tunnel-1", "repoos-box", {
      celleris: { hostname: "celleris.repoos.org", service: "http://localhost:3000", access: [] },
    });
    syncFromRepo(reg, repoA, "/repos/celleris");

    // ...then repo B, independently, also has its own pre-existing app that
    // was never in the registry. It must get folded in too, not skipped
    // just because the registry is no longer empty.
    const repoB = tunnelWithApps("tunnel-1", "repoos-box", {
      dev: { hostname: "dev.repoos.org", service: "http://localhost:7171", access: [] },
    });
    const seeded = syncFromRepo(reg, repoB, "/repos/dev");

    expect(seeded).toEqual(["dev"]);
    expect(reg.apps.celleris).toMatchObject({ ownerRoot: "/repos/celleris" });
    expect(reg.apps.dev).toMatchObject({ ownerRoot: "/repos/dev" });
  });

  it("never overwrites an entry owned by a different repo", () => {
    const reg = emptyRegistry();
    upsertApp(
      reg,
      "dev",
      { hostname: "dev.repoos.org", service: "http://localhost:7171", access: [] },
      "/repos/a",
    );
    const tunnel = tunnelWithApps("tunnel-1", "repoos-box", {
      dev: { hostname: "dev-imposter.repoos.org", service: "http://localhost:9999", access: [] },
    });
    const seeded = syncFromRepo(reg, tunnel, "/repos/b");
    expect(seeded).toEqual([]);
    expect(reg.apps.dev).toMatchObject({ hostname: "dev.repoos.org", ownerRoot: "/repos/a" });
  });

  it("re-upserts an entry it owns when repoos.toml changed (port/hostname edited by hand)", () => {
    const reg = emptyRegistry();
    const tunnel = tunnelWithApps("tunnel-1", "repoos-box", {
      dashboard: { hostname: "dashboard.repoos.org", service: "http://localhost:3000", access: [] },
    });
    syncFromRepo(reg, tunnel, "/repos/a");

    // repoos.toml is hand-edited (or re-created via `create`) to a new port —
    // a stale registry copy must not survive a second sync from its own repo.
    tunnel.apps.dashboard.service = "http://localhost:4000";
    const seeded = syncFromRepo(reg, tunnel, "/repos/a");
    expect(seeded).toEqual([]); // not newly seeded — updated in place
    expect(reg.apps.dashboard).toMatchObject({
      service: "http://localhost:4000",
      ownerRoot: "/repos/a",
    });
  });

  it("drops an entry it owns once repoos.toml no longer declares it", () => {
    const reg = emptyRegistry();
    const tunnel = tunnelWithApps("tunnel-1", "repoos-box", {
      dashboard: { hostname: "dashboard.repoos.org", service: "http://localhost:3000", access: [] },
    });
    syncFromRepo(reg, tunnel, "/repos/a");

    delete tunnel.apps.dashboard; // hand-deleted from repoos.toml, not via `destroy`
    syncFromRepo(reg, tunnel, "/repos/a");
    expect(reg.apps.dashboard).toBeUndefined();
  });

  it("never touches or drops another repo's entries even when this repo's toml is empty", () => {
    const reg = emptyRegistry();
    upsertApp(
      reg,
      "other",
      { hostname: "other.repoos.org", service: "http://localhost:9000", access: [] },
      "/repos/b",
    );
    const tunnel = tunnelWithApps("tunnel-1", "repoos-box", {});
    syncFromRepo(reg, tunnel, "/repos/a");
    expect(reg.apps.other).toMatchObject({ ownerRoot: "/repos/b" });
  });
});

describe("parseRegistry — corrupt entries", () => {
  it("drops an entry with an empty hostname or service rather than rendering a blank rule", () => {
    const text = [
      'tunnel_id = "tunnel-1"',
      "",
      "[apps.good]",
      'hostname = "good.repoos.org"',
      'service = "http://localhost:3000"',
      "access = []",
      'ownerRoot = "/repos/a"',
      "",
      "[apps.corrupt]",
      'hostname = ""',
      'service = "http://localhost:4000"',
      "access = []",
      'ownerRoot = "/repos/a"',
    ].join("\n");
    const reg = parseRegistry(text);
    expect(Object.keys(reg.apps)).toEqual(["good"]);
  });
});

describe("withRegistryLock", () => {
  it("runs the callback and releases the lock file afterward", () => {
    const dir = tmpDir("repoos-registry-lock-");
    const path = join(dir, "tunnel-apps.toml");
    const result = withRegistryLock(path, () => 42);
    expect(result).toBe(42);
    expect(existsSync(`${path}.lock`)).toBe(false);
  });

  it("releases the lock even when the callback throws", () => {
    const dir = tmpDir("repoos-registry-lock-throw-");
    const path = join(dir, "tunnel-apps.toml");
    expect(() =>
      withRegistryLock(path, () => {
        throw new Error("boom");
      }),
    ).toThrow("boom");
    expect(existsSync(`${path}.lock`)).toBe(false);
  });

  it("serializes a read-modify-write so neither writer's entry is lost", () => {
    // The exact race this lock exists to prevent: two "processes" (here,
    // just two sequential calls, since a true concurrent-process test would
    // need real subprocesses) each read, add their own app, and write —
    // without the lock this pattern is exactly how a naive read/mutate/write
    // loses an entry. Locking each one's full cycle assures nothing overlaps.
    const dir = tmpDir("repoos-registry-lock-race-");
    const path = join(dir, "tunnel-apps.toml");
    writeRegistry(emptyRegistry(), path);

    function addOne(name: string, root: string) {
      withRegistryLock(path, () => {
        const reg = readRegistry(path);
        upsertApp(
          reg,
          name,
          { hostname: `${name}.repoos.org`, service: "http://localhost:1", access: [] },
          root,
        );
        writeRegistry(reg, path);
      });
    }

    addOne("a", "/repos/a");
    addOne("b", "/repos/b");
    const final = readRegistry(path);
    expect(Object.keys(final.apps).sort()).toEqual(["a", "b"]);
  });
});

describe("unionApps + renderCloudflaredConfig (the actual fix)", () => {
  it("two repos' apps both survive a single render — neither clobbers the other", () => {
    const reg = emptyRegistry();
    reg.tunnelId = "tunnel-1";
    upsertApp(
      reg,
      "celleris",
      { hostname: "celleris.repoos.org", service: "http://localhost:3000", access: [] },
      "/repos/celleris",
    );
    upsertApp(
      reg,
      "dev",
      { hostname: "dev.repoos.org", service: "http://localhost:7171", access: [] },
      "/repos/dev",
    );

    const yaml = renderCloudflaredConfig(
      { ...emptyTunnelConfig(), tunnelId: reg.tunnelId, apps: unionApps(reg) },
      "/home/user/.cloudflared/tunnel-1.json",
    );

    expect(yaml).toContain("hostname: celleris.repoos.org");
    expect(yaml).toContain("hostname: dev.repoos.org");
    expect(yaml.trim().endsWith("- service: http_status:404")).toBe(true);
  });

  it("installing from repo B after repo A no longer drops repo A's route", () => {
    // Simulates: repo A creates its app (registry seeded with A's app), then
    // repo B runs `install` — B's own syncFromRepo pass must not remove A's
    // entry, and the union render must still contain both.
    const reg = emptyRegistry();
    reg.tunnelId = "tunnel-1";
    const repoA = tunnelWithApps("tunnel-1", "repoos-box", {
      a: { hostname: "a.repoos.org", service: "http://localhost:1111", access: [] },
    });
    syncFromRepo(reg, repoA, "/repos/a");

    const repoB = tunnelWithApps("tunnel-1", "repoos-box", {
      b: { hostname: "b.repoos.org", service: "http://localhost:2222", access: [] },
    });
    syncFromRepo(reg, repoB, "/repos/b");

    const apps = unionApps(reg);
    expect(Object.keys(apps).sort()).toEqual(["a", "b"]);
  });
});

describe("removeApp", () => {
  it("removes an entry and leaves the rest untouched", () => {
    const reg = emptyRegistry();
    upsertApp(
      reg,
      "a",
      { hostname: "a.repoos.org", service: "http://localhost:1", access: [] },
      "/repos/a",
    );
    upsertApp(
      reg,
      "b",
      { hostname: "b.repoos.org", service: "http://localhost:2", access: [] },
      "/repos/b",
    );
    removeApp(reg, "a");
    expect(Object.keys(reg.apps)).toEqual(["b"]);
  });

  it("no-ops on an absent name", () => {
    const reg = emptyRegistry();
    expect(() => removeApp(reg, "missing")).not.toThrow();
  });
});

describe("annotateStale", () => {
  it("flags entries whose ownerRoot no longer exists on disk", () => {
    const dir = tmpDir("repoos-registry-stale-");
    const liveRoot = join(dir, "live-repo");
    mkdirSync(liveRoot);
    const goneRoot = join(dir, "gone-repo"); // never created

    const reg = emptyRegistry();
    upsertApp(
      reg,
      "live",
      { hostname: "live.repoos.org", service: "http://localhost:1", access: [] },
      liveRoot,
    );
    upsertApp(
      reg,
      "gone",
      { hostname: "gone.repoos.org", service: "http://localhost:2", access: [] },
      goneRoot,
    );

    const rows = annotateStale(reg);
    const byName = Object.fromEntries(rows.map((r) => [r.name, r.stale]));
    expect(byName.live).toBe(false);
    expect(byName.gone).toBe(true);
  });

  it("sorts by app name", () => {
    const reg = emptyRegistry();
    upsertApp(
      reg,
      "zebra",
      { hostname: "z.repoos.org", service: "http://localhost:1", access: [] },
      "/repos/z",
    );
    upsertApp(
      reg,
      "alpha",
      { hostname: "a.repoos.org", service: "http://localhost:2", access: [] },
      "/repos/a",
    );
    expect(annotateStale(reg).map((r) => r.name)).toEqual(["alpha", "zebra"]);
  });
});
