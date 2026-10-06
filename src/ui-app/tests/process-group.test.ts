import { describe, expect, it } from "vitest";
import { patternKillWarning, processGroupKillSupported } from "../../core/process-group.js";

describe("patternKillWarning", () => {
  it("warns on killall", () => {
    expect(patternKillWarning("killall -9 vite")).toMatch(/killall/i);
  });

  it("warns on pkill -f patterns", () => {
    expect(patternKillWarning('pkill -f "vite"')).toMatch(/pkill/i);
  });

  it("allows pkill --pid", () => {
    expect(patternKillWarning("pkill --pid 12345")).toBeNull();
  });

  it("allows unrelated shell commands", () => {
    expect(patternKillWarning("kill 12345")).toBeNull();
    expect(patternKillWarning("repoos check")).toBeNull();
  });
});

describe("processGroupKillSupported", () => {
  it("matches the platform", () => {
    expect(processGroupKillSupported()).toBe(process.platform !== "win32");
  });
});
