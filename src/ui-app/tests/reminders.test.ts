import { mkdtempSync, rmSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { createRepoOS } from "../../core/repoos.js";
import {
  createReminder,
  listReminders,
  fireDueReminders,
  reminderDate,
} from "../../core/reminders.js";
import {
  getReminders,
  postReminder,
  patchReminder,
  postReminderDone,
  postReminderSnooze,
  removeReminder,
} from "../../server/routes/reminders.js";
import { shouldRunReminderAutomation, runReminderTick } from "../../server/reminder-tick.js";
import { useRemindersStore } from "../src/stores/reminders";
import { useNoticesStore } from "../src/stores/notices";
import { cmdReminder } from "../../commands/reminder.js";
import { RepoOsApi } from "../../cli/repoos-api.js";

let root = "";
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "reminders-"));
  setActivePinia(createPinia());
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
  vi.restoreAllMocks();
});
function req(body: unknown) {
  return {
    async *[Symbol.asyncIterator]() {
      yield Buffer.from(JSON.stringify(body));
    },
  } as never;
}
async function call(handler: typeof postReminder, body: unknown = {}, id = "") {
  const result = { status: 0, body: null as any };
  const ctx = { config: createRepoOS(root).config, emitEvent: vi.fn() } as never;
  const res = {
    writeHead: (status: number) => (result.status = status),
    end: (chunk: string) => (result.body = JSON.parse(chunk)),
  } as never;
  await handler(ctx, req(body), res, { param1: id } as never);
  return result;
}
const input = {
  text: 'Check credit: "Cursor"',
  fireAt: "2020-01-01T00:00:00Z",
  link: "agent:cursor",
};
describe("reminders persistence and API", () => {
  it("round-trips create/edit/snooze/done/delete through new server contexts", async () => {
    const added = await call(postReminder, input);
    expect(added.status).toBe(201);
    const id = added.body.id;
    expect(readFileSync(join(root, "reminders", `${id}.md`), "utf8")).toContain(input.text);
    expect((await call(getReminders)).body.reminders[0].text).toBe(input.text);
    expect((await call(patchReminder, { text: "Check provider" }, id)).body.text).toBe(
      "Check provider",
    );
    const time = new Date(Date.now() + 3_600_000).toISOString();
    expect((await call(postReminderSnooze, { fireAt: time }, id)).body.state).toBe("snoozed");
    expect((await call(getReminders)).body.reminders[0].fireAt).toBe(time);
    expect((await call(postReminderDone, {}, id)).body.state).toBe("done");
    expect((await call(removeReminder, {}, id)).status).toBe(200);
    expect((await call(getReminders)).body.reminders).toEqual([]);
    expect((await call(postReminderDone, {}, id)).status).toBe(404);
  });
  it("fires once across repeated ticks and restarts; bell derives exactly one unresolved notice", async () => {
    const added = await call(postReminder, input);
    expect(fireDueReminders(createRepoOS(root).config)).toHaveLength(1);
    expect(fireDueReminders(createRepoOS(root).config)).toEqual([]);
    const store = useRemindersStore();
    const notices = useNoticesStore();
    store.reminders = listReminders(createRepoOS(root).config);
    expect(notices.activeNotices.filter((n) => n.kind === "reminderDue")).toHaveLength(1);
    notices.dismissAll();
    notices.markAllRead();
    store.reminders = listReminders(createRepoOS(root).config);
    expect(notices.unreadNotices.filter((n) => n.kind === "reminderDue")).toHaveLength(1);
    await call(
      postReminderSnooze,
      { fireAt: new Date(Date.now() + 3_600_000).toISOString() },
      added.body.id,
    );
    store.reminders = listReminders(createRepoOS(root).config);
    expect(notices.activeNotices).toEqual([]);
    await call(removeReminder, {}, added.body.id);
    store.reminders = listReminders(createRepoOS(root).config);
    expect(store.due).toEqual([]);
  });
  it("defaults to reminders and honours a custom remindersDir (#0860)", () => {
    expect(createRepoOS(root).config.remindersDir).toBe("reminders");
    writeFileSync(join(root, "repoos.toml"), 'remindersDir = "repoos/reminders"\n');
    const config = createRepoOS(root).config;
    expect(config.remindersDir).toBe("repoos/reminders");
    const added = createReminder(config, input);
    expect(readFileSync(join(root, "repoos/reminders", `${added.id}.md`), "utf8")).toContain(
      input.text,
    );
    expect(listReminders(config)).toHaveLength(1);
    expect(() => listReminders(createRepoOS(root).config)).not.toThrow();
  });
  it("rejects invalid dates, unknown links and directory symlinks specifically", async () => {
    for (const fireAt of [
      "not-a-date",
      "2026-02-30T09:00:00Z",
      "2026-10-01T09:00:00",
      "2026-13-01T09:00:00Z",
    ]) {
      expect((await call(postReminder, { ...input, fireAt })).status).toBe(400);
      expect(() => reminderDate(fireAt)).toThrow(/date\/time/);
    }
    expect((await call(postReminder, { ...input, link: "agent:unknown" })).body.error).toContain(
      "Unknown agent",
    );
    symlinkSync(tmpdir(), join(root, "reminders"));
    expect(() => createReminder(createRepoOS(root).config, input)).toThrow("regular directory");
  });
  it("never ticks in tests, previews, overrides or ephemeral servers", () => {
    const config = createRepoOS(root).config;
    expect(shouldRunReminderAutomation(config, {}, 7171)).toBe(true);
    for (const env of [{ VITEST: "true" }, { REPOOS_PREVIEW_CHILD: "1" }]) {
      expect(shouldRunReminderAutomation(config, env, 7171)).toBe(false);
      const emit = vi.fn();
      runReminderTick(config, emit, env, 7171);
      expect(emit).not.toHaveBeenCalled();
    }
    expect(shouldRunReminderAutomation(config, {}, 0)).toBe(false);
    expect(shouldRunReminderAutomation({ ...config, previewOverrides: ["auth"] }, {}, 7171)).toBe(
      false,
    );
  });
});
describe("reminder CLI API delegation", () => {
  it("uses the supported API for all commands and surfaces validation errors", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const request = vi.spyOn(RepoOsApi.prototype, "requestOk").mockResolvedValue({ ok: true });
    expect(await cmdReminder(["add", "--text", "Credit", "--at", input.fireAt])).toBe(0);
    expect(request).toHaveBeenLastCalledWith(
      "POST",
      "/api/reminders",
      expect.objectContaining({ text: "Credit" }),
      [201],
    );
    for (const action of ["list", "done", "snooze", "delete"]) {
      expect(
        await cmdReminder([
          action,
          "id",
          ...(action === "snooze" ? ["--at", "2099-01-01T00:00:00Z"] : []),
          "--yes",
        ]),
      ).toBe(0);
    }
    expect(request).toHaveBeenLastCalledWith("DELETE", "/api/reminders/id");
    expect(await cmdReminder(["add", "--text", "x", "--at", "wrong"])).toBe(1);
    expect(err).toHaveBeenLastCalledWith(expect.stringContaining("ISO date/time"));
    request.mockRejectedValueOnce(new Error("Unknown agent, model or provider: agent:nope"));
    expect(
      await cmdReminder(["add", "--text", "x", "--at", input.fireAt, "--link", "agent:nope"]),
    ).toBe(1);
    expect(err).toHaveBeenLastCalledWith(expect.stringContaining("Unknown agent"));
  });
});
