/**
 * #0674 — close-out dependency handling: config keys, environment classification,
 * and candidate install policy.
 */
import { describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getConfigSchema, loadConfig, SUPPORTED_TOML_KEYS } from "../../core/config.js";
import {
  candidateHasUsableNodeModules,
  candidateMissingDependenciesAdvice,
  checkPlanStartsWithDependencyInstall,
  commandLooksLikeDependencyInstall,
  hasDependencyInputChange,
  isCloseOutEnvironmentFailure,
  resolveCloseOutCandidateMode,
  shouldPrepareCandidateDependencies,
  shouldRunCandidateInstall,
} from "../../core/dependency-install.js";
import { DEFAULT_PROFILE, type CheckPlan } from "../../core/check-plan.js";
import { classifyFailure, describeCloseOutFailure } from "../../core/close-out-failure.js";

function withToml(toml: string): { cfg: ReturnType<typeof loadConfig>; clean: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "repoos-co-deps-"));
  writeFileSync(join(dir, "repoos.toml"), toml);
  writeFileSync(join(dir, "package.json"), '{"name":"t"}\n');
  return {
    cfg: loadConfig(dir),
    clean: () => rmSync(dir, { recursive: true, force: true }),
  };
}

describe("dependency input paths (#0449 / #0674)", () => {
  it("detects package manifests and lockfiles", () => {
    expect(hasDependencyInputChange(["apps/web/package.json"])).toBe(true);
    expect(hasDependencyInputChange(["bun.lock"])).toBe(true);
    expect(hasDependencyInputChange(["src/a.ts"])).toBe(false);
  });
});

describe("isCloseOutEnvironmentFailure (#0674)", () => {
  it("flags unresolved imports, exit 127, Denied ID, and install failures", () => {
    expect(isCloseOutEnvironmentFailure('check failed: Could not resolve "hono"')).toBe(true);
    expect(isCloseOutEnvironmentFailure("build failed: error: script exited with code 127")).toBe(
      true,
    );
    expect(
      isCloseOutEnvironmentFailure("check failed: Denied ID /repo/node_modules/foo?worker&url"),
    ).toBe(true);
    expect(isCloseOutEnvironmentFailure("dependency install failed: bun missing")).toBe(true);
    expect(isCloseOutEnvironmentFailure("check failed: expect(received).toBe(1)")).toBe(false);
  });
});

describe("missing candidate node_modules (#0712)", () => {
  it("detects install-shaped commands", () => {
    expect(commandLooksLikeDependencyInstall("bun install --frozen-lockfile")).toBe(true);
    expect(commandLooksLikeDependencyInstall("bun install && bun run build")).toBe(true);
    expect(commandLooksLikeDependencyInstall("bun run build")).toBe(false);
  });

  it("honours a leading full-profile install step", () => {
    const plan: CheckPlan = {
      version: 1,
      defaultProfile: DEFAULT_PROFILE,
      steps: [
        {
          name: "install",
          command: "bun install --frozen-lockfile",
          timeoutMs: 60_000,
          required: true,
          profiles: [],
          whenChanged: [],
          requires: [],
          runsOn: [],
          dependsOn: [],
        },
        {
          name: "build",
          kind: "build",
          timeoutMs: 60_000,
          required: true,
          profiles: [],
          whenChanged: [],
          requires: [],
          runsOn: [],
          dependsOn: [],
        },
      ],
      source: "declared",
      errors: [],
    };
    const { cfg, clean } = withToml("");
    try {
      expect(checkPlanStartsWithDependencyInstall(plan, cfg)).toBe(true);
      expect(shouldPrepareCandidateDependencies(cfg, cfg.root, ["src/a.ts"], plan)).toBe(false);
    } finally {
      clean();
    }
  });

  it("prepares dependencies when the candidate has no node_modules", () => {
    const { cfg, clean } = withToml("");
    const plan: CheckPlan = {
      version: 1,
      defaultProfile: DEFAULT_PROFILE,
      steps: [],
      source: "empty",
      errors: [],
    };
    try {
      writeFileSync(join(cfg.root, "bun.lock"), "# stub\n");
      expect(candidateHasUsableNodeModules(cfg.root)).toBe(false);
      expect(shouldPrepareCandidateDependencies(cfg, cfg.root, ["src/a.ts"], plan)).toBe(true);
    } finally {
      clean();
    }
  });

  it("treats a broken node_modules symlink as missing", () => {
    const { cfg, clean } = withToml("");
    try {
      symlinkSync(join(cfg.root, "missing-target"), join(cfg.root, "node_modules"));
      expect(candidateHasUsableNodeModules(cfg.root)).toBe(false);
    } finally {
      clean();
    }
  });

  it("advises when neither checkout can install", () => {
    const { cfg, clean } = withToml("");
    try {
      const advice = candidateMissingDependenciesAdvice(cfg.root, cfg);
      expect(advice).toMatch(/no node_modules/i);
      expect(advice).toMatch(/primary checkout does not either/i);
      expect(advice).toMatch(/own-install/i);
    } finally {
      clean();
    }
  });
});

describe("candidate install policy (#0674)", () => {
  it("own-install still only runs a frozen install when package inputs changed", () => {
    const { cfg, clean } = withToml('[closeOut]\ncandidate = "own-install"\n');
    try {
      expect(resolveCloseOutCandidateMode(cfg)).toBe("own-install");
      expect(shouldRunCandidateInstall(cfg, ["src/a.ts"])).toBe(false);
      expect(shouldRunCandidateInstall(cfg, ["package.json"])).toBe(true);
    } finally {
      clean();
    }
  });

  it("symlink-main only installs when the merged diff changes package inputs", () => {
    const { cfg, clean } = withToml("");
    try {
      expect(resolveCloseOutCandidateMode(cfg)).toBe("symlink-main");
      expect(shouldRunCandidateInstall(cfg, ["src/a.ts"])).toBe(false);
      expect(shouldRunCandidateInstall(cfg, ["package.json"])).toBe(true);
    } finally {
      clean();
    }
  });
});

describe("close-out failure mapping (#0674)", () => {
  it("classifies environment failures and offers refresh-install-retry", () => {
    const reason = 'check failed: Rolldown failed to resolve import "maplibre-gl"';
    expect(classifyFailure("validating", reason)).toBe("environment");
    const card = describeCloseOutFailure("validating", reason);
    expect(card.action).toBe("refresh-install-retry");
    expect(card.hint).toMatch(/stale/i);
  });
});

describe("[closeOut] dependency config keys (#0674)", () => {
  it("reads candidate mode and install commands", () => {
    const { cfg, clean } = withToml(
      `[closeOut]\ncandidate = "own-install"\ninstallCommand = "make deps"\npostPublishCommand = "make main-deps"\n`,
    );
    try {
      expect(cfg.closeOut?.candidate).toBe("own-install");
      expect(cfg.closeOut?.installCommand).toBe("make deps");
      expect(cfg.closeOut?.postPublishCommand).toBe("make main-deps");
    } finally {
      clean();
    }
  });

  it("warns on invalid candidate values", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { clean } = withToml('[closeOut]\ncandidate = "shared"\n');
    try {
      expect(warn).toHaveBeenCalledWith(expect.stringContaining("candidate must be"));
    } finally {
      warn.mockRestore();
      clean();
    }
  });

  it("exposes Settings schema fields and documents TOML keys", () => {
    for (const key of [
      "closeOut.candidate",
      "closeOut.installCommand",
      "closeOut.postPublishCommand",
      "worktrees.candidate",
      "worktrees.installCommand",
    ]) {
      expect(SUPPORTED_TOML_KEYS).toContain(key);
    }
    for (const key of [
      "closeOut.candidate",
      "closeOut.installCommand",
      "closeOut.postPublishCommand",
    ]) {
      expect(getConfigSchema().some((f) => f.key === key)).toBe(true);
    }
  });
});
