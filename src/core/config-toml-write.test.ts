import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { parseFlatToml, patchTomlConfig } from "./config.js";
import { validateToml } from "./toml-validate.js";

const dirs: string[] = [];
function fixture(text: string): string {
  const dir = mkdtempSync(join(tmpdir(), "repoos-toml-write-"));
  dirs.push(dir);
  const path = join(dir, "repoos.toml");
  writeFileSync(path, text);
  return path;
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("patchTomlConfig TOML safety", () => {
  it.each([
    [
      "model pause with reason and until",
      [
        {
          cli: "opencode",
          models: ["m"],
          pausedModels: [{ model: "m", pausedReason: "rate limited", pausedUntil: "2026-10-23" }],
        },
      ],
    ],
    [
      "agent pause with reason and until",
      [
        {
          cli: "opencode",
          models: ["m"],
          paused: true,
          pausedReason: "maintenance",
          pausedUntil: "2026-10-23",
        },
      ],
    ],
    ["budget allowlist edit", [{ cli: "opencode", models: ["m", "n"] }]],
  ])("writes parseable %s", (_name, rows) => {
    const path = fixture("[budget]\nenabled = true\n");
    patchTomlConfig(path, { "budget.allowlist": rows });
    const output = readFileSync(path, "utf8");
    expect(validateToml(output)).toEqual({ ok: true });
    expect(parseFlatToml(output)["budget.allowlist"]).toEqual(rows);
  });

  it("reads legacy per-model inline pause entries", () => {
    const parsed = parseFlatToml(
      '[[budget.allowlist]]\ncli = "opencode"\nmodels = ["m"]\npausedModels = [{ model = "m", pausedReason = "legacy", pausedUntil = "2026-10-23" }]\n',
    );
    expect(parsed["budget.allowlist"]).toEqual([
      {
        cli: "opencode",
        models: ["m"],
        pausedModels: [{ model: "m", pausedReason: "legacy", pausedUntil: "2026-10-23" }],
      },
    ]);
  });

  it("refuses an invalid resulting document without changing the file", () => {
    const path = fixture('broken = "unterminated\n');
    const before = readFileSync(path, "utf8");
    expect(() =>
      patchTomlConfig(path, { "budget.allowlist": [{ cli: "opencode", models: ["m"] }] }),
    ).toThrow(/Refusing to write invalid repoos.toml: Invalid TOML on line 1 \(key broken\)/);
    expect(readFileSync(path, "utf8")).toBe(before);
  });
});
