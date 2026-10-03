/**
 * `previewCapacityHolder` (#0627 review round 2): the no-evict capacity
 * decision for the manual single-entry shot capture. In-flight starts hold
 * the slot just like registered previews — a preview is only registered after
 * port reservation, spawn and readiness, so counting the registry alone would
 * let concurrent starts for different tasks both pass and exceed the
 * one-preview cap. Pure function, so the concurrency contract is pinned
 * without spawning processes.
 */
import { describe, expect, it } from "vitest";
import { PreviewManager, previewCapacityHolder } from "../../server/preview.js";

describe("previewCapacityHolder (#0627 review round 2)", () => {
  it("allows a start when the slot is completely free", () => {
    expect(previewCapacityHolder([], [], "0627", 1)).toBeNull();
  });

  it("allows a start when the task already holds the slot (idempotent)", () => {
    expect(previewCapacityHolder(["0627"], [], "0627", 1)).toBeNull();
  });

  it("is busy against a registered preview, naming it", () => {
    expect(previewCapacityHolder(["0999"], [], "0627", 1)).toBe("0999");
  });

  it("is busy against a start still IN FLIGHT — the registry alone would miss it", () => {
    // Task 0999 reserved its port and is spawning: registered nowhere yet.
    expect(previewCapacityHolder([], ["0999"], "0627", 1)).toBe("0999");
  });

  it("is busy when a registered preview AND an in-flight start both hold slots", () => {
    expect(previewCapacityHolder(["0999"], ["0998"], "0627", 1)).toBe("0999");
  });

  it("never counts the starting task's own (defensive) inflight entry", () => {
    expect(previewCapacityHolder([], ["0627"], "0627", 1)).toBeNull();
  });

  it("respects a larger max for future cap changes", () => {
    expect(previewCapacityHolder(["0999"], [], "0627", 2)).toBeNull();
    expect(previewCapacityHolder(["0999", "0998"], [], "0627", 2)).toBe("0999");
    expect(previewCapacityHolder(["0999"], ["0998"], "0627", 2)).toBe("0999");
  });
});

describe("PreviewManager.start with a start already in flight (#0627 review round 4)", () => {
  // start() reaches the in-flight check before touching config, so a bare
  // manager with a pending start injected is enough to pin the contract.
  function managerWithPendingStart(target: string | undefined) {
    const manager = new PreviewManager(
      { root: "/tmp/repoos-preview-unit", cacheDir: ".repoos" } as never,
      () => {},
    );
    let resolve!: (v: unknown) => void;
    const pending = new Promise<unknown>((r) => (resolve = r));
    const internals = manager as unknown as {
      inflight: Map<string, Promise<unknown>>;
      inflightTargets: Map<string, string | undefined>;
    };
    internals.inflight.set("0627", pending);
    internals.inflightTargets.set("0627", target);
    return { manager, resolve };
  }
  const task = { id: "0627", status: "active", branch: "feat/x" } as never;

  it("refuses a noEvict start instead of adopting someone else's in-flight start", async () => {
    const { manager } = managerWithPendingStart("web");
    const result = await manager.start(task, "docs", { noEvict: true });
    expect(result).toMatchObject({ ok: false, busy: true });
    expect(result.error).toContain("already starting");
  });

  it("refuses a different explicit target rather than joining the wrong start", async () => {
    const { manager } = managerWithPendingStart("web");
    const result = await manager.start(task, "docs");
    expect(result.ok).toBe(false);
    expect(result.error).toContain('Stop it before starting "docs"');
  });

  it("still lets an identical request join the in-flight start", async () => {
    const { manager, resolve } = managerWithPendingStart("web");
    const joined = manager.start(task, "web");
    resolve({ ok: true, url: "http://127.0.0.1:1" });
    expect(await joined).toMatchObject({ ok: true, url: "http://127.0.0.1:1" });
  });
});
