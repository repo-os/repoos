import { describe, expect, it } from "vitest";
import { ensureTailscaleHttps, type TailscaleExec } from "../../core/tailscale.js";

const HOST = "box.tail1234.ts.net";
const status = (over: object = {}) =>
  JSON.stringify({
    BackendState: "Running",
    CertDomains: [HOST],
    Self: { DNSName: `${HOST}.` },
    ...over,
  });

function fake(serveCfg: object, st = status()) {
  const calls: string[][] = [];
  const exec: TailscaleExec = async (args) => {
    calls.push(args);
    if (args[0] === "status") return st;
    if (args[1] === "status") return JSON.stringify(serveCfg);
    return "";
  };
  return { exec, calls };
}
const web = (p: number, proxy: string) => ({
  TCP: { [p]: { HTTPS: true } },
  Web: { [`${HOST}:${p}`]: { Handlers: { "/": { Proxy: proxy } } } },
});

describe("ensureTailscaleHttps", () => {
  it("serves on 443 when nothing is configured", async () => {
    const { exec, calls } = fake({});
    const r = await ensureTailscaleHttps(7515, exec, async () => true);
    expect(r.url).toBe(`https://${HOST}`);
    expect(calls.at(-1)).toEqual(["serve", "--bg", "--https=443", "http://127.0.0.1:7515"]);
  });

  it("is idempotent when the mapping is already ours", async () => {
    const { exec, calls } = fake(web(443, "http://127.0.0.1:7515"));
    const r = await ensureTailscaleHttps(7515, exec, async () => true);
    expect(r.url).toBe(`https://${HOST}`);
    expect(calls.some((a) => a.includes("--bg"))).toBe(false);
  });

  it("leaves someone else's live mapping alone and uses the next port", async () => {
    const { exec, calls } = fake(web(443, "http://127.0.0.1:3000"));
    const r = await ensureTailscaleHttps(7515, exec, async () => true);
    expect(r.url).toBe(`https://${HOST}:8443`);
    expect(calls.at(-1)).toContain("--https=8443");
  });

  it("reclaims a stale loopback mapping nothing is listening on", async () => {
    const { exec, calls } = fake(web(443, "http://127.0.0.1:7999"));
    const r = await ensureTailscaleHttps(7515, exec, async () => false);
    expect(r.url).toBe(`https://${HOST}`);
    expect(calls.at(-1)).toContain("--https=443");
  });

  it("never overwrites a non-loopback mapping", async () => {
    const { exec } = fake(web(443, "http://10.0.0.5:80"));
    const r = await ensureTailscaleHttps(7515, exec, async () => false);
    expect(r.url).toBe(`https://${HOST}:8443`);
  });

  it("hints when HTTPS certificates are disabled", async () => {
    const { exec } = fake({}, status({ CertDomains: [] }));
    const r = await ensureTailscaleHttps(7515, exec);
    expect(r.url).toBeUndefined();
    expect(r.reason).toMatch(/HTTPS Certificates/);
  });

  it("is silent when Tailscale isn't running", async () => {
    const { exec } = fake({}, status({ BackendState: "Stopped" }));
    expect(await ensureTailscaleHttps(7515, exec)).toEqual({});
  });

  it("never throws when the CLI fails", async () => {
    const r = await ensureTailscaleHttps(7515, async () => {
      throw new Error("boom");
    });
    expect(r.reason).toMatch(/boom/);
  });

  it("explains the operator fix when serve config is denied", async () => {
    const r = await ensureTailscaleHttps(7515, async (args) => {
      if (args[0] === "serve" && args[1] === "--bg") {
        throw new Error("sending serve config: Access denied: serve config denied");
      }
      return args[0] === "status" ? status() : "{}";
    });
    expect(r.reason).toMatch(/tailscale set --operator=\$USER/);
  });
});
