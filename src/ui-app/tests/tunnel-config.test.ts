import { describe, expect, it } from "vitest";
import {
  ACCESS_POLICY_NAME,
  addEmail,
  buildAccessAppBody,
  buildAccessPolicyBody,
  hostnameWarning,
  inferHostname,
  isValidAppName,
  isValidEmail,
  parseEmailList,
  parseTunnelSection,
  removeEmail,
  renderCloudflaredConfig,
  serializeTunnelSection,
  upsertTunnelSection,
  type TunnelConfig,
} from "../../core/tunnel";

const FULL_DOC = `# RepoOS configuration.

workDir = "work"
defaultStatus = "inbox"

[[agents]]
name = "engineer"
enabled = true

[tunnel]
provider = "cloudflare"
enabled = true
name = "repoos-local"
domain = "repoos.org"
tunnel_id = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"

[tunnel.apps.dashboard]
hostname = "dashboard.repoos.org"
service = "http://localhost:3000"
access = ["alice@example.com", "bob@example.com"]

[tunnel.apps.admin]
hostname = "admin.repoos.org"
service = "http://localhost:3001"
access = []
`;

const cfg: TunnelConfig = {
  provider: "cloudflare",
  enabled: true,
  name: "repoos-local",
  domain: "repoos.org",
  tunnelId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
  apps: {
    dashboard: {
      hostname: "dashboard.repoos.org",
      service: "http://localhost:3000",
      access: ["alice@example.com", "bob@example.com"],
    },
  },
};

describe("parseTunnelSection", () => {
  it("reads provider, name, domain, tunnel id and apps from a full repoos.toml", () => {
    const out = parseTunnelSection(FULL_DOC);
    expect(out.provider).toBe("cloudflare");
    expect(out.enabled).toBe(true);
    expect(out.name).toBe("repoos-local");
    expect(out.domain).toBe("repoos.org");
    expect(out.tunnelId).toBe("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");
    expect(out.apps.dashboard).toEqual({
      hostname: "dashboard.repoos.org",
      service: "http://localhost:3000",
      access: ["alice@example.com", "bob@example.com"],
    });
    expect(out.apps.admin.access).toEqual([]);
  });

  it("returns a default config when no [tunnel] section exists", () => {
    const out = parseTunnelSection('workDir = "work"\n');
    expect(out.name).toBe("repoos-local");
    expect(out.enabled).toBe(false);
    expect(out.tunnelId).toBe("");
    expect(out.apps).toEqual({});
  });
});

describe("serializeTunnelSection", () => {
  it("writes every field and quotes strings/arrays", () => {
    const text = serializeTunnelSection(cfg);
    expect(text).toContain("[tunnel]");
    expect(text).toContain('provider = "cloudflare"');
    expect(text).toContain("enabled = true");
    expect(text).toContain('name = "repoos-local"');
    expect(text).toContain('domain = "repoos.org"');
    expect(text).toContain('tunnel_id = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"');
    expect(text).toContain("[tunnel.apps.dashboard]");
    expect(text).toContain('hostname = "dashboard.repoos.org"');
    expect(text).toContain('access = ["alice@example.com", "bob@example.com"]');
  });

  it("round-trips through parseTunnelSection", () => {
    const out = parseTunnelSection(serializeTunnelSection(cfg));
    expect(out).toEqual(cfg);
  });
});

describe("upsertTunnelSection", () => {
  it("replaces an existing [tunnel] block and preserves all other sections", () => {
    const next: TunnelConfig = { ...cfg, apps: {} };
    const updated = upsertTunnelSection(FULL_DOC, next);
    expect(updated).toContain('workDir = "work"');
    expect(updated).toContain('name = "engineer"');
    expect(updated).toContain('defaultStatus = "inbox"');
    expect(updated).toContain('[tunnel]\nprovider = "cloudflare"');
    expect(updated).not.toContain("[tunnel.apps.dashboard]");
    expect(updated).not.toContain("[tunnel.apps.admin]");
  });

  it("re-parsing after an upsert yields the new state", () => {
    const updated = upsertTunnelSection(FULL_DOC, cfg);
    expect(parseTunnelSection(updated)).toEqual(cfg);
  });

  it("appends the block when no [tunnel] section exists", () => {
    const base = 'workDir = "work"\n[[agents]]\nname = "x"\n';
    const updated = upsertTunnelSection(base, cfg);
    expect(updated).toContain('workDir = "work"');
    expect(updated).toContain("[[agents]]");
    expect(parseTunnelSection(updated).name).toBe("repoos-local");
  });
});

describe("hostname inference + validation", () => {
  it("infers <name>.<domain> when --domain is omitted", () => {
    expect(inferHostname("dashboard", "repoos.org")).toBe("dashboard.repoos.org");
  });

  it("warns for hostnames deeper than one label under the base domain", () => {
    expect(hostnameWarning("dashboard.repoos.org", "repoos.org")).toBeNull();
    expect(hostnameWarning("dashboard.app.repoos.org", "repoos.org")).toContain(
      "deeper than one label",
    );
  });

  it("validates app names and emails", () => {
    expect(isValidAppName("dashboard")).toBe(true);
    expect(isValidAppName("my-app_2")).toBe(true);
    expect(isValidAppName("../evil")).toBe(false);
    expect(isValidAppName("has.dot")).toBe(false);
    expect(isValidEmail("alice@example.com")).toBe(true);
    expect(isValidEmail("not-an-email")).toBe(false);
  });

  it("parses comma-separated allowlists, trims and dedupes", () => {
    expect(parseEmailList("a@x.com, b@y.com,a@x.com")).toEqual(["a@x.com", "b@y.com"]);
    expect(parseEmailList(undefined)).toEqual([]);
  });
});

describe("allowlist mutation", () => {
  it("adds and removes emails without duplicates", () => {
    expect(addEmail(["a@x.com"], "a@x.com")).toEqual(["a@x.com"]);
    expect(addEmail(["a@x.com"], "b@y.com")).toEqual(["a@x.com", "b@y.com"]);
    expect(removeEmail(["a@x.com", "b@y.com"], "a@x.com")).toEqual(["b@y.com"]);
    expect(removeEmail(["a@x.com"], "b@y.com")).toEqual(["a@x.com"]);
  });
});

describe("derived cloudflared config", () => {
  it("renders one ingress rule per app plus a trailing 404 catch-all", () => {
    const yaml = renderCloudflaredConfig(
      cfg,
      "/home/nick/.cloudflared/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.json",
    );
    expect(yaml).toContain("tunnel: aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");
    expect(yaml).toContain(
      "credentials-file: /home/nick/.cloudflared/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.json",
    );
    expect(yaml).toContain("ingress:");
    expect(yaml).toContain("  - hostname: dashboard.repoos.org");
    expect(yaml).toContain("    service: http://localhost:3000");
    // the catch-all is last, with no hostname
    const lines = yaml.trimEnd().split("\n");
    expect(lines[lines.length - 1]).toBe("  - service: http_status:404");
  });

  it("emits only the catch-all when no apps are configured", () => {
    const yaml = renderCloudflaredConfig({ ...cfg, apps: {} }, "/x.json");
    const lines = yaml.trimEnd().split("\n");
    expect(lines.filter((l) => l.includes("hostname:"))).toEqual([]);
    expect(lines[lines.length - 1]).toBe("  - service: http_status:404");
  });
});

describe("Cloudflare Access payloads", () => {
  it("creates a self-hosted app body for the exact hostname", () => {
    const body = buildAccessAppBody("dashboard.repoos.org");
    expect(body.type).toBe("self_hosted");
    expect(body.domain).toBe("dashboard.repoos.org");
    expect(body.auto_redirect_to_identity).toBe(true);
  });

  it("builds an allow policy whose include list is exactly the emails", () => {
    const body = buildAccessPolicyBody(["alice@example.com", "bob@example.com"]);
    expect(body.name).toBe(ACCESS_POLICY_NAME);
    expect(body.decision).toBe("allow");
    expect(body.include).toEqual([
      { email: { email: "alice@example.com" } },
      { email: { email: "bob@example.com" } },
    ]);
  });

  it("an empty allowlist matches nothing (safe default deny)", () => {
    const body = buildAccessPolicyBody([]);
    expect(body.include).toEqual([]);
  });
});
