/**
 * `repoos bundle` — surgical edits to easter-eggs bundle tasks (#0824).
 * All writes go through POST /api/tasks/:id/bundle.
 */
import { readFileSync } from "node:fs";
import { c } from "../cli/colors.js";
import { RepoOsApi, RepoOsApiError } from "../cli/repoos-api.js";

const USAGE =
  "  Usage:\n" +
  "    repoos bundle add <id> --title \"…\" --area … --fix \"…\" --source \"…\" [--test \"…\"] [--force] [--json] [--port N]\n" +
  '    repoos bundle edit <id> <En> --section "Desired UX" --section-body <text|-> [--force] [--json] [--port N]\n' +
  "    repoos bundle done <id> <En> [--json] [--port N]\n" +
  "    repoos bundle undo <id> <En> [--json] [--port N]\n";

async function ensureServer(api: RepoOsApi): Promise<void> {
  if (!(await api.health())) {
    throw new RepoOsApiError(
      `Can't reach the RepoOS server at ${api.base}. Start it with \`repoos serve\`.`,
      0,
    );
  }
}

export async function cmdBundle(args: string[]): Promise<number> {
  if (args[0] === "--help" || args[0] === "-h") {
    console.log(USAGE);
    return 0;
  }

  const sub = args[0];
  if (!sub || !["add", "edit", "done", "undo"].includes(sub)) {
    console.error(c.red(USAGE));
    return 1;
  }

  let json = false;
  let port: number | undefined;
  let force = false;
  const rest: string[] = [];
  for (let i = 1; i < args.length; i++) {
    const a = args[i];
    if (a === "--json") json = true;
    else if (a === "--force") force = true;
    else if (a === "--port") {
      const p = args[++i];
      const n = Number(p);
      if (!p || !Number.isInteger(n) || n <= 0) {
        console.error(c.red("  --port requires a positive integer"));
        return 1;
      }
      port = n;
    } else rest.push(a);
  }

  const id = rest[0];
  if (!id) {
    console.error(c.red(USAGE));
    return 1;
  }

  const payload: Record<string, unknown> = { action: sub, force };
  if (sub === "add") {
    for (let i = 1; i < rest.length; i++) {
      const a = rest[i];
      if (!a.startsWith("--")) {
        console.error(c.red(`  Unexpected argument: ${a}\n${USAGE}`));
        return 1;
      }
      const key = a.slice(2);
      const raw = rest[++i];
      if (raw === undefined) {
        console.error(c.red(`  Missing value for --${key}`));
        return 1;
      }
      if (key === "title" || key === "area" || key === "fix" || key === "source" || key === "test") {
        payload[key] = raw;
      } else {
        console.error(c.red(`  Unknown flag --${key}\n${USAGE}`));
        return 1;
      }
    }
  } else if (sub === "edit") {
    const item = rest[1];
    if (!item) {
      console.error(c.red(USAGE));
      return 1;
    }
    payload.item = item;
    let section: string | undefined;
    let sectionBody: string | undefined;
    for (let i = 2; i < rest.length; i++) {
      const a = rest[i];
      if (a === "--section") {
        section = rest[++i];
      } else if (a === "--section-body") {
        const raw = rest[i + 1];
        if (raw !== undefined && !raw.startsWith("--")) {
          sectionBody = raw === "-" ? readFileSync(0, "utf8") : raw;
          i++;
        } else {
          sectionBody = readFileSync(0, "utf8");
        }
      } else if (!a.startsWith("--")) {
        console.error(c.red(`  Unexpected argument: ${a}\n${USAGE}`));
        return 1;
      } else {
        console.error(c.red(`  Unknown flag ${a}\n${USAGE}`));
        return 1;
      }
    }
    if (!section) {
      console.error(c.red("  --section is required"));
      return 1;
    }
    if (sectionBody === undefined) {
      console.error(c.red("  --section-body is required"));
      return 1;
    }
    payload.section = section;
    payload.sectionBody = sectionBody;
  } else {
    const item = rest[1];
    if (!item) {
      console.error(c.red(USAGE));
      return 1;
    }
    payload.item = item;
    if (rest.length > 2) {
      console.error(c.red(`  Unexpected argument: ${rest[2]}\n${USAGE}`));
      return 1;
    }
  }

  const api = new RepoOsApi({ port });
  try {
    await ensureServer(api);
    const data = await api.requestOk("POST", `/api/tasks/${id}/bundle`, payload);
    if (json) {
      console.log(JSON.stringify(data, null, 2));
    } else {
      const itemId = (data as { itemId?: string }).itemId;
      const suffix = itemId ? ` (${itemId})` : payload.item ? ` (${payload.item})` : "";
      console.log(c.green("  ✓ ") + c.dim(`bundle ${sub}${suffix} on #${id}`));
    }
    return 0;
  } catch (e) {
    console.error(c.red("  ✗ ") + (e as RepoOsApiError).message);
    return 1;
  }
}

export const BUNDLE_USAGE = USAGE;
