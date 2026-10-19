import type { RouteHandler } from "./types.js";
import { json, readBody } from "./utils.js";
import {
  createReminder,
  deleteReminder,
  doneReminder,
  listReminders,
  reminderLinks,
  snoozeReminder,
  updateReminder,
  type ReminderInput,
} from "../../core/reminders.js";

export const getReminders: RouteHandler = (ctx, _req, res) =>
  json(res, 200, { reminders: listReminders(ctx.config), links: reminderLinks(ctx.config) });

function mutation(action: "add" | "edit" | "done" | "snooze" | "delete"): RouteHandler {
  return async (ctx, req, res, params) => {
    try {
      const body = action === "done" || action === "delete" ? {} : await readBody(req);
      if (!body || typeof body !== "object" || Array.isArray(body))
        throw new Error("Expected a JSON object");
      const input = body as ReminderInput;
      const id = params.param1 ?? "";
      let row;
      switch (action) {
        case "add":
          row = createReminder(ctx.config, input);
          break;
        case "edit":
          row = updateReminder(ctx.config, id, input);
          break;
        case "done":
          row = doneReminder(ctx.config, id);
          break;
        case "snooze":
          row = snoozeReminder(ctx.config, id, input.fireAt);
          break;
        case "delete":
          deleteReminder(ctx.config, id);
          break;
      }
      ctx.emitEvent({ type: "reminder.changed", at: new Date().toISOString() });
      return json(res, action === "add" ? 201 : 200, row ?? { ok: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return json(res, message === "Reminder not found" ? 404 : 400, { error: message });
    }
  };
}
export const postReminder = mutation("add");
export const patchReminder = mutation("edit");
export const postReminderDone = mutation("done");
export const postReminderSnooze = mutation("snooze");
export const removeReminder = mutation("delete");
