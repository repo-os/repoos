/**
 * `repoos release` — release maintenance commands (#1092).
 */
import { c } from "../cli/colors.js";
import { RepoOsApi, RepoOsApiError } from "../cli/repoos-api.js";

function printErr(message: string): void {
  console.error(c.red("  ✗ ") + message);
}

const RELEASE_EMAIL_PREVIEW_USAGE =
  "Usage: repoos release email --preview <version> [--json] [--port N]";

function parseReleaseEmailPreviewArgs(args: string[]): {
  version?: string;
  port?: number;
  json: boolean;
  error?: string;
} {
  const json = args.includes("--json");
  let port: number | undefined;
  const rest: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--json") continue;
    if (a === "--port") {
      const value = Number(args[++i]);
      if (!Number.isInteger(value) || value <= 0) return { json, error: "--port requires a positive integer" };
      port = value;
      continue;
    }
    if (a === "--help" || a === "-h") return { json, error: RELEASE_EMAIL_PREVIEW_USAGE };
    rest.push(a);
  }
  if (rest[0] !== "email" || rest[1] !== "--preview") {
    return { json, error: RELEASE_EMAIL_PREVIEW_USAGE };
  }
  const version = rest[2]?.trim();
  if (!version) return { json, error: RELEASE_EMAIL_PREVIEW_USAGE };
  if (rest.length > 3) return { json, error: RELEASE_EMAIL_PREVIEW_USAGE };
  return { version, port, json };
}

async function ensureServer(api: RepoOsApi): Promise<void> {
  if (!(await api.health())) {
    throw new RepoOsApiError(
      `Can't reach the RepoOS server at ${api.base}. Start it with \`repoos serve\`.`,
      0,
    );
  }
}

/** Render a release email without sending (`GET /api/release/email/preview`). */
async function cmdReleaseEmailPreview(version: string, opts: { port?: number; json: boolean }): Promise<number> {
  const api = new RepoOsApi({ port: opts.port });
  try {
    await ensureServer(api);
    const path = `/api/release/email/preview?version=${encodeURIComponent(version)}`;
    const body = (await api.requestOk("GET", path)) as {
      subject?: string;
      html?: string;
      text?: string;
    };
    if (opts.json) {
      console.log(JSON.stringify(body, null, 2));
      return 0;
    }
    console.log(`Subject: ${body.subject ?? ""}`);
    console.log("");
    console.log(body.html ?? "");
    console.log("");
    console.log(body.text ?? "");
    return 0;
  } catch (e) {
    printErr((e as RepoOsApiError).message);
    return 1;
  }
}

export async function cmdRelease(args: string[]): Promise<number> {
  const parsed = parseReleaseEmailPreviewArgs(args);
  if (parsed.error) {
    printErr(parsed.error);
    return 1;
  }
  if (!parsed.version) {
    printErr(RELEASE_EMAIL_PREVIEW_USAGE);
    return 1;
  }
  return cmdReleaseEmailPreview(parsed.version, { port: parsed.port, json: parsed.json });
}
