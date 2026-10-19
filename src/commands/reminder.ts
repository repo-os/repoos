import { RepoOsApi } from "../cli/repoos-api.js";
import { reminderDate } from "../core/reminders.js";

export const REMINDER_USAGE =
  'Usage: repoos reminder add --text "…" --at <ISO with timezone> [--link agent:cursor] | list | done <id> | snooze <id> --at <ISO> | delete <id> --yes [--json] [--port N]';

export async function cmdReminder(args: string[]): Promise<number> {
  try {
    const [action, ...rest] = args;
    if (action === "--help" || action === "help") {
      console.log(REMINDER_USAGE);
      return 0;
    }
    const positional: string[] = [];
    const flags: Record<string, string> = {};
    let yes = false;
    for (let i = 0; i < rest.length; i++) {
      const arg = rest[i];
      if (arg === "--yes") yes = true;
      else if (arg === "--json") continue;
      else if (["--text", "--at", "--link", "--port"].includes(arg)) {
        const value = rest[++i];
        if (!value || value.startsWith("--")) throw new Error(`Missing value for ${arg}`);
        flags[arg] = value;
      } else if (arg.startsWith("--")) throw new Error(`Unknown flag ${arg}`);
      else positional.push(arg);
    }
    if (!["add", "list", "done", "snooze", "delete"].includes(action ?? ""))
      throw new Error(REMINDER_USAGE);
    if (
      flags["--port"] &&
      (!Number.isInteger(Number(flags["--port"])) || Number(flags["--port"]) < 1)
    )
      throw new Error("--port requires a positive integer");
    const api = new RepoOsApi({ port: flags["--port"] ? Number(flags["--port"]) : undefined });
    const id = positional[0];
    let result;
    if (action === "list") result = await api.requestOk("GET", "/api/reminders");
    else if (action === "add") {
      if (!flags["--text"]) throw new Error("Reminder text is required (--text)");
      result = await api.requestOk(
        "POST",
        "/api/reminders",
        { text: flags["--text"], fireAt: reminderDate(flags["--at"]), link: flags["--link"] ?? "" },
        [201],
      );
    } else {
      if (!id) throw new Error(`Reminder id is required\n${REMINDER_USAGE}`);
      const path = `/api/reminders/${encodeURIComponent(id)}`;
      if (action === "delete") {
        if (!yes) throw new Error("Pass --yes to confirm deletion");
        result = await api.requestOk("DELETE", path);
      } else {
        result = await api.requestOk(
          "POST",
          `${path}/${action}`,
          action === "snooze" ? { fireAt: reminderDate(flags["--at"]) } : {},
        );
      }
    }
    console.log(JSON.stringify(result, null, 2));
    return 0;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
}
