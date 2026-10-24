import { describe, expect, it, vi } from "vitest";
import type { DetectedAgent } from "../../core/detect";
import { offerCodingAgentInstall } from "../../commands/init";

const sample = (installed: boolean, auth: boolean | null = null): DetectedAgent => ({
  id: installed ? "present" : "missing",
  name: installed ? "Present Agent" : "Missing Agent",
  cli: "codex",
  binary: "agent",
  drivable: true,
  installHint: "npm i -g example-agent",
  authHint: "agent login",
  installed,
  path: installed ? "/bin/agent" : null,
  version: null,
  headless: installed ? true : null,
  auth,
});

describe("init coding-agent install offer", () => {
  it("skips after the default-no question without detecting or installing", async () => {
    const detect = vi.fn();
    const install = vi.fn();
    await offerCodingAgentInstall({ isTTY: true, ask: async () => "", detect, install });
    expect(detect).not.toHaveBeenCalled();
    expect(install).not.toHaveBeenCalled();
  });

  it("shows detected agents and installs only selected, confirmed agents", async () => {
    const install = vi.fn(async () => ({ ok: true, summary: "installed" }));
    const ask = vi.fn().mockResolvedValueOnce("y").mockResolvedValueOnce("y");
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await offerCodingAgentInstall({
      isTTY: true,
      ask,
      detect: async () => [sample(true, true), sample(false)],
      select: async (agents) => agents,
      install,
    });
    expect(install).toHaveBeenCalledWith("npm i -g example-agent");
    expect(log.mock.calls.flat().join(" ")).toContain("Present Agent");
    log.mockRestore();
  });

  it("prints the manual command after failure and continues to sign-in guidance", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const ask = vi.fn().mockResolvedValueOnce("yes").mockResolvedValueOnce("yes");
    await expect(offerCodingAgentInstall({
      isTTY: true,
      ask,
      detect: async () => [sample(true, false), sample(false)],
      select: async (agents) => agents,
      install: async () => ({ ok: false, summary: "permission denied" }),
    })).resolves.toBeUndefined();
    const output = log.mock.calls.flat().join(" ");
    expect(output).toContain("To install manually, run: npm i -g example-agent");
    expect(output).toContain("agent login");
    log.mockRestore();
  });

  it("never prompts or detects without a TTY", async () => {
    const ask = vi.fn();
    const detect = vi.fn();
    await offerCodingAgentInstall({ isTTY: false, ask, detect });
    expect(ask).not.toHaveBeenCalled();
    expect(detect).not.toHaveBeenCalled();
  });
});
