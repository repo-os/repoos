import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { getConfigSchema, loadConfig, patchTomlConfig } from "../../core/config";
import { readTunnelConfig, writeTunnelConfig } from "../../core/tunnel";

describe("Cloudflare Tunnel UI config", () => {
  it("is disabled by default and exposed as a live boolean setting", () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-tunnel-setting-"));
    const config = loadConfig(root);
    const field = getConfigSchema().find((candidate) => candidate.key === "tunnelEnabled");

    expect(config.tunnelEnabled).toBe(false);
    expect(field).toMatchObject({ type: "boolean", tier: "live", default: false });
  });

  it("persists the opt-in without changing an existing tunnel section", () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-tunnel-setting-"));
    const path = join(root, "repoos.toml");
    writeFileSync(path, '[tunnel]\nname = "repoos-local"\ntunnel_id = "abc-123"\n', "utf8");

    const tunnel = readTunnelConfig(root);
    tunnel.enabled = true;
    writeTunnelConfig(root, tunnel);

    expect(loadConfig(root).tunnelEnabled).toBe(true);
    expect(readFileSync(path, "utf8")).toContain('tunnel_id = "abc-123"');
  });

  it("saves a brand-new scalar as root-level even when [[array-of-tables]] blocks follow", () => {
    // A new key with no existing line to update in place used to be appended
    // at the very end of the file. When the file ends with `[[agents]]`
    // blocks, that landed the new key inside the last table instead of root
    // scope, so it silently never read back (#ntfy settings bug).
    const root = mkdtempSync(join(tmpdir(), "repoos-toml-root-scalar-"));
    const path = join(root, "repoos.toml");
    writeFileSync(
      path,
      [
        'theme = "dark"',
        "",
        "[[agents]]",
        'name = "engineer"',
        'cli = "opencode"',
        "enabled = true",
      ].join("\n"),
      "utf8",
    );

    patchTomlConfig(path, { ntfyEnabled: true, ntfyTopic: "repoos_myproject" });

    const config = loadConfig(root);
    expect(config.ntfyEnabled).toBe(true);
    expect(config.ntfyTopic).toBe("repoos_myproject");
    // The agent table must stay clean — no stray root keys nested inside it.
    expect(Object.keys((config.agents ?? [])[0])).toEqual(["name", "cli", "enabled"]);

    // A second save (key now exists) must update in place, not duplicate or
    // re-append after the table.
    patchTomlConfig(path, { ntfyTopic: "repoos_other" });
    expect(loadConfig(root).ntfyTopic).toBe("repoos_other");
    expect(loadConfig(root).agents ?? []).toHaveLength(1);
  });
});
