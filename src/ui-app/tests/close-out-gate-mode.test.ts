/**
 * #0724 — the close-out gate mode: don't re-run the full suite on what the
 * handoff gate already proved.
 *
 * The pure decision (`planCloseOutGate`) is tested across every acceptance
 * branch: identical tree → reuse, bookkeeping-only drift → reuse, real code
 * drift → scoped with the tested base, machinery path or release or `full`
 * → full, no tested base → full. Config parsing and the Settings schema
 * contract are covered beside it.
 */
import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getConfigSchema, loadConfig, SUPPORTED_TOML_KEYS } from "../../core/config.js";
import {
  DEFAULT_CLOSE_OUT_GATE,
  planCloseOutGate,
  resolveCloseOutGateMode,
  touchedFullSuitePath,
} from "../../core/close-out-gate.js";
import { planCloseOutGateFromGit } from "../../server/integration-orchestrator.js";
import type { RepoOSConfig } from "../../core/types.js";

function withToml(toml: string): RepoOSConfig {
  const dir = mkdtempSync(join(tmpdir(), "repoos-cogate-cfg-"));
  writeFileSync(join(dir, "repoos.toml"), toml);
  try {
    return loadConfig(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe("planCloseOutGate (#0724)", () => {
  it("reuses when the candidate tree equals the handoff-tested tree", () => {
    const plan = planCloseOutGate({ setting: "scoped", treesIdentical: true });
    expect(plan.mode).toBe("reuse");
    expect(plan.reuseTests).toBe(true);
    expect(plan.scoped).toBe(false);
    expect(plan.reason).toMatch(/identical/i);
  });

  it("reuses when main advanced with bookkeeping only", () => {
    const plan = planCloseOutGate({
      setting: "scoped",
      treesIdentical: false,
      mainAdvancedWithCode: false,
    });
    expect(plan.mode).toBe("reuse");
    expect(plan.reuseTests).toBe(true);
    expect(plan.reason).toMatch(/bookkeeping/i);
  });

  it("scopes to the tested base when main advanced with real code", () => {
    const plan = planCloseOutGate({
      setting: "scoped",
      treesIdentical: false,
      mainAdvancedWithCode: true,
      scopeRef: "abc123def456",
      candidateChangedPaths: ["src/a.ts", "src/b.ts"],
    });
    expect(plan.mode).toBe("scoped");
    expect(plan.scoped).toBe(true);
    expect(plan.reuseTests).toBe(false);
    expect(plan.changedRef).toBe("abc123def456");
    expect(plan.reason).toMatch(/scoped to changed vs abc123def456 \(2 path/);
  });

  it("runs full when a machinery path is touched, even if the tree would reuse", () => {
    const plan = planCloseOutGate({
      setting: "scoped",
      treesIdentical: true,
      fullSuitePaths: ["scripts/", "repoos.toml"],
      candidateChangedPaths: ["scripts/ci.sh"],
    });
    expect(plan.mode).toBe("full");
    expect(plan.reason).toMatch(/machinery path "scripts\/"/);
  });

  it("runs full for a release", () => {
    const plan = planCloseOutGate({ setting: "scoped", release: true, treesIdentical: true });
    expect(plan.mode).toBe("full");
  });

  it("honours closeOut.gate = full regardless of drift", () => {
    const plan = planCloseOutGate({ setting: "full", treesIdentical: true });
    expect(plan.mode).toBe("full");
    expect(plan.reason).toMatch(/closeOut\.gate = full/);
  });

  it("degrades a reuse setting to scoped when reuse is unsafe (no tested tree)", () => {
    const plan = planCloseOutGate({
      setting: "reuse",
      treesIdentical: false,
      mainAdvancedWithCode: true,
      scopeRef: "deadbeef",
    });
    expect(plan.mode).toBe("scoped");
  });

  it("runs full when there is no tested base to scope against", () => {
    const plan = planCloseOutGate({ setting: "scoped" });
    expect(plan.mode).toBe("full");
    expect(plan.reason).toMatch(/no tested base/i);
  });

  it("fails safe to full when the tree comparison errored", () => {
    // treesIdentical undefined + no tested base ⇒ no scopeRef ⇒ full.
    const plan = planCloseOutGate({ setting: "scoped", treesIdentical: undefined });
    expect(plan.mode).toBe("full");
  });
});

describe("touchedFullSuitePath (#0724)", () => {
  it("matches a directory prefix and an exact file", () => {
    expect(touchedFullSuitePath(["scripts/ci.sh"], ["scripts"])).toBe("scripts");
    expect(touchedFullSuitePath(["repoos.toml"], ["repoos.toml"])).toBe("repoos.toml");
  });

  it("does not match a sibling that merely shares a name prefix", () => {
    expect(touchedFullSuitePath(["scripts-extra/x.ts"], ["scripts"])).toBeNull();
    expect(touchedFullSuitePath(["src/a.ts"], ["scripts", "repoos.toml"])).toBeNull();
  });
});

describe("[closeOut] gate config (#0724)", () => {
  it("defaults to scoped", () => {
    expect(DEFAULT_CLOSE_OUT_GATE).toBe("scoped");
    expect(withToml("").closeOut?.gate).toBeUndefined();
    expect(resolveCloseOutGateMode(withToml(""))).toBe("scoped");
  });

  it("reads a valid setting", () => {
    expect(withToml('[closeOut]\ngate = "full"\n').closeOut?.gate).toBe("full");
    expect(withToml('[closeOut]\ngate = "reuse"\n').closeOut?.gate).toBe("reuse");
  });

  it("falls back to the scoped default on an invalid value", () => {
    const cfg = withToml('[closeOut]\ngate = "banana"\n');
    expect(cfg.closeOut?.gate).toBeUndefined();
    expect(resolveCloseOutGateMode(cfg)).toBe("scoped");
  });

  it("reads [check] fullSuitePaths, dropping empty rows", () => {
    const cfg = withToml('[check]\nfullSuitePaths = ["scripts/", "  ", "repoos.toml"]\n');
    expect(cfg.check?.fullSuitePaths).toEqual(["scripts/", "repoos.toml"]);
  });

  it("has a Settings schema entry and a supported TOML key", () => {
    const schema = getConfigSchema().find((f) => f.key === "closeOut.gate");
    expect(schema?.type).toBe("select");
    expect(schema?.default).toBe("scoped");
    expect(schema?.options?.map((o) => o.value)).toEqual(["scoped", "reuse", "full"]);
    expect(SUPPORTED_TOML_KEYS).toContain("closeOut.gate");
    expect(SUPPORTED_TOML_KEYS).toContain("check.fullSuitePaths");
  });
});

/**
 * The git-aware decision: compare the merged candidate tree against the tested
 * tree and main's advance. This is the part the pure test above cannot reach.
 */
describe("planCloseOutGateFromGit (#0724)", () => {
  function git(root: string, args: string[]): string {
    return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
  }

  function makeRepo(): { root: string; clean: () => void } {
    const root = mkdtempSync(join(tmpdir(), "repoos-cogate-git-"));
    git(root, ["init", "-q", "-b", "main"]);
    git(root, ["config", "user.email", "t@example.com"]);
    git(root, ["config", "user.name", "Test"]);
    mkdirSync(join(root, "work"), { recursive: true });
    mkdirSync(join(root, "src"), { recursive: true });
    writeFileSync(join(root, "src", "a.ts"), "export const a = 1;\n");
    writeFileSync(join(root, "work", "0001-t.md"), "# task\n");
    git(root, ["add", "-A"]);
    git(root, ["commit", "-q", "-m", "init"]);
    return {
      root,
      clean: () => rmSync(root, { recursive: true, force: true }),
    };
  }

  const config = (root: string, gate?: "full" | "scoped" | "reuse"): RepoOSConfig =>
    ({
      root,
      workDir: "work",
      inputsDir: "inputs",
      storiesDir: "stories",
      cacheDir: ".repoos",
      docsDir: "docs",
      ...(gate ? { closeOut: { timeoutMs: 360_000, gate } } : {}),
    }) as RepoOSConfig;

  it("reuses when the candidate tree is identical to the tested tree", async () => {
    const { root, clean } = makeRepo();
    try {
      const testedSha = git(root, ["rev-parse", "HEAD"]);
      // A merge commit that changes nothing: tree is identical to `testedSha`.
      git(root, ["checkout", "-q", "-b", "feat"]);
      git(root, ["commit", "-q", "--allow-empty", "-m", "no-op branch commit"]);
      git(root, ["checkout", "-q", "main"]);
      const plan = await planCloseOutGateFromGit({
        worktreePath: root,
        testedSha,
        currentMainSha: git(root, ["rev-parse", "main"]),
        config: config(root),
      });
      expect(plan.mode).toBe("reuse");
    } finally {
      clean();
    }
  });

  it("reuses when main advanced with bookkeeping only", async () => {
    const { root, clean } = makeRepo();
    try {
      const testedSha = git(root, ["rev-parse", "HEAD"]);
      // Main advances via a work/*.md commit; the tested tree stays the code.
      writeFileSync(join(root, "work", "0002-other.md"), "# other\n");
      git(root, ["add", "-A"]);
      git(root, ["commit", "-q", "-m", "docs(0002): update task"]);
      const plan = await planCloseOutGateFromGit({
        worktreePath: root,
        testedSha,
        currentMainSha: git(root, ["rev-parse", "main"]),
        config: config(root),
      });
      expect(plan.mode).toBe("reuse");
      expect(plan.reason).toMatch(/bookkeeping/i);
    } finally {
      clean();
    }
  });

  it("scopes to the tested base when main advanced with real code", async () => {
    const { root, clean } = makeRepo();
    try {
      const testedSha = git(root, ["rev-parse", "HEAD"]);
      writeFileSync(join(root, "src", "a.ts"), "export const a = 2;\n");
      git(root, ["add", "-A"]);
      git(root, ["commit", "-q", "-m", "feat: change a"]);
      const plan = await planCloseOutGateFromGit({
        worktreePath: root,
        testedSha,
        currentMainSha: git(root, ["rev-parse", "main"]),
        config: config(root),
      });
      expect(plan.mode).toBe("scoped");
      expect(plan.changedRef).toBe(testedSha);
      expect(plan.reason).toMatch(/scoped to changed vs/);
    } finally {
      clean();
    }
  });

  it("runs full when a machinery path changed, even with bookkeeping drift", async () => {
    const { root, clean } = makeRepo();
    try {
      const testedSha = git(root, ["rev-parse", "HEAD"]);
      mkdirSync(join(root, "scripts"), { recursive: true });
      writeFileSync(join(root, "scripts", "ci.sh"), "echo hi\n");
      git(root, ["add", "-A"]);
      git(root, ["commit", "-q", "-m", "chore: ci"]);
      const cfg = config(root);
      cfg.check = { fullSuitePaths: ["scripts"] } as RepoOSConfig["check"];
      const plan = await planCloseOutGateFromGit({
        worktreePath: root,
        testedSha,
        currentMainSha: git(root, ["rev-parse", "main"]),
        config: cfg,
      });
      expect(plan.mode).toBe("full");
      expect(plan.reason).toMatch(/machinery path "scripts"/);
    } finally {
      clean();
    }
  });

  it("runs full when no tested tree was recorded", async () => {
    const { root, clean } = makeRepo();
    try {
      const plan = await planCloseOutGateFromGit({
        worktreePath: root,
        testedSha: null,
        currentMainSha: git(root, ["rev-parse", "main"]),
        config: config(root),
      });
      expect(plan.mode).toBe("full");
    } finally {
      clean();
    }
  });

  it("honours closeOut.gate = full", async () => {
    const { root, clean } = makeRepo();
    try {
      const testedSha = git(root, ["rev-parse", "HEAD"]);
      const plan = await planCloseOutGateFromGit({
        worktreePath: root,
        testedSha,
        currentMainSha: git(root, ["rev-parse", "main"]),
        config: config(root, "full"),
      });
      expect(plan.mode).toBe("full");
    } finally {
      clean();
    }
  });
});
