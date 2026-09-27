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
    // Order stays parse-stable (shorthand first) and mac1 keeps its row attrs.
    expect(hosts).toEqual([{ host: "bee" }, { host: "mac1", os: "macos", labels: ["apple"] }]);
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
});
