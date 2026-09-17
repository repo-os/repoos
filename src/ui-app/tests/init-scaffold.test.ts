import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { scaffoldInto } from "../../commands/init";
import { parseTask } from "../../core/task";
import { rmFixture } from "./helpers";

const roots: string[] = [];

function scratch(): string {
  const root = mkdtempSync(join(tmpdir(), "repoos-init-"));
  roots.push(root);
  return root;
}

function readTask(root: string, rel: string) {
  const absPath = join(root, rel);
  return parseTask({
    content: readFileSync(absPath, "utf8"),
    absPath,
    root,
    defaultStatus: "inbox",
    defaultAssignee: "unassigned",
  });
}

afterEach(() => {
  for (const root of roots.splice(0)) rmFixture(root);
});

describe("scaffoldInto starter tasks", () => {
  it("leaves a ready new-project starter after the done 0001", () => {
    const root = scratch();
    const { created } = scaffoldInto(root, "Squishy: a tiny social app", "root", "new");

    expect(existsSync(join(root, "work/0001-set-up-repoos.md"))).toBe(true);
    expect(created).toContain("work/0002-flesh-out-the-vision.md");

    expect(readTask(root, "work/0001-set-up-repoos.md").status).toBe("done");

    const starter = readTask(root, "work/0002-flesh-out-the-vision.md");
    expect(starter.id).toBe("0002");
    expect(starter.status).toBe("ready");
    expect(starter.body).toContain("Squishy: a tiny social app");
    expect(starter.body).toContain("repoos new");
  });

  it("notes when no description was given rather than faking one", () => {
    const root = scratch();
    scaffoldInto(root, "", "root", "new");
    const starter = readTask(root, "work/0002-flesh-out-the-vision.md");
    expect(starter.status).toBe("ready");
    expect(starter.body).toMatch(/no description was given/i);
  });

  it("seeds a different ready starter for an existing repo", () => {
    const root = scratch();
    scaffoldInto(root, "", "root", "existing");
    const starter = readTask(root, "work/0002-read-the-codebase.md");
    expect(starter.status).toBe("ready");
    expect(starter.title).toMatch(/this codebase/i);
    expect(starter.body).toContain("repoos new");
  });

  it("numbers the starter after tasks already on the board", () => {
    const root = scratch();
    mkdirSync(join(root, "work"), { recursive: true });
    writeFileSync(join(root, "work/0001-existing.md"), "---\nid: '0001'\n---\n");
    writeFileSync(join(root, "work/0002-existing.md"), "---\nid: '0002'\n---\n");

    const { created } = scaffoldInto(root, "", "root", "existing");
    expect(created).toContain("work/0003-read-the-codebase.md");
  });

  it("respects the repoos/ namespace layout", () => {
    const root = scratch();
    scaffoldInto(root, "desc", "repoos", "new");
    expect(existsSync(join(root, "repoos/work/0002-flesh-out-the-vision.md"))).toBe(true);
  });

  it("is idempotent — a re-run creates nothing", () => {
    const root = scratch();
    scaffoldInto(root, "desc", "root", "new");
    const { created } = scaffoldInto(root, "desc", "root", "new");
    expect(created).toEqual([]);
  });
});
