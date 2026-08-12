import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildTunnelPublishPlan, validateTunnelPublishInput } from "../../core/tunnel-assistant";
import { startServer, type ServerHandle } from "../../server/server";

let server: ServerHandle | undefined;
let fixtureRoot: string | undefined;

afterEach(async () => {
  await server?.close();
  server = undefined;
  if (fixtureRoot) rmSync(fixtureRoot, { recursive: true, force: true });
  fixtureRoot = undefined;
});

describe("Cloudflare publishing assistant", () => {
  it("maps repoos.org/dev/7171 to the expected origin and commands", () => {
    const plan = buildTunnelPublishPlan({
      zone: "repoos.org",
      app: "dev",
      port: 7171,
      emails: ["alice@example.com"],
      runMode: "foreground",
    });
    expect(plan.publicUrl).toBe("https://dev.repoos.org");
    expect(plan.localOrigin).toBe("http://localhost:7171");
    expect(plan.commands.create).toBe(
      "repoos tunnel create dev --port 7171 --domain dev.repoos.org --allow alice@example.com",
    );
    expect(plan.commands.run).toBe("repoos tunnel start");
  });

  it("rejects malformed domains, app names, ports, and email addresses", () => {
    const errors = validateTunnelPublishInput({
      zone: "https://repoos.org",
      app: "../dev",
      port: 70000,
      emails: "not-email",
      runMode: "foreground",
    });
    expect(errors).toHaveLength(4);
  });

  it("deduplicates allowlist emails and selects background mode", () => {
    const plan = buildTunnelPublishPlan({
      zone: "repoos.org",
      app: "dev",
      port: "3000",
      emails: "a@example.com, a@example.com",
      runMode: "background",
    });
    expect(plan.emails).toEqual(["a@example.com"]);
    expect(plan.commands.run).toBe("repoos tunnel install");
    expect(JSON.stringify(plan)).not.toContain("token");
  });

  it("exposes safe readiness fields without returning a credential", async () => {
    fixtureRoot = mkdtempSync(join(tmpdir(), "repoos-tunnel-readiness-"));
    writeFileSync(
      join(fixtureRoot, "repoos.toml"),
      `[tunnel]\nname = "repoos-local"\ndomain = "repoos.org"\ntunnel_id = "tunnel-123"\n`,
    );
    server = await startServer({ root: fixtureRoot, host: "127.0.0.1", port: 0 });

    const response = await fetch(`${server.url}/api/tunnel/readiness?port=7171`);
    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, any>;
    expect(body).toMatchObject({
      configured: { tunnelName: "repoos-local", tunnelId: "tunnel-123", baseDomain: "repoos.org" },
      localOrigin: { port: 7171 },
    });
    expect(body).toHaveProperty("cloudflared.installed");
    expect(body).toHaveProperty("originCertificate.usable");
    expect(body).toHaveProperty("apiTokenStored");
    expect(body).toHaveProperty("running");
    expect(body).toHaveProperty("publishedHostnames");
    expect(JSON.stringify(body)).not.toMatch(/CLOUDFLARE_API_TOKEN|token-123/);
  });

  it("rejects an invalid readiness port before probing", async () => {
    fixtureRoot = mkdtempSync(join(tmpdir(), "repoos-tunnel-readiness-"));
    server = await startServer({ root: fixtureRoot, host: "127.0.0.1", port: 0 });
    const response = await fetch(`${server.url}/api/tunnel/readiness?port=70000`);
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: expect.stringMatching(/1 to 65535/) });
  });
});
