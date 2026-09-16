/**
 * Input numbering (#0376): every input carries a stable, zero-padded 4-digit
 * `number` — its counterpart to a task's `id`. New inputs get the next number
 * at creation; existing inputs are backfilled in place by
 * `ensureInputNumbers`, which is idempotent and never renumbers or reuses a
 * retired number.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInput, ensureInputNumbers, listInputs } from "../../core/input";
import { createRepoOS } from "../../core/repoos";

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "repoos-input-number-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

/** Write an input file by hand to simulate one captured before numbering existed. */
function rawInput(id: string, createdAt: string, extra = ""): string {
  const dir = join(root, "inputs");
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `${id}.md`);
  writeFileSync(
    path,
    [
      "---",
      `id: "${id}"`,
      `title: "Input ${id}"`,
      'status: "new"',
      'type: "idea"',
      'created_by: "human"',
      `created_at: "${createdAt}"`,
      `updated_at: "${createdAt}"`,
      ...(extra ? [extra] : []),
      "---",
      "",
      "A captured thought.",
      "",
    ].join("\n"),
  );
  return path;
}

describe("input numbering (#0376)", () => {
  it("assigns 0001 to the first input and persists the number in frontmatter", () => {
    const config = createRepoOS(root).config;
    const input = createInput(config, "First idea", "idea", "human");

    expect(input.number).toBe("0001");
    expect(input.path).toBeTruthy();

    const raw = readFileSync(join(root, input.path), "utf8");
    expect(raw).toMatch(/^number: "0001"$/m);
    expect(listInputs(config)[0].number).toBe("0001");
  });

  it("assigns the next number to each new input", () => {
    const config = createRepoOS(root).config;
    createInput(config, "First idea");
    createInput(config, "Second idea");

    const numbers = listInputs(config)
      .map((i) => i.number)
      .sort();
    expect(numbers).toEqual(["0001", "0002"]);
  });

  it("backfills existing inputs in place, oldest first, and is idempotent", () => {
    const config = createRepoOS(root).config;
    rawInput("newer", "2026-01-02T00:00:00Z");
    rawInput("older", "2026-01-01T00:00:00Z");

    const changed = ensureInputNumbers(config);
    expect(changed).toHaveLength(2);

    const byId = new Map(listInputs(config).map((i) => [i.id, i.number]));
    expect(byId.get("older")).toBe("0001");
    expect(byId.get("newer")).toBe("0002");

    // Second run touches nothing.
    expect(ensureInputNumbers(config)).toEqual([]);
    const after = new Map(listInputs(config).map((i) => [i.id, i.number]));
    expect(after.get("older")).toBe("0001");
    expect(after.get("newer")).toBe("0002");
  });

  it("does not renumber inputs that already have a number", () => {
    const config = createRepoOS(root).config;
    rawInput("numbered", "2026-01-01T00:00:00Z", 'number: "0042"');
    rawInput("unnumbered", "2026-01-02T00:00:00Z");

    ensureInputNumbers(config);

    const byId = new Map(listInputs(config).map((i) => [i.id, i.number]));
    expect(byId.get("numbered")).toBe("0042");
    expect(byId.get("unnumbered")).toBe("0043");
  });

  it("does not reuse a retired number after an input is deleted", () => {
    const config = createRepoOS(root).config;
    const first = createInput(config, "First idea");
    createInput(config, "Second idea");
    rmSync(join(root, first.path));

    const next = createInput(config, "Third idea");
    expect(next.number).toBe("0003");
  });
});
