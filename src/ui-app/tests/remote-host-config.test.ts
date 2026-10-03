/**
 * Settings-surface behaviour for the #0521 host pool: the schema entry that
 * makes `remoteValidation.tailscaleHosts` PATCH-able, the no-op guards that
 * keep a save from materialising the `tailscaleHost` shorthand, and the row
 * bookkeeping when a host is removed. Includes a regression test for the
 * empty-`tailscaleHost` save that used to 400 every Settings write.
 */
import { describe, expect, it } from "vitest";
import { Readable } from "node:stream";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getConfigSchema, loadConfig } from "../../core/config.js";
import { resolveRemoteHosts } from "../../core/remote-hosts.js";
import { startServer } from "../../server/server.js";
import { patchConfig } from "../../server/routes/config.js";

const roots: string[] = [];
function repo(toml: string): string {
  const root = mkdtempSync(join(tmpdir(), "repoos-hostcfg-"));
  roots.push(root);
  writeFileSync(join(root, "repoos.toml"), toml);
  return root;
}
async function cleanup(): Promise<void> {
  for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true });
}

async function patch(
  root: string,
  body: Record<string, unknown>,
): Promise<{ status: number; payload: any }> {
  const req = Readable.from([Buffer.from(JSON.stringify(body))]);
  const res: any = {
    writeHead(code: number) {
      res.statusCode = code;
      return res;
    },
    end(payload: string) {
      res.payload = payload;
    },
  };
  const cfg = loadConfig(root);
  const ctx = {
    config: { root, cacheDir: cfg.cacheDir, workDir: cfg.workDir },
    repoos: { config: cfg },
    index: { refreshAll() {} },
  } as never;
  await patchConfig(ctx, req as never, res as never, {});
  let payload: any = {};
  try {
    payload = JSON.parse(res.payload ?? "{}");
  } catch {
    /* non-JSON body */
  }
  return { status: res.statusCode, payload };
}

describe("remoteValidation.tailscaleHosts schema entry (#0521)", () => {
  it("is declared as an array field with actionable copy", () => {
    const field = getConfigSchema().find((f) => f.key === "remoteValidation.tailscaleHosts");
    expect(field).toBeDefined();
    expect(field!.type).toBe("array");
    expect(field!.restartRequired).toBe(false);
    expect(field!.description).toContain("[[remoteValidation.tailscaleHosts]]");
    // The docs gate (config-docs.test.ts) covers documentation of every key.
  });

  it("accepts an empty optional tailscaleHost instead of 400ing the whole save", async () => {
    const root = repo('workDir = "work"\n');
    const res = await patch(root, {
      "remoteValidation.containerImage": "repoos-ci",
      "remoteValidation.tailscaleHost": "",
    });
    expect(res.status).toBe(200);
    await cleanup();
  });

  it("treats an empty host list as 'nothing to change'", async () => {
    const root = repo('remoteValidation.tailscaleHost = "mini"\n');
    const res = await patch(root, {
      "remoteValidation.containerImage": "repoos-ci",
      "remoteValidation.tailscaleHosts": [],
    });
    expect(res.status).toBe(200);
    expect(readFileSync(join(root, "repoos.toml"), "utf8")).not.toContain("tailscaleHosts");
    await cleanup();
  });

  it("does not materialise the shorthand when the pool is saved unchanged", async () => {
    const root = repo('remoteValidation.tailscaleHost = "mini"\n');
    const res = await patch(root, {
      "remoteValidation.containerImage": "repoos-ci",
      "remoteValidation.tailscaleHosts": ["mini"],
    });
    expect(res.status).toBe(200);
    const text = readFileSync(join(root, "repoos.toml"), "utf8");
    expect(text).not.toContain("tailscaleHosts");
    await cleanup();
  });

  it("writes an edited pool and keeps surviving [[…]] row attrs, dropping removed hosts", async () => {
    const root = repo(
      'remoteValidation.tailscaleHost = "bee"\n\n' +
        "[[remoteValidation.tailscaleHosts]]\n" +
        'host = "mac1"\nos = "macos"\nuser = "nick"\n',
    );
    // mac1 removed from the pool by the user.
    const res = await patch(root, {
      "remoteValidation.containerImage": "repoos-ci",
      "remoteValidation.tailscaleHosts": ["bee", "linux2"],
    });
    expect(res.status).toBe(200);
    const cfg = loadConfig(root);
    expect(resolveRemoteHosts(cfg.remoteValidation).map((h) => h.host)).toEqual(["bee", "linux2"]);
    expect(readFileSync(join(root, "repoos.toml"), "utf8")).not.toContain("[[remoteValidation");
    await cleanup();
  });

  it("keeps a row's per-host attrs when only other hosts change", async () => {
    const root = repo(
      'remoteValidation.tailscaleHost = "bee"\n' +
        'remoteValidation.tailscaleHosts = ["bee", "mac1"]\n\n' +
        "[[remoteValidation.tailscaleHosts]]\n" +
        'host = "mac1"\nos = "macos"\nlabels = ["apple"]\n',
    );
    const res = await patch(root, {
      "remoteValidation.containerImage": "repoos-ci",
      "remoteValidation.tailscaleHosts": ["mac1", "bee"],
    });
    expect(res.status).toBe(200);
    const hosts = resolveRemoteHosts(loadConfig(root).remoteValidation);
    // The explicit flat list order wins over the shorthand; row attrs survive.
    expect(hosts).toEqual([{ host: "mac1", os: "macos", labels: ["apple"] }, { host: "bee" }]);
    await cleanup();
  });

  it("a removed host does not come back from a stale flat list after shortening a mixed pool (#0521 review)", async () => {
    // A mixed config: a flat list AND a rich row for mac1 (the shape the
    // drawer's own example produces). Shortening the pool to just
    // ["bee", "mac1"] must fully retire the flat list — it used to only
    // rewrite the [[…]] rows and leave the stale flat line behind, which
    // resurrected "other" on the very next reload.
    const root = repo(
      'remoteValidation.tailscaleHost = "bee"\n' +
        'remoteValidation.tailscaleHosts = ["bee", "mac1", "other"]\n\n' +
        "[[remoteValidation.tailscaleHosts]]\n" +
        'host = "mac1"\nos = "macos"\nlabels = ["apple"]\n',
    );
    const res = await patch(root, {
      "remoteValidation.containerImage": "repoos-ci",
      "remoteValidation.tailscaleHosts": ["bee", "mac1"],
    });
    expect(res.status).toBe(200);
    const raw = readFileSync(join(root, "repoos.toml"), "utf8");
    // No stray flat line survives once rows form is in use for this key.
    expect(raw).not.toMatch(/^remoteValidation\.tailscaleHosts\s*=\s*\[/m);
    // Reloading from disk — not just the in-memory patch result — proves
    // "other" is genuinely gone, not just hidden by in-memory precedence.
    const hosts = resolveRemoteHosts(loadConfig(root).remoteValidation);
    expect(hosts).toEqual([{ host: "bee" }, { host: "mac1", os: "macos", labels: ["apple"] }]);
    await cleanup();
  });

  it("writes a rows-only pool through rows alone — no duplicate flat key (#0521 review)", async () => {
    // No pre-existing flat `tailscaleHosts = [...]` line — only rows, the
    // form the docs tell users to move to once a host needs per-host attrs.
    const root = repo(
      "[[remoteValidation.tailscaleHosts]]\n" +
        'host = "mac1"\nos = "macos"\nlabels = ["apple"]\n\n' +
        "[[remoteValidation.tailscaleHosts]]\n" +
        'host = "bee"\nos = "linux"\n',
    );
    const res = await patch(root, {
      "remoteValidation.containerImage": "repoos-ci",
      "remoteValidation.tailscaleHosts": ["mac1", "bee"],
    });
    expect(res.status).toBe(200);
    const raw = readFileSync(join(root, "repoos.toml"), "utf8");
    // The bug (#0521 review): writing both a flat `tailscaleHosts = [...]`
    // line AND rewriting the [[…]] blocks for the same key in one patch —
    // parseFlatToml's lenient merge hides it from repoos itself, but it's
    // invalid TOML.
    expect(raw).not.toMatch(/^remoteValidation\.tailscaleHosts\s*=\s*\[/m);
    const hosts = resolveRemoteHosts(loadConfig(root).remoteValidation);
    expect(hosts).toEqual([
      { host: "mac1", os: "macos", labels: ["apple"] },
      { host: "bee", os: "linux" },
    ]);
    await cleanup();
  });

  it("adds a brand-new host to a rows-only pool without dropping it (#0521 review)", async () => {
    // Untested path the review called out: a rows-only pool that keeps an
    // existing row while adding a host that has no row of its own yet.
    const root = repo("[[remoteValidation.tailscaleHosts]]\n" + 'host = "mac1"\nos = "macos"\n');
    const res = await patch(root, {
      "remoteValidation.containerImage": "repoos-ci",
      "remoteValidation.tailscaleHosts": ["mac1", "linux2"],
    });
    expect(res.status).toBe(200);
    const hosts = resolveRemoteHosts(loadConfig(root).remoteValidation);
    // linux2 is present (not silently dropped) even though it has no prior
    // row and mac1's attrs survive.
    expect(hosts).toEqual([{ host: "mac1", os: "macos" }, { host: "linux2" }]);
    await cleanup();
  });
});

/**
 * Section-scoped writes (#0521 review): `patchTomlConfig` used to match only
 * the full dotted key, so a line written the way the docs show it — under
 * `[remoteValidation]` — was invisible to the patch: a duplicate root line was
 * inserted instead and the in-section line (parsed later) overrode it, making
 * the Settings save a silent no-op.
 */
describe("patchConfig against section-scoped repoos.toml files", () => {
  it("saves the pool from a `[remoteValidation]` section config (the documented block)", async () => {
    const root = repo(
      '[remoteValidation]\nprovider = "tailscale"\ntailscaleHosts = ["bee", "mac1"]\n',
    );
    const res = await patch(root, {
      "remoteValidation.containerImage": "repoos-ci",
      "remoteValidation.tailscaleHosts": ["bee", "mac1", "linux2"],
    });
    expect(res.status).toBe(200);
    expect(resolveRemoteHosts(loadConfig(root).remoteValidation).map((h) => h.host)).toEqual([
      "bee",
      "mac1",
      "linux2",
    ]);
    const text = readFileSync(join(root, "repoos.toml"), "utf8");
    // One definition, replaced in place — no root duplicate to override it.
    expect(text.match(/tailscaleHosts\s*=/g)).toHaveLength(1);
    expect(text).toContain('tailscaleHosts = ["bee", "mac1", "linux2"]');
    await cleanup();
  });

  it("reorders a plain user@host pool through the config save path", async () => {
    const root = repo(
      '[remoteValidation]\nprovider = "tailscale"\n' +
        'tailscaleHost = "peck@mini"\n' +
        'tailscaleHosts = ["peck@mini", "nick@bee"]\n',
    );
    const res = await patch(root, {
      "remoteValidation.tailscaleHosts": ["nick@bee", "peck@mini"],
    });
    expect(res.status).toBe(200);
    expect(resolveRemoteHosts(loadConfig(root).remoteValidation)).toEqual([
      { host: "bee", user: "nick" },
      { host: "mini", user: "peck" },
    ]);
    expect(readFileSync(join(root, "repoos.toml"), "utf8")).toContain(
      'tailscaleHosts = ["nick@bee", "peck@mini"]',
    );
    await cleanup();
  });

  it("repoints an in-section `tailscaleHost` shorthand when that host is removed", async () => {
    const root = repo('[remoteValidation]\nprovider = "tailscale"\ntailscaleHost = "bee"\n');
    const res = await patch(root, {
      "remoteValidation.containerImage": "repoos-ci",
      "remoteValidation.tailscaleHosts": ["mac1"],
    });
    expect(res.status).toBe(200);
    expect(resolveRemoteHosts(loadConfig(root).remoteValidation).map((h) => h.host)).toEqual([
      "mac1",
    ]);
    const text = readFileSync(join(root, "repoos.toml"), "utf8");
    expect(text).toContain('tailscaleHost = "mac1"');
    expect(text.match(/tailscaleHost\s*=/g)).toHaveLength(1);
    await cleanup();
  });

  it("inserts a missing dotted key into its existing section, not duplicated at root", async () => {
    const root = repo("[remoteValidation]\nenabled = true\n");
    const res = await patch(root, { "remoteValidation.fallbackToLocal": true });
    expect(res.status).toBe(200);
    expect(loadConfig(root).remoteValidation?.fallbackToLocal).toBe(true);
    const text = readFileSync(join(root, "repoos.toml"), "utf8");
    expect(text).toContain("fallbackToLocal = true");
    expect(text).not.toContain("remoteValidation.fallbackToLocal");
    await cleanup();
  });

  it("collapses a duplicated key (root + section) down to the patched value", async () => {
    // The shape the old bug produced: a root line and an in-section line both
    // resolving to the same key, with the later one silently winning.
    const root = repo(
      'remoteValidation.containerImage = "old"\n\n[remoteValidation]\ncontainerImage = "stale"\n',
    );
    expect(loadConfig(root).remoteValidation?.containerImage).toBe("stale");
    const res = await patch(root, { "remoteValidation.containerImage": "repoos-ci" });
    expect(res.status).toBe(200);
    expect(loadConfig(root).remoteValidation?.containerImage).toBe("repoos-ci");
    const text = readFileSync(join(root, "repoos.toml"), "utf8");
    expect(text.match(/containerImage\s*=/g)).toHaveLength(1);
    await cleanup();
  });

  it("never touches a same-named leaf under an UNRELATED section (#0521 review blast-radius)", async () => {
    // The section-aware rewrite/dedup path applies to every dotted key, so
    // lock down that it only ever matches lines resolving to the key being
    // patched — a leaf with the same name in another table is a different key.
    const root = repo(
      '[release]\ncontainerImage = "keep-me"\n\n' +
        '[remoteValidation]\nenabled = true\ncontainerImage = "old"\n',
    );
    const res = await patch(root, { "remoteValidation.containerImage": "repoos-ci" });
    expect(res.status).toBe(200);
    expect(loadConfig(root).remoteValidation?.containerImage).toBe("repoos-ci");
    const text = readFileSync(join(root, "repoos.toml"), "utf8");
    expect(text).toContain('containerImage = "keep-me"');
    expect(text.match(/containerImage\s*=/g)).toHaveLength(2);
    await cleanup();
  });

  it("still rewrites a root-scoped line in place for a key with no section yet", async () => {
    const root = repo('ntfyTopic = "old"\n\n[remoteValidation]\nenabled = true\n');
    const res = await patch(root, { ntfyTopic: "repoos_new" });
    expect(res.status).toBe(200);
    const text = readFileSync(join(root, "repoos.toml"), "utf8");
    expect(text).toContain('ntfyTopic = "repoos_new"');
    expect(text.match(/ntfyTopic\s*=/g)).toHaveLength(1);
    await cleanup();
  });
});

/**
 * Real HTTP round-trip (#0521 review): a second review reported that the
 * status endpoint reads the server's startup config after a Settings save,
 * so the drawer's post-save refresh sees stale data and reports the save
 * "may have failed". A later review: PATCH updated `tailscaleHosts` but the
 * live dispatcher (`hosts` / `validate`) kept the boot-time pool. Verified
 * here: `startServer`'s status route, `patchConfig`, and `TailscaleRunner`
 * share the same `repoos.config` object (mutated in place via `Object.assign`)
 * and `applyConfig` rebuilds the pool from it.
 */
describe("GET /api/remote-validation/status reflects a same-process save immediately", () => {
  it("shows the shortened pool right after saving it, not the pre-save one", async () => {
    const root = repo(
      "[remoteValidation]\n" +
        "enabled = true\n" +
        'provider = "tailscale"\n' +
        'tailscaleHost = "bee"\n' +
        'tailscaleHosts = ["bee", "mac1", "other"]\n\n' +
        "[[remoteValidation.tailscaleHosts]]\n" +
        'host = "mac1"\nos = "macos"\n',
    );
    const server = await startServer({ root, host: "127.0.0.1", port: 0 });
    try {
      const patchRes = await fetch(`${server.url}/api/config`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          "remoteValidation.containerImage": "repoos-ci",
          "remoteValidation.tailscaleHosts": ["bee", "mac1"],
        }),
      });
      expect(patchRes.status).toBe(200);

      const statusRes = await fetch(`${server.url}/api/remote-validation/status`);
      expect(statusRes.status).toBe(200);
      const status = (await statusRes.json()) as {
        tailscaleHosts: string[];
        hosts: Array<{ host: string }>;
        running: boolean;
        hostPoolEditable: boolean;
      };
      expect(status.running).toBe(true);
      expect(status.tailscaleHosts.sort()).toEqual(["bee", "mac1"]);
      expect(status.hosts.map((h) => h.host).sort()).toEqual(["bee", "mac1"]);
      expect(status.hostPoolEditable).toBe(false);
    } finally {
      await server.close();
    }
    await cleanup();
  });
});
