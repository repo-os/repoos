import { afterEach, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cmdList } from "../../commands/tasks.js";

const roots: string[] = [];
const originalCwd = process.cwd();

afterEach(() => {
  process.chdir(originalCwd);
  for (const r of roots) rmSync(r, { recursive: true, force: true });
  roots.length = 0;
});

describe("repoos list title column (#0704)", () => {
  it("truncates long titles so the area column stays aligned", () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-list-"));
    roots.push(root);
    const work = join(root, "work");
    mkdirSync(work);
    const longTitle =
      "This is an intentionally very long task title that would run into the area column";
    writeFileSync(
      join(work, "0001-long.md"),
      `---
id: "0001"
title: ${longTitle}
type: chore
status: done
priority: p3
area: ridemobile
---
body
`,
    );
    writeFileSync(
      join(root, "repoos.toml"),
      'workDir = "work"\ndocsDir = "docs"\nskillsDir = "skills"\n',
    );
    execFileSync("git", ["init", "-q"], { cwd: root });
    execFileSync("git", ["config", "user.email", "t@example.com"], { cwd: root });
    execFileSync("git", ["config", "user.name", "Test"], { cwd: root });
    process.chdir(root);
    let out = "";
    const log = console.log;
    console.log = (line: string) => {
      out += line + "\n";
    };
    try {
      cmdList();
    } finally {
      console.log = log;
    }
    expect(out).toContain("ridemobile");
    expect(out).toMatch(/…\s+ridemobile/);
    expect(out).not.toContain(`completed ridemobile`);
  });
});
