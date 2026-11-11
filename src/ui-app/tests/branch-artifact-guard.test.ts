import { describe, expect, it, afterEach } from "vitest";
import { gzipSync } from "node:zlib";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  evaluateAddedPaths,
  isBuildOutputPath,
  planCheckpointStaging,
  scanBuffersForSecrets,
  scanTextForSecrets,
} from "../../core/branch-artifact-guard.js";
import { commitWipCheckpointForRemoteGate } from "../../server/engineer-remote-self-check.js";
import { loadConfig } from "../../core/config.js";

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function git(root: string, ...args: string[]) {
  execFileSync("git", args, { cwd: root, stdio: "ignore" });
}

/** Fake Stripe test key — base64 in source so guards do not flag the test file (#1096). */
function fakeStripeTestSecret(): string {
  return Buffer.from("c2tfdGVzdF8wMTIzNDU2Nzg5MDEyMzQ1Njc4OTAxMjM0NTY3ODkw", "base64").toString(
    "utf8",
  );
}

function initRepo(root: string) {
  git(root, "init", "-q", "-b", "main");
  execFileSync("git", ["config", "user.email", "t@t"], { cwd: root, stdio: "ignore" });
  execFileSync("git", ["config", "user.name", "t"], { cwd: root, stdio: "ignore" });
  writeFileSync(join(root, "README.md"), "seed\n");
  git(root, "add", "README.md");
  git(root, "commit", "-qm", "seed");
  git(root, "checkout", "-q", "-b", "feat/x");
}

describe("isBuildOutputPath", () => {
  it("flags derived data and xcresult trees", () => {
    expect(isBuildOutputPath("macos/.derived-data-verify/foo", [])).toBe(true);
    expect(isBuildOutputPath("out/Test.xcresult/Data", [])).toBe(true);
    expect(isBuildOutputPath("src/index.ts", [])).toBe(false);
  });
});

describe("secret scan", () => {
  it("finds a fake Stripe key inside gzip", () => {
    const secret = fakeStripeTestSecret();
    const z = gzipSync(Buffer.from(secret, "utf8"));
    const hits = scanBuffersForSecrets(z, "blob.bin", 1_000_000);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]!.suffix).toHaveLength(4);
    expect(hits[0]!.type).toBe("stripe_secret");
    expect(JSON.stringify(hits)).not.toContain(secret);
  });

  const bun = (globalThis as unknown as { Bun?: { zstdCompressSync?: (b: Buffer) => Buffer } }).Bun;
  it.skipIf(!bun?.zstdCompressSync)("finds a fake Stripe key inside zstd", () => {
    const secret = fakeStripeTestSecret();
    const z = bun!.zstdCompressSync!(Buffer.from(secret, "utf8"));
    const hits = scanBuffersForSecrets(z, "blob.bin", 1_000_000);
    expect(hits.length).toBeGreaterThan(0);
  });

  it("does not false-positive on random base64 noise", () => {
    const noise = "YWJjZGVmZ2hpamtsbW5vcHFyc3R1dnd4eXoxMjM0NTY3ODkw";
    expect(scanTextForSecrets(noise, "noise.txt")).toEqual([]);
  });
});

describe("branch diff guard", () => {
  it("fails on a synthetic 2 MiB added file", () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-branch-guard-"));
    dirs.push(root);
    initRepo(root);
    writeFileSync(join(root, "big.bin"), Buffer.alloc(2 * 1024 * 1024, 1));
    git(root, "add", "big.bin");
    git(root, "commit", "-qm", "big");
    const added = execFileSync("git", ["diff", "--diff-filter=A", "--name-only", "main...HEAD"], {
      cwd: root,
      encoding: "utf8",
    })
      .trim()
      .split("\n")
      .filter(Boolean);
    const { violations } = evaluateAddedPaths(root, added, {
      maxAddedFileBytes: 1_048_576,
    });
    expect(violations.some((v) => v.kind === "oversize" && v.path === "big.bin")).toBe(true);
  });

  it("fails on an added xcresult path", () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-xcresult-"));
    dirs.push(root);
    initRepo(root);
    mkdirSync(join(root, "run/Test.xcresult", "Data"), { recursive: true });
    writeFileSync(join(root, "run/Test.xcresult", "Data", "ref"), "x");
    git(root, "add", "run");
    git(root, "commit", "-qm", "xc");
    const { violations } = evaluateAddedPaths(root, ["run/Test.xcresult/Data/ref"], {});
    expect(violations.some((v) => v.kind === "build-output")).toBe(true);
  });
});

describe("commitWipCheckpointForRemoteGate build-output guard (#1096)", () => {
  it("does not commit derived-data paths", async () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-wip-build-out-"));
    dirs.push(root);
    initRepo(root);
    mkdirSync(join(root, "work"), { recursive: true });
    writeFileSync(join(root, "work", "1096-task.md"), '---\nid: "1096"\n---\n');
    writeFileSync(join(root, "src.txt"), "ok\n");
    mkdirSync(join(root, "macos/.derived-data-verify/nested"), { recursive: true });
    writeFileSync(join(root, "macos/.derived-data-verify/nested/obj"), "x");
    git(root, "add", "--", "src.txt", "work/1096-task.md");
    git(root, "add", "-f", "--", "macos/.derived-data-verify/nested/obj");
    const cfg = loadConfig(root);
    const err = await commitWipCheckpointForRemoteGate(root, { ...cfg, root }, "1096");
    expect(err).toBeNull();
    const committed = execFileSync("git", ["show", "--name-only", "--format=", "HEAD"], {
      cwd: root,
      encoding: "utf8",
    });
    expect(committed).toContain("src.txt");
    expect(committed).not.toContain("macos/.derived-data-verify/nested/obj");
    expect(
      planCheckpointStaging(root, ["macos/.derived-data-verify/nested/obj"], {})
        .unstagedBuildOutput,
    ).toContain("macos/.derived-data-verify/nested/obj");
  });
});
