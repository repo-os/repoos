import { describe, expect, it, vi } from "vitest";
import { runSendBackSequence } from "../../server/send-back-sequence.js";

describe("send-back sequence", () => {
  it("moves, starts, and queues the trimmed message in order", async () => {
    const order: string[] = [];
    const result = await runSendBackSequence("  fix the failing check  ", {
      move: async () => {
        order.push("move");
        return { ok: true };
      },
      start: async () => {
        order.push("start");
        return { ok: true };
      },
      queue: async (message) => {
        order.push(`message:${message}`);
        return { ok: true, value: { queued: true } };
      },
    });

    expect(order).toEqual(["move", "start", "message:fix the failing check"]);
    expect(result).toMatchObject({ ok: true, moved: true, started: true, messageQueued: true });
  });

  it.each([
    ["move", false, false, false],
    ["start", true, false, false],
    ["message", true, true, false],
  ] as const)("stops after a failed %s step", async (failedStep, moved, started, messageQueued) => {
    const calls: string[] = [];
    const failing = async (name: string) => {
      calls.push(name);
      return name === failedStep
        ? { ok: false, status: 409, error: `${name} refused` }
        : { ok: true };
    };
    const result = await runSendBackSequence("feedback", {
      move: () => failing("move"),
      start: () => failing("start"),
      queue: () => failing("message"),
    });

    expect(result).toMatchObject({ ok: false, step: failedStep, moved, started, messageQueued });
    expect(calls).toEqual(
      failedStep === "move"
        ? ["move"]
        : failedStep === "start"
          ? ["move", "start"]
          : ["move", "start", "message"],
    );
  });

  it("rejects a missing message before invoking any step", async () => {
    const step = vi.fn(async () => ({ ok: true }));
    const result = await runSendBackSequence("  \n ", { move: step, start: step, queue: step });

    expect(result).toMatchObject({
      ok: false,
      status: 400,
      moved: false,
      started: false,
      messageQueued: false,
    });
    expect(step).not.toHaveBeenCalled();
  });
});
