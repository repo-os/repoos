import { describe, expect, it } from "vitest";
import { renderServeBanner } from "./serve.js";

describe("renderServeBanner", () => {
  const rows = [
    { label: "Local", value: "http://127.0.0.1:7515" },
    { label: "Tailnet HTTPS", value: "x" },
  ];

  it("shows the version and aligns labels", () => {
    const out = renderServeBanner("1.2.3", rows);
    expect(out).toContain("RepoOS v1.2.3");
    expect(out).toContain("Local          http://127.0.0.1:7515");
  });

  it("names the bind address on localhost and tailnet rows", () => {
    const localOnly = renderServeBanner("1.0.0", [
      { label: "Bind", value: "127.0.0.1 (localhost only)" },
      { label: "Local", value: "http://127.0.0.1:7515" },
    ]);
    expect(localOnly).toMatch(/Bind\s+127\.0\.0\.1/);

    const tailscale = renderServeBanner("1.0.0", [
      {
        label: "Bind",
        value: "0.0.0.0 (all interfaces — Tailscale detected; pass --host 127.0.0.1 for localhost only)",
      },
      { label: "Local", value: "http://127.0.0.1:7515" },
      { label: "Tailnet", value: "http://100.64.0.1:7515" },
    ]);
    expect(tailscale).toMatch(/Bind\s+0\.0\.0\.0/);
    expect(tailscale).toContain("--host 127.0.0.1");
  });

  it("splits an HTTPS warning into problem, fix and link", () => {
    const out = renderServeBanner(
      "1.2.3",
      rows,
      "HTTPS certificates aren't enabled for your tailnet — turn on MagicDNS and HTTPS Certificates at https://login.tailscale.com/admin/dns",
    );
    expect(out).toContain("Tailscale HTTPS unavailable");
    expect(out).toContain("HTTPS certificates aren't enabled for your tailnet");
    expect(out).toContain("Fix: turn on MagicDNS and HTTPS Certificates at");
    expect(out).toContain("https://login.tailscale.com/admin/dns");
    expect(out).toContain("--no-tailscale-https");
  });

  it("handles a reason without a fix link", () => {
    const out = renderServeBanner("1", rows, "all ports in use");
    expect(out).toContain("all ports in use");
    expect(out).not.toContain("Fix:");
  });

  it("shows a shell command from the fix on its own line", () => {
    const out = renderServeBanner(
      "1",
      rows,
      "this user isn't allowed to change Tailscale's serve config — run this once, then restart `repoos serve`: `sudo tailscale set --operator=$USER`",
    );
    expect(out).toContain("Fix: run this once, then restart `repoos serve`");
    expect(out).toContain("$ sudo tailscale set --operator=$USER");
  });
});
