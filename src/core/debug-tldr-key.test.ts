import { describe, expect, it } from "vitest";
import { execSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseTask, serializeTask } from "./task.js";
import {
  debugTldrKeysEqual,
  doneErrorTldrFingerprint,
  isTextSafeFrontmatterValue,
  normalizeDebugTldrKey,
  tldrFingerprint,
} from "./debug-tldr-key.js";
import { patchTaskFile } from "../server/write.js";
import type { RepoOSConfig } from "./types.js";

describe("debug_tldr_key fingerprints (#0835)", () => {
  it("never emits control characters when building fingerprints", () => {
    const fp = tldrFingerprint("dev-error", "RetriableError: handoff timed out");
    expect(fp).toBe("dev-error|RetriableError: handoff timed out");
    expect(isTextSafeFrontmatterValue(fp)).toBe(true);
    expect(fp.includes("\0")).toBe(false);

    const doneFp = doneErrorTldrFingerprint("check", "The validation check failed.", "assertion");
    expect(doneFp).toBe("done-error|check|The validation check failed.|assertion");
    expect(isTextSafeFrontmatterValue(doneFp)).toBe(true);
  });

  it("treats legacy NUL-separated keys as equal to pipe-separated fingerprints", () => {
    const legacy = `dev-error\u0000RetriableError: boom`;
    const modern = tldrFingerprint("dev-error", "RetriableError: boom");
    expect(debugTldrKeysEqual(legacy, modern)).toBe(true);
    expect(normalizeDebugTldrKey(legacy)).toBe(modern);
  });

  it("rewrites a NUL key on patch without changing semantic dedupe", () => {
    const roots: string[] = [];
    const root = mkdtempSync(join(tmpdir(), "repoos-tldr-key-"));
    roots.push(root);
    mkdirSync(join(root, "work"), { recursive: true });
    const absPath = join(root, "work", "0835-sample.md");
    const legacyKey = `dev-error\u0000RetriableError: stale`;
    const content = `---
id: "0835"
title: Sample
type: bug
status: active
needs_input: true
needs_input_reason: dev-error
needs_input_detail: "RetriableError: stale"
debug_tldr: "Engineer handoff failed — retry."
debug_tldr_at: "2026-10-18T12:00:00Z"
debug_tldr_key: "${legacyKey.replace(/"/g, '\\"')}"
---
## Problem

Body.
`;
    writeFileSync(absPath, content, "utf8");
    expect(readFileSync(absPath, "utf8").includes("\0")).toBe(true);

    const cfg: RepoOSConfig = {
      root,
      workDir: "work",
      docsDir: "docs",
      skillsDir: "skills",
      taskExtensions: [".md"],
      defaultStatus: "inbox",
      defaultAssignee: "unassigned",
      cacheDir: ".repoos",
    };
    const parsed = parseTask({
      content: readFileSync(absPath, "utf8"),
      absPath,
      root,
      defaultStatus: "inbox",
      defaultAssignee: "unassigned",
    });
    expect(parsed.debugTldrKey).toBe(tldrFingerprint("dev-error", "RetriableError: stale"));

    patchTaskFile(cfg, absPath, { updated_at: "2026-10-18T12:01:00Z" });
    const onDisk = readFileSync(absPath, "utf8");
    expect(onDisk.includes("\0")).toBe(false);
    expect(onDisk).toContain(
      `debug_tldr_key: "${tldrFingerprint("dev-error", "RetriableError: stale")}"`,
    );
    try {
      rmSync(root, { recursive: true, force: true });
    } catch {}
  });

  it("serializeTask output is text-safe and git diff does not treat the file as binary", () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-tldr-git-"));
    mkdirSync(join(root, "work"), { recursive: true });
    const absPath = join(root, "work", "0835-git.md");
    const task = parseTask({
      content: `---
id: "0835"
title: Git sample
type: bug
status: active
needs_input: true
needs_input_reason: dev-error
needs_input_detail: "detail"
---
## Problem

x
`,
      absPath,
      root,
      defaultStatus: "inbox",
      defaultAssignee: "unassigned",
    });
    task.debugTldr = "Handoff failed — retry.";
    task.debugTldrAt = "2026-10-18T12:00:00Z";
    task.debugTldrKey = tldrFingerprint("dev-error", task.needsInputDetail);
    writeFileSync(absPath, serializeTask(task), "utf8");

    execSync("git init", { cwd: root, stdio: "pipe" });
    execSync("git add work/0835-git.md", { cwd: root, stdio: "pipe" });
    execSync('git -c user.email=t@test -c user.name=t commit -m "add task"', {
      cwd: root,
      stdio: "pipe",
    });

    task.debugTldr = "Handoff failed — retry again.";
    writeFileSync(absPath, serializeTask(task), "utf8");
    const diff = execSync("git diff work/0835-git.md", { cwd: root, encoding: "utf8" });
    expect(diff).not.toMatch(/Binary files/);
    expect(diff).toContain("debug_tldr");

    try {
      rmSync(root, { recursive: true, force: true });
    } catch {}
  });
});
