import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createRepoOS } from "../../core/repoos.js";
import { parseDocument } from "../../core/frontmatter.js";
import { createLogger } from "../../core/logger.js";
import type { RepoEvent } from "../../server/live-index.js";
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

function makeCtx(root: string, events: RepoEvent[] = []) {
  return {
    config: createRepoOS(root).config,
    repoos: createRepoOS(root),
    logger: createLogger(root),
    emitEvent: (e: RepoEvent) => events.push(e),
    index: { refreshAll: () => {}, applyFileChange: () => {} },
  } as never as Parameters<typeof postSchedule>[0];
}

function makeRes() {
  const capture = { status: 0, body: undefined as unknown };
  return {
    capture,
    res: {
      writeHead: (status: number) => {
        capture.status = status;
      },
      end: (chunk?: string) => {
        capture.body = JSON.parse(chunk ?? "null");
      },
    } as never as Parameters<typeof postSchedule>[2],
  };
}

function jsonReq(body: unknown) {
  return {
    async *[Symbol.asyncIterator]() {
      yield Buffer.from(JSON.stringify(body));
    },
  } as never;
}

describe("schedules API", () => {
  let root = "";
  afterEach(() => {
    if (root) rmSync(root, { recursive: true, force: true });
    root = "";
    resetScheduleTickStateForTests();
  });

  it("creates a schedule and previews next run", async () => {
    root = mkdtempSync(join(tmpdir(), "repoos-schedules-"));
    const ctx = makeCtx(root);
    const created = makeRes();
    await postSchedule(
      ctx,
      jsonReq({
        title: "Doc audit",
        cadence: "weekly",
        timezone: "UTC",
        timeOfDay: "09:00",
        dayOfWeek: 1,
        taskTitle: "Audit docs",
        body: "## Problem\nDrift\n",
      }),
      created.res,
      {} as never,
    );
    expect(created.capture.status).toBe(201);

    const list = makeRes();
    getSchedules(ctx, {} as never, list.res, {} as never);
    expect((list.capture.body as unknown[]).length).toBe(1);

    const preview = makeRes();
    await postSchedulePreview(
      ctx,
      jsonReq({
        title: "Doc audit",
        cadence: "daily",
        timezone: "UTC",
        timeOfDay: "09:00",
        taskTitle: "Audit docs",
      }),
      preview.res,
      {} as never,
    );
    expect(preview.capture.status).toBe(200);
    expect((preview.capture.body as { preview: string }).preview).toBeTruthy();
  });

  it("honours a custom schedulesDir (#0860)", async () => {
    root = mkdtempSync(join(tmpdir(), "repoos-schedules-"));
    writeFileSync(join(root, "repoos.toml"), 'schedulesDir = "repoos/schedules"\n');
    mkdirSync(join(root, "repoos", "schedules"), { recursive: true });
    const ctx = makeCtx(root);
    expect(ctx.config.schedulesDir).toBe("repoos/schedules");

    const created = makeRes();
    await postSchedule(
      ctx,
      jsonReq({
        title: "Namespaced",
        cadence: "daily",
        timezone: "UTC",
        timeOfDay: "09:00",
        taskTitle: "Namespaced task",
      }),
      created.res,
      {} as never,
    );
    expect(created.capture.status).toBe(201);
    const id = (created.capture.body as { id: string }).id;
    const scheduleFile = join(root, "repoos/schedules", `${id}-namespaced.md`);
    expect(existsSync(scheduleFile)).toBe(true);
    expect(existsSync(join(root, "schedules"))).toBe(false);

    // Running the schedule reads it from (and records the run back into) the
    // custom directory, and creates its task.
    const run = makeRes();
    await postScheduleRun(ctx, jsonReq({}), run.res, { param1: id } as never);
    expect(run.capture.status).toBe(200);
    const taskId = (run.capture.body as { taskId: string }).taskId;
    expect(taskId).toMatch(/^\d{4}$/);

    const recorded = parseDocument(readFileSync(scheduleFile, "utf8")).data;
    expect(recorded.last_result).toBe("success");
    expect(recorded.last_task_id).toBe(taskId);
    expect(recorded.last_run_at).toBeTruthy();
    expect(recorded.last_occurrence_key).toBeTruthy();
    expect(existsSync(join(root, "work", `${taskId}-namespaced-task.md`))).toBe(true);
    expect(existsSync(join(root, "schedules"))).toBe(false);
  });

  it("prevents duplicate occurrence locks", () => {
    root = mkdtempSync(join(tmpdir(), "repoos-schedules-"));
    const config = createRepoOS(root).config;
    expect(tryAcquireScheduleOccurrenceLock(config, "0001", "daily:2026-08-13")).toBe(true);
    expect(tryAcquireScheduleOccurrenceLock(config, "0001", "daily:2026-08-13")).toBe(false);
  });

  it("run now creates a work task", async () => {
    root = mkdtempSync(join(tmpdir(), "repoos-schedules-"));
    mkdirSync(join(root, "work"), { recursive: true });
    const ctx = makeCtx(root);
    const created = makeRes();
    await postSchedule(
      ctx,
      jsonReq({
        title: "Weekly chore",
        cadence: "weekly",
        timezone: "UTC",
        timeOfDay: "09:00",
        dayOfWeek: 1,
        taskTitle: "Chore task",
        body: "Do the thing",
      }),
      created.res,
      {} as never,
    );
    const id = (created.capture.body as { id: string }).id;
    const run = makeRes();
    await postScheduleRun(ctx, jsonReq({}), run.res, { param1: id } as never);
    expect(run.capture.status).toBe(200);
    expect((run.capture.body as { taskId: string }).taskId).toMatch(/^\d{4}$/);
  });
});
