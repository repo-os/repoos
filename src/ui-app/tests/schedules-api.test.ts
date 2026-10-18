import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createRepoOS } from "../../core/repoos.js";
import { loadConfig } from "../../core/config.js";
import {
  getSchedules,
  postSchedule,
  postSchedulePreview,
  postScheduleRun,
} from "../../server/routes/schedules.js";
import {
  resetScheduleTickStateForTests,
  tryAcquireScheduleOccurrenceLock,
} from "../../server/schedule-runner.js";
import type { RouteContext } from "../../server/routes/types.js";

function makeCtx(root: string): RouteContext {
  const config = loadConfig(root);
  const repoos = createRepoOS(root);
  return {
    config,
    repoos,
    index: {
      refreshAll: () => {},
      applyFileChange: () => {},
    } as RouteContext["index"],
    emitEvent: () => {},
    logger: { system: () => {}, task: () => {}, agent: () => {} } as RouteContext["logger"],
    runner: {} as RouteContext["runner"],
  } as RouteContext;
}

function jsonRes() {
  let status = 0;
  let body = "";
  const res = {
    writeHead(code: number) {
      status = code;
    },
    end(chunk: string) {
      body = chunk;
    },
  };
  return {
    res,
    status: () => status,
    json: () => JSON.parse(body || "{}"),
  };
}

describe("schedules API", () => {
  const root = join(process.cwd(), ".tmp-schedules-test");
  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
    resetScheduleTickStateForTests();
  });

  it("creates a schedule and previews next run", async () => {
    mkdirSync(root, { recursive: true });
    const ctx = makeCtx(root);
    const created = jsonRes();
    await postSchedule(
      ctx,
      {
        async *[Symbol.asyncIterator]() {
          yield Buffer.from(
            JSON.stringify({
              title: "Doc audit",
              cadence: "weekly",
              timezone: "UTC",
              timeOfDay: "09:00",
              dayOfWeek: 1,
              taskTitle: "Audit docs",
              body: "## Problem\nDrift\n",
            }),
          );
        },
      } as never,
      created.res as never,
      {},
    );
    expect(created.status()).toBe(201);
    const list = jsonRes();
    getSchedules(ctx, {} as never, list.res as never);
    expect(list.json()).toHaveLength(1);

    const preview = jsonRes();
    await postSchedulePreview(
      ctx,
      {
        async *[Symbol.asyncIterator]() {
          yield Buffer.from(
            JSON.stringify({
              title: "Doc audit",
              cadence: "daily",
              timezone: "UTC",
              timeOfDay: "09:00",
              taskTitle: "Audit docs",
            }),
          );
        },
      } as never,
      preview.res as never,
      {},
    );
    expect(preview.status()).toBe(200);
    expect(preview.json().preview).toBeTruthy();
  });

  it("prevents duplicate occurrence locks", () => {
    mkdirSync(root, { recursive: true });
    const config = loadConfig(root);
    expect(tryAcquireScheduleOccurrenceLock(config, "0001", "daily:2026-08-13")).toBe(true);
    expect(tryAcquireScheduleOccurrenceLock(config, "0001", "daily:2026-08-13")).toBe(false);
  });

  it("run now creates a work task", async () => {
    mkdirSync(join(root, "work"), { recursive: true });
    const ctx = makeCtx(root);
    const created = jsonRes();
    await postSchedule(
      ctx,
      {
        async *[Symbol.asyncIterator]() {
          yield Buffer.from(
            JSON.stringify({
              title: "Weekly chore",
              cadence: "weekly",
              timezone: "UTC",
              timeOfDay: "09:00",
              dayOfWeek: 1,
              taskTitle: "Chore task",
              body: "Do the thing",
            }),
          );
        },
      } as never,
      created.res as never,
      {},
    );
    const id = created.json().id as string;
    const run = jsonRes();
    await postScheduleRun(
      ctx,
      {
        async *[Symbol.asyncIterator]() {
          yield Buffer.from("{}");
        },
      } as never,
      run.res as never,
      { param1: id },
    );
    expect(run.status()).toBe(200);
    expect(run.json().taskId).toMatch(/^\d{4}$/);
  });
});
