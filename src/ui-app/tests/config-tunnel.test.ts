import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { getConfigSchema, loadConfig } from "../../core/config";
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
});
