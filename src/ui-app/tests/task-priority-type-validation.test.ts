/**
 * Priority and type validation on task create/update (#0656).
 *
 * The valid sets are PRIORITIES / TASK_TYPES. A write with an out-of-set value
 * must fail with a one-line message naming the field, the bad value and the
 * full list — never a silent default — on both the CLI/core path and the HTTP
 * API, and the file must be left untouched. Reads stay permissive: existing
 * files with legacy values (priority: high, type: ux, …) keep parsing as-is.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { startServer, type ServerHandle } from "../../server/server";
import { patchTaskFile } from "../../server/write";
import { createRepoOS } from "../../core/repoos";
import { parseTask } from "../../core/task";
import { PRIORITIES, TASK_TYPES, type RepoOSConfig } from "../../core/types";
import { taskPriorityError, taskTypeError } from "../../core/task-fields";
import {
  NEW_USAGE,
  UPDATE_USAGE,
  PRIORITY_USAGE,
  TYPE_USAGE,
  cmdNew,
  cmdUpdate,
} from "../../commands/tasks";
import { renderHelp } from "../../cli/help";
import { rmFixture } from "./helpers";

function config(root: string): RepoOSConfig {
  return {
    root,
    workDir: "work",
    docsDir: "docs",
    skillsDir: "skills",
    taskExtensions: [".md"],
    defaultStatus: "inbox",
    defaultAssignee: "unassigned",
    cacheDir: ".repoos",
  } as RepoOSConfig;
}

const TASK = `---
id: "0656"
title: Priority and type
type: feature
status: inbox
priority: p2
---
## Problem

Body.
`;

function setupFile(content: string): { root: string; absPath: string; clean: () => void } {
  const root = mkdtempSync(join(tmpdir(), "repoos-fields-"));
  const work = join(root, "work");
  mkdirSync(work, { recursive: true });
  const absPath = join(work, "0656-priority-and-type.md");
  writeFileSync(absPath, content);
  return { root, absPath, clean: () => rmSync(root, { recursive: true, force: true }) };
}

const tmpRoots: string[] = [];
function tmpDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "repoos-fields-"));
  tmpRoots.push(dir);
  return dir;
}

async function withServer(root: string, fn: (s: ServerHandle) => Promise<void>): Promise<void> {
  const server = await startServer({ root, host: "127.0.0.1", port: 0 });
  try {
    await fn(server);
  } finally {
    await server.close();
  }
}

afterEach(() => {
  for (const r of tmpRoots) rmSync(r, { recursive: true, force: true });
  tmpRoots.length = 0;
});

describe("priority/type error messages", () => {
  it("names the field, the bad value and the full valid list", () => {
    expect(taskPriorityError("medium")).toBe(
      "priority 'medium' is not valid; use one of p0, p1, p2, p3",
    );
    expect(taskTypeError("improvement")).toBe(
      "type 'improvement' is not valid; use one of feature, bug, chore, spec, refactor",
    );
  });

  it("accepts every valid value and treats unset as a no-op", () => {
    for (const p of PRIORITIES) expect(taskPriorityError(p)).toBeNull();
    for (const t of TASK_TYPES) expect(taskTypeError(t)).toBeNull();
    expect(taskPriorityError(undefined)).toBeNull();
    expect(taskTypeError(undefined)).toBeNull();
    expect(taskPriorityError(null)).toBeNull();
    expect(taskTypeError(null)).toBeNull();
  });
});

describe("patchTaskFile rejects invalid priority/type before writing", () => {
  it("rejects an invalid priority and leaves the file byte-identical", () => {
    const { root, absPath, clean } = setupFile(TASK);
    try {
      expect(() => patchTaskFile(config(root), absPath, { priority: "medium" })).toThrow(
        "priority 'medium' is not valid; use one of p0, p1, p2, p3",
      );
      expect(readFileSync(absPath, "utf8")).toBe(TASK);
    } finally {
      clean();
    }
  });

  it("rejects an invalid type and leaves the file byte-identical", () => {
    const { root, absPath, clean } = setupFile(TASK);
    try {
      expect(() => patchTaskFile(config(root), absPath, { type: "improvement" })).toThrow(
        "type 'improvement' is not valid; use one of feature, bug, chore, spec, refactor",
      );
      expect(readFileSync(absPath, "utf8")).toBe(TASK);
    } finally {
      clean();
    }
  });

  it("accepts each valid priority and type", () => {
    const { root, absPath, clean } = setupFile(TASK);
    try {
      for (const p of PRIORITIES) {
        expect(patchTaskFile(config(root), absPath, { priority: p }).priority).toBe(p);
      }
      for (const t of TASK_TYPES) {
        expect(patchTaskFile(config(root), absPath, { type: t }).type).toBe(t);
      }
    } finally {
      clean();
    }
  });

  it("still lets an unrelated field change on a legacy invalid-value task", () => {
    const legacy = TASK.replace("priority: p2", "priority: high").replace(
      "type: feature",
      "type: ux",
    );
    const { root, absPath, clean } = setupFile(legacy);
    try {
      const updated = patchTaskFile(config(root), absPath, { title: "Retitled" });
      expect(updated.title).toBe("Retitled");
      expect(updated.priority).toBe("high");
      expect(updated.type).toBe("ux");
    } finally {
      clean();
    }
  });
});

describe("createTask rejects invalid priority/type before writing", () => {
  it("rejects invalid values and writes nothing", () => {
    const root = tmpDir();
    const repoos = createRepoOS(root);
    expect(() => repoos.createTask({ title: "Bad priority", priority: "medium" })).toThrow(
      "priority 'medium' is not valid; use one of p0, p1, p2, p3",
    );
    expect(() => repoos.createTask({ title: "Bad type", type: "improvement" })).toThrow(
      "type 'improvement' is not valid; use one of feature, bug, chore, spec, refactor",
    );
    const work = join(root, "work");
    expect(existsSync(work)).toBe(false);
  });

  it("accepts valid values", () => {
    const root = tmpDir();
    const repoos = createRepoOS(root);
    const task = repoos.createTask({ title: "Good", type: "chore", priority: "p3" });
    expect(task.type).toBe("chore");
    expect(task.priority).toBe("p3");
  });
});

describe("the parser keeps reading legacy values", () => {
  it("preserves an invalid priority/type as-is instead of crashing", () => {
    const legacy = TASK.replace("priority: p2", "priority: high").replace(
      "type: feature",
      "type: ux",
    );
    const task = parseTask({
      content: legacy,
      absPath: "/tmp/0656.md",
      root: "/tmp",
      defaultStatus: "inbox",
      defaultAssignee: "unassigned",
    });
    expect(task.priority).toBe("high");
    expect(task.type).toBe("ux");
  });

  it("reads every file in the real work/ directory", () => {
    const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
    const work = join(repoRoot, "work");
    const files = readdirSync(work).filter((f) => f.endsWith(".md"));
    expect(files.length).toBeGreaterThan(0);
    for (const name of files) {
      expect(() =>
        parseTask({
          content: readFileSync(join(work, name), "utf8"),
          absPath: join(work, name),
          root: repoRoot,
          defaultStatus: "inbox",
          defaultAssignee: "unassigned",
        }),
      ).not.toThrow();
    }
  });
});

describe("usage text lists the valid values", () => {
  it("CLI usage strings show every valid priority and type", () => {
    expect(PRIORITY_USAGE).toBe("p0|p1|p2|p3");
    expect(TYPE_USAGE).toBe("feature|bug|chore|spec|refactor");
    for (const usage of [NEW_USAGE, UPDATE_USAGE]) {
      expect(usage).toContain(PRIORITY_USAGE);
      expect(usage).toContain(TYPE_USAGE);
    }
  });

  it("per-command help shows the valid priority and type sets", () => {
    const help = renderHelp(140);
    expect(help).toContain("p0|p1|p2|p3");
    expect(help).toContain("feature|bug|chore|spec|refactor");
  });
});

function git(root: string, args: string[]): string {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

function makeCliRepo(): { root: string; taskPath: string; clean: () => void } {
  const root = mkdtempSync(join(tmpdir(), "repoos-fields-cli-"));
  git(root, ["init", "-q"]);
  git(root, ["config", "user.email", "t@example.com"]);
  git(root, ["config", "user.name", "Test"]);
  mkdirSync(join(root, "work"), { recursive: true });
  const taskPath = join(root, "work", "0656-priority-and-type.md");
  writeFileSync(taskPath, TASK);
  writeFileSync(join(root, "repoos.toml"), "");
  git(root, ["add", "-A"]);
  git(root, ["commit", "-q", "-m", "init"]);
  return { root, taskPath, clean: () => rmFixture(root) };
}

async function withCwd<T>(dir: string, fn: () => T): Promise<T> {
  const prev = process.cwd();
  process.chdir(dir);
  try {
    return fn();
  } finally {
    process.chdir(prev);
  }
}

describe("CLI new/update reject invalid values", () => {
  it("cmdUpdate rejects an invalid priority and type without touching the file", async () => {
    const { root, taskPath, clean } = makeCliRepo();
    const prevExit = process.exitCode;
    const errors: string[] = [];
    const spy = vi
      .spyOn(console, "error")
      .mockImplementation((...a: unknown[]) => errors.push(a.map(String).join(" ")));
    try {
      const before = readFileSync(taskPath, "utf8");
      await withCwd(root, () => cmdUpdate(["0656", "--priority", "medium"]));
      expect(process.exitCode).toBe(1);
      expect(errors.join("\n")).toContain(
        "priority 'medium' is not valid; use one of p0, p1, p2, p3",
      );
      expect(readFileSync(taskPath, "utf8")).toBe(before);

      process.exitCode = prevExit;
      errors.length = 0;
      await withCwd(root, () => cmdUpdate(["0656", "--type", "improvement"]));
      expect(process.exitCode).toBe(1);
      expect(errors.join("\n")).toContain(
        "type 'improvement' is not valid; use one of feature, bug, chore, spec, refactor",
      );
      expect(readFileSync(taskPath, "utf8")).toBe(before);
    } finally {
      spy.mockRestore();
      process.exitCode = prevExit;
      clean();
    }
  });

  it("cmdNew rejects an invalid priority and type without creating a file", async () => {
    const { root, clean } = makeCliRepo();
    const prevExit = process.exitCode;
    const errors: string[] = [];
    const spy = vi
      .spyOn(console, "error")
      .mockImplementation((...a: unknown[]) => errors.push(a.map(String).join(" ")));
    try {
      const before = readdirSync(join(root, "work"));
      await withCwd(root, () => cmdNew(["Bad priority", "--priority", "medium"]));
      expect(process.exitCode).toBe(1);
      expect(errors.join("\n")).toContain("priority 'medium' is not valid");
      expect(readdirSync(join(root, "work"))).toEqual(before);

      process.exitCode = prevExit;
      errors.length = 0;
      await withCwd(root, () => cmdNew(["Bad type", "--type", "improvement"]));
      expect(process.exitCode).toBe(1);
      expect(errors.join("\n")).toContain("type 'improvement' is not valid");
      expect(readdirSync(join(root, "work"))).toEqual(before);
    } finally {
      spy.mockRestore();
      process.exitCode = prevExit;
      clean();
    }
  });
});

describe("HTTP API create/update reject invalid values", () => {
  it("rejects an invalid priority/type on POST and writes nothing", async () => {
    const root = tmpDir();
    await withServer(root, async (s) => {
      const badPriority = await fetch(`${s.url}/api/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Bad priority", priority: "medium" }),
      });
      expect(badPriority.status).toBe(400);
      expect(((await badPriority.json()) as { error: string }).error).toContain(
        "priority 'medium' is not valid; use one of p0, p1, p2, p3",
      );

      const badType = await fetch(`${s.url}/api/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Bad type", type: "improvement" }),
      });
      expect(badType.status).toBe(400);
      expect(((await badType.json()) as { error: string }).error).toContain(
        "type 'improvement' is not valid; use one of feature, bug, chore, spec, refactor",
      );

      const work = join(root, "work");
      expect(existsSync(work) ? readdirSync(work).filter((f) => f.endsWith(".md")) : []).toEqual(
        [],
      );
    });
  });

  it("rejects an invalid priority/type on PATCH and leaves the file unchanged", async () => {
    const root = tmpDir();
    const work = join(root, "work");
    mkdirSync(work, { recursive: true });
    const absPath = join(work, "0656-priority-and-type.md");
    writeFileSync(absPath, TASK);
    await withServer(root, async (s) => {
      const badPriority = await fetch(`${s.url}/api/tasks/0656`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priority: "medium" }),
      });
      expect(badPriority.status).toBe(400);
      expect(((await badPriority.json()) as { error: string }).error).toContain(
        "priority 'medium' is not valid; use one of p0, p1, p2, p3",
      );

      const badType = await fetch(`${s.url}/api/tasks/0656`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "improvement" }),
      });
      expect(badType.status).toBe(400);

      const ok = await fetch(`${s.url}/api/tasks/0656`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priority: "p0", type: "chore" }),
      });
      expect(ok.status).toBe(200);
      const task = (await ok.json()) as { priority: string; type: string };
      expect(task.priority).toBe("p0");
      expect(task.type).toBe("chore");
    });
  });
});
