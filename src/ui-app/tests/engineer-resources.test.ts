import { describe, expect, it } from "vitest";
import type { RepoOSConfig } from "../../core/types.js";
import {
  applyEngineerResourceEnv,
  engineerResourceEnv,
  isHeavyInvocation,
} from "../../core/engineer-resources.js";
import { heavySlotLimit, vitestMaxWorkers } from "../../core/resource-limits.js";

function config(overrides: Partial<RepoOSConfig> = {}): RepoOSConfig {
  return {
    root: "/tmp/repo",
    workDir: "work",
    docsDir: "docs",
    skillsDir: "skills",
    taskExtensions: [".md"],
    defaultStatus: "inbox",
    defaultAssignee: "unassigned",
    cacheDir: ".repoos",
    ...overrides,
  };
}

describe("engineer resource env (#0961)", () => {
  it("defaults vitest and playwright workers to 2", () => {
    const env = engineerResourceEnv(config());
    expect(env.VITEST_MAX_WORKERS).toBe("2");
    expect(env.VITEST_MAX_THREADS).toBe("2");
    expect(env.PLAYWRIGHT_WORKERS).toBe("2");
    expect(env.PLAYWRIGHT_MAX_WORKERS).toBe("2");
    expect(vitestMaxWorkers(config())).toBe(2);
    expect(heavySlotLimit(config())).toBe(2);
  });

  it("writes the configured caps into the spawn environment", () => {
    const env: NodeJS.ProcessEnv = { PATH: "/usr/bin" };
    applyEngineerResourceEnv(
      env,
      config({ heavySlots: 2, vitest: { maxWorkers: 3 }, playwright: { workers: 1 } }),
    );
    expect(env.VITEST_MAX_WORKERS).toBe("3");
    expect(env.PLAYWRIGHT_WORKERS).toBe("1");
    expect(env.PATH).toBe("/usr/bin");
  });

  it("classifies heavy engineer commands", () => {
    const cases: Array<[string, string[], boolean]> = [
      ["bun", ["run", "build"], true],
      ["bun", ["run", "build:ui"], true],
      ["bun", ["run", "test"], true],
      ["bun", ["run", "fmt"], false],
      ["vitest", ["run"], true],
      ["vue-tsc", ["--noEmit"], true],
      ["playwright", ["test"], true],
      ["bun", ["x", "tsc"], true],
    ];
    for (const [tool, args, heavy] of cases) {
      expect(isHeavyInvocation(tool, args)).toBe(heavy);
    }
  });
});
