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
