import { randomUUID } from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { AGENT_CLIS, AGENT_MODELS } from "./config.js";
import { parseDocument, serializeDocument } from "./frontmatter.js";
import { MODEL_PROVIDERS } from "./providers/spend.js";
import type { RepoOSConfig } from "./types.js";

export interface ReminderLink {
  value: string;
  label: string;
}
export interface Reminder {
  id: string;
  text: string;
  fireAt: string;
  link: string;
  doneAt: string;
  snoozedAt: string;
  notifiedFireAt: string;
  createdAt: string;
  updatedAt: string;
  state: "upcoming" | "due" | "overdue" | "done" | "snoozed";
}
export interface ReminderInput {
  text: string;
  fireAt: string;
  link?: string;
}

/** Static/configured choices only: opening reminders never probes a provider. */
export function reminderLinks(config: RepoOSConfig): ReminderLink[] {
  const links = new Map<string, string>();
  for (const cli of AGENT_CLIS) links.set(`agent:${cli}`, `Agent · ${cli}`);
  for (const agent of config.agents ?? []) {
    links.set(`agent:${agent.name}`, `Agent · ${agent.name}`);
    if (agent.model)
      links.set(`model:${agent.cli}/${agent.model}`, `Model · ${agent.cli} / ${agent.model}`);
  }
  for (const cli of AGENT_CLIS) {
    for (const model of AGENT_MODELS)
      links.set(`model:${cli}/${model}`, `Model · ${cli} / ${model}`);
  }
  for (const row of config.budget?.allowlist ?? []) {
    for (const model of row.models)
      links.set(`model:${row.cli}/${model}`, `Model · ${row.cli} / ${model}`);
  }
  for (const provider of MODEL_PROVIDERS)
    links.set(`provider:${provider.id}`, `Provider · ${provider.label}`);
  return [...links].map(([value, label]) => ({ value, label }));
}

/** Require an explicit timezone; reject Date.parse's silent calendar rollover. */
export function reminderDate(value: unknown): string {
  if (typeof value !== "string") throw new Error("fireAt must be an ISO date/time with a timezone");
  const match =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/.exec(
      value,
    );
  if (!match) throw new Error("fireAt must be an ISO date/time with a timezone");
  const [, year, month, day, hour, minute, second, zone] = match;
  const days = new Date(Date.UTC(Number(year), Number(month), 0)).getUTCDate();
  const offset = zone === "Z" ? [0, 0] : zone.slice(1).split(":").map(Number);
  if (
    Number(month) < 1 ||
    Number(month) > 12 ||
    Number(day) < 1 ||
    Number(day) > days ||
    Number(hour) > 23 ||
    Number(minute) > 59 ||
    Number(second ?? 0) > 59 ||
    offset[0] > 23 ||
    offset[1] > 59 ||
    !Number.isFinite(Date.parse(value))
  ) {
    throw new Error("fireAt is not a valid date/time");
  }
  return new Date(value).toISOString();
}

function directory(config: RepoOSConfig): string {
  const dir = join(config.root, config.remindersDir || "reminders");
  if (existsSync(dir) && (lstatSync(dir).isSymbolicLink() || !lstatSync(dir).isDirectory()))
    throw new Error("reminders must be a regular directory");
  return dir;
}
function file(config: RepoOSConfig, id: string): string {
  if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error("Invalid reminder id");
  const path = join(directory(config), `${id}.md`);
  if (existsSync(path) && !lstatSync(path).isFile())
    throw new Error("Reminder must be a regular file");
  return path;
}
export function reminderState(
  row: Pick<Reminder, "fireAt" | "doneAt" | "snoozedAt">,
  now = Date.now(),
): Reminder["state"] {
  if (row.doneAt) return "done";
  const elapsed = now - Date.parse(row.fireAt);
  if (elapsed >= 86_400_000) return "overdue";
  if (elapsed >= 0) return "due";
  return row.snoozedAt ? "snoozed" : "upcoming";
}
export function listReminders(config: RepoOSConfig, now = Date.now()): Reminder[] {
  const dir = directory(config);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => /^[a-f0-9-]{36}\.md$/.test(name))
    .map((name) => {
      const id = name.slice(0, -3);
      const { data, body } = parseDocument(readFileSync(file(config, id), "utf8"));
      const row = {
        id,
        text: body.trim(),
        fireAt: reminderDate(data.fire_at),
        link: String(data.link ?? ""),
        doneAt: String(data.done_at ?? ""),
        snoozedAt: String(data.snoozed_at ?? ""),
        notifiedFireAt: String(data.notified_fire_at ?? ""),
        createdAt: String(data.created_at ?? ""),
        updatedAt: String(data.updated_at ?? ""),
      };
      return { ...row, state: reminderState(row, now) };
    })
    .sort((a, b) => a.fireAt.localeCompare(b.fireAt) || a.id.localeCompare(b.id));
}
function save(config: RepoOSConfig, row: Reminder): Reminder {
  mkdirSync(directory(config), { recursive: true });
  const path = file(config, row.id);
  const temp = `${path}.${randomUUID()}.tmp`;
  try {
    writeFileSync(
      temp,
      serializeDocument(
        {
          id: row.id,
          fire_at: row.fireAt,
          link: row.link,
          done_at: row.doneAt,
          snoozed_at: row.snoozedAt,
          notified_fire_at: row.notifiedFireAt,
          created_at: row.createdAt,
          updated_at: row.updatedAt,
        },
        row.text + "\n",
      ),
      { flag: "wx" },
    );
    renameSync(temp, path);
  } finally {
    if (existsSync(temp)) unlinkSync(temp);
  }
  return { ...row, state: reminderState(row) };
}
function validate(config: RepoOSConfig, input: ReminderInput): Required<ReminderInput> {
  if (typeof input.text !== "string" || !input.text.trim())
    throw new Error("Reminder text is required");
  if (input.text.length > 4000) throw new Error("Reminder text must be at most 4000 characters");
  if (input.link != null && typeof input.link !== "string")
    throw new Error("link must be a string");
  const link = input.link ?? "";
  if (link && !reminderLinks(config).some((item) => item.value === link))
    throw new Error(`Unknown agent, model or provider: ${link}`);
  return { text: input.text.trim(), fireAt: reminderDate(input.fireAt), link };
}
export function createReminder(config: RepoOSConfig, input: ReminderInput): Reminder {
  const values = validate(config, input);
  const now = new Date().toISOString();
  return save(config, {
    ...values,
    id: randomUUID(),
    doneAt: "",
    snoozedAt: "",
    notifiedFireAt: "",
    createdAt: now,
    updatedAt: now,
    state: "upcoming",
  });
}
function get(config: RepoOSConfig, id: string): Reminder {
  file(config, id);
  const row = listReminders(config).find((r) => r.id === id);
  if (!row) throw new Error("Reminder not found");
  return row;
}
export function updateReminder(
  config: RepoOSConfig,
  id: string,
  patch: Partial<ReminderInput>,
): Reminder {
  const row = get(config, id);
  const values = validate(config, {
    text: patch.text ?? row.text,
    fireAt: patch.fireAt ?? row.fireAt,
    link: patch.link ?? row.link,
  });
  const moved = values.fireAt !== row.fireAt;
  return save(config, {
    ...row,
    ...values,
    ...(moved ? { doneAt: "", snoozedAt: "", notifiedFireAt: "" } : {}),
    updatedAt: new Date().toISOString(),
  });
}
export function doneReminder(config: RepoOSConfig, id: string): Reminder {
  return save(config, {
    ...get(config, id),
    doneAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
}
export function snoozeReminder(config: RepoOSConfig, id: string, fireAt: unknown): Reminder {
  const date = reminderDate(fireAt);
  if (Date.parse(date) <= Date.now()) throw new Error("Snooze time must be in the future");
  return save(config, {
    ...get(config, id),
    fireAt: date,
    doneAt: "",
    snoozedAt: new Date().toISOString(),
    notifiedFireAt: "",
    updatedAt: new Date().toISOString(),
  });
}
export function deleteReminder(config: RepoOSConfig, id: string): void {
  get(config, id);
  unlinkSync(file(config, id));
}
/** Persist the occurrence identity before broadcasting. Synchronous writes prevent overlapping ticks. */
export function fireDueReminders(config: RepoOSConfig, now = Date.now()): Reminder[] {
  const fired: Reminder[] = [];
  for (const row of listReminders(config, now)) {
    if (!row.doneAt && Date.parse(row.fireAt) <= now && row.notifiedFireAt !== row.fireAt) {
      fired.push(save(config, { ...row, notifiedFireAt: row.fireAt }));
    }
  }
  return fired;
}
