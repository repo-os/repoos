import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { rmSync } from "node:fs";
import { pairPauseInfo } from "../../core/budget-allowlist.js";
import { loadConfig } from "../../core/config.js";
import {
  applyAutomaticPauses,
  budgetRuntimeStatePath,
  hydrateAllowlistRuntime,
  readBudgetRuntimeState,
  recordAutomaticAllowlist,
} from "../../core/budget-runtime-state.js";
import type { AgentModelAllowRow } from "../../core/types.js";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function tempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "repoos-budget-runtime-"));
  roots.push(root);
  return root;
}

const row = (extra: Partial<AgentModelAllowRow> = {}): AgentModelAllowRow => ({
  cli: "opencode",
  models: ["go"],
  ...extra,
});

describe("budget runtime pauses (#0998)", () => {
  it("keeps automatic pauses out of tracked rows and restores them on hydrate", () => {
    const root = tempRoot();
    const recorded = recordAutomaticAllowlist(root, [
      row({
        pausedModels: [
          {
            model: "go",
            pausedReason: "out of usage since 10:30",
            pausedUntil: "2026-11-02T00:00:00.000Z",
          },
        ],
      }),
    ]);
    expect(recorded[0]?.pausedModels).toHaveLength(1);
    const stored = readBudgetRuntimeState(root);
    expect(stored).not.toBe("invalid");
    if (stored === "invalid") return;
    expect(stored.pauses).toEqual([
      {
        cli: "opencode",
        model: "go",
        pausedReason: "out of usage since 10:30",
        pausedUntil: "2026-11-02T00:00:00.000Z",
      },
    ]);

    const again = hydrateAllowlistRuntime(root, [row()]);
    expect(again[0]?.pausedModels?.[0]?.pausedReason).toBe("out of usage since 10:30");
  });

  it("lets a human pause win and migrates automatic fields out of toml-shaped rows", () => {
    const root = tempRoot();
    const rows = [
      row({
        paused: true,
        pausedReason: "shipping",
        pausedModels: [{ model: "go", pausedReason: "out of usage since 10:30" }],
      }),
    ];
    const hydrated = hydrateAllowlistRuntime(root, rows);
    expect(hydrated[0]?.pausedReason).toBe("shipping");
    expect(hydrated[0]?.pausedModels).toBeUndefined();
    const stored = readBudgetRuntimeState(root);
    expect(stored).not.toBe("invalid");
  });

  it("does not drop toml pauses when the runtime file is invalid", () => {
    const root = tempRoot();
    mkdirSync(join(root, ".repoos"), { recursive: true });
    writeFileSync(budgetRuntimeStatePath(root), "{", "utf8");
    const rows = [row({ paused: true, pausedReason: "out of usage since 10:30" })];
    expect(hydrateAllowlistRuntime(root, rows)).toEqual(rows);
    expect(readFileSync(budgetRuntimeStatePath(root), "utf8")).toBe("{");
  });

  it("resume clears a pair from the runtime file", () => {
    const root = tempRoot();
    recordAutomaticAllowlist(root, [
      row({ pausedModels: [{ model: "go", pausedReason: "out of usage since 10:30" }] }),
    ]);
    recordAutomaticAllowlist(root, [row()]);
    const stored = readBudgetRuntimeState(root);
    expect(stored).toEqual({ version: 1, pauses: [] });
    expect(applyAutomaticPauses([row()], [])[0]?.pausedModels).toBeUndefined();
  });

  it("loadConfig overlays the runtime file without rewriting repoos.toml", () => {
    const root = tempRoot();
    const toml = `[[budget.allowlist]]\ncli = "opencode"\nmodels = ["go"]\n`;
    writeFileSync(join(root, "repoos.toml"), toml);
    mkdirSync(join(root, ".repoos"), { recursive: true });
    writeFileSync(
      budgetRuntimeStatePath(root),
      `${JSON.stringify({
        version: 1,
        pauses: [{ cli: "opencode", model: "go", pausedReason: "out of usage since 10:30" }],
      })}\n`,
    );
    const config = loadConfig(root);
    expect(config.budget?.allowlist?.[0]?.pausedModels?.[0]?.model).toBe("go");
    expect(readFileSync(join(root, "repoos.toml"), "utf8")).toBe(toml);
  });

  it("treats an expired runtime pause as resumed without rewriting the file", () => {
    const root = tempRoot();
    const until = "2020-01-01T00:00:00.000Z";
    recordAutomaticAllowlist(root, [
      row({
        pausedModels: [
          { model: "go", pausedReason: "out of usage since 10:30", pausedUntil: until },
        ],
      }),
    ]);
    const before = readFileSync(budgetRuntimeStatePath(root), "utf8");
    const rows = hydrateAllowlistRuntime(root, [row()]);
    const now = Date.parse("2026-11-01T00:00:00.000Z");
    expect(pairPauseInfo(rows, "opencode", "go", now).paused).toBe(false);
    expect(readFileSync(budgetRuntimeStatePath(root), "utf8")).toBe(before);
  });
});
