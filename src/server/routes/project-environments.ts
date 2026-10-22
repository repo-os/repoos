import {
  existsSync,
  readFileSync,
  appendFileSync,
  mkdirSync,
  writeFileSync,
  chmodSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { execFileSync } from "node:child_process";
import {
  projectEnvironmentSourceHasKey,
  readProjectEnvironment,
  validateEnvironmentRegistry,
  writeProjectEnvironmentValue,
  readProjectEnvironmentBindings,
  writeProjectEnvironmentBinding,
} from "../../core/project-environments.js";
import { MODEL_PROVIDERS } from "../../core/providers/spend.js";
import { requireAdmin } from "./auth.js";
import { readBody } from "./utils.js";
import type { RouteHandler } from "./types.js";

const registryPath = ".repoos/environments.json";
const reservedCredentialNames = new Set(
  [
    "OPENAI_API_KEY",
    "GROQ_API_KEY",
    "REPOOS_WHISPER_KEY",
    "REPOOS_RESEND_API_KEY",
    "REPOOS_GOOGLE_CLIENT_SECRET",
    "REPOOS_AUTH_SESSION_SECRET",
    "REPOOS_AUTH_DEV_BACKDOOR_CODE",
    "REPOOS_SECRET_STORE_KEY",
    "REPOOS_TELEGRAM_PROVISIONING_KEY",
    "CLOUDFLARE_API_TOKEN",
    "HETZNER_API_TOKEN",
    ...MODEL_PROVIDERS.map((provider) => provider.envVar).filter((name): name is string => !!name),
  ].map((name) => name.toUpperCase()),
);

function isReservedProjectKey(key: string): boolean {
  const upper = key.toUpperCase();
  return upper.startsWith("REPOOS_") || reservedCredentialNames.has(upper);
}

function registry(root: string) {
  const path = join(root, registryPath);
  if (!existsSync(path)) return { environments: [] };
  return validateEnvironmentRegistry(JSON.parse(readFileSync(path, "utf8")));
}
function send(res: Parameters<RouteHandler>[2], status: number, body: unknown) {
  res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  res.end(JSON.stringify(body));
}
function originAllowed(req: Parameters<RouteHandler>[1]) {
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    const parsed = new URL(origin);
    const host = req.headers.host;
    const proto = req.headers["x-forwarded-proto"] ?? "http";
    return (
      !!host && parsed.host.toLowerCase() === host.toLowerCase() && parsed.protocol === `${proto}:`
    );
  } catch {
    return false;
  }
}
function audit(root: string, actor: string, environment: string, key: string, action: string) {
  const path = join(root, ".repoos", "secret-audit.ndjson");
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  appendFileSync(
    path,
    `${JSON.stringify({ actor, environment, key, action, at: new Date().toISOString() })}\n`,
    { mode: 0o600 },
  );
}
function resolveEnv(root: string, id: string) {
  return registry(root).environments.find((env) => env.id === id);
}

export const listProjectEnvironmentSecrets: RouteHandler = (ctx, req, res, params) => {
  res.setHeader("Cache-Control", "no-store");
  const user = requireAdmin(req, ctx.config, res);
  if (!user) return;
  if (!originAllowed(req)) return send(res, 403, { error: "Request origin rejected" });
  try {
    const env = resolveEnv(ctx.config.root, params.param1 ?? "");
    if (!env) return send(res, 404, { error: "Unknown project environment" });
    const snapshot = readProjectEnvironment(ctx.config.root, env);
    const bindings = readProjectEnvironmentBindings(ctx.config.root).bindings;
    const keys = [...new Set([...snapshot.keys, ...snapshot.expectedKeys])]
      .filter((name) => !isReservedProjectKey(name))
      .sort()
      .map((name) => ({
        name,
        status: snapshot.keys.includes(name) ? "set" : "missing",
        source: snapshot.source,
        inherited:
          snapshot.keys.includes(name) &&
          !projectEnvironmentSourceHasKey(ctx.config.root, env.sources.at(-1)!.path, name),
        visibility: /^(VITE_|NEXT_PUBLIC_|PUBLIC_)/.test(name) ? "public" : "server-only",
        version: snapshot.sha256,
        consumers: bindings
          .filter((row) => row.environment === env.id && row.keys.includes(name))
          .map((row) => row.consumer),
        restartNeeded: false,
      }));
    return send(res, 200, { environment: env.id, version: snapshot.sha256, keys });
  } catch {
    return send(res, 400, { error: "Could not read project environment metadata" });
  }
};

/** Environment labels and registered source paths only; never return values. */
export const listProjectEnvironments: RouteHandler = (ctx, req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (!requireAdmin(req, ctx.config, res)) return;
  if (!originAllowed(req)) return send(res, 403, { error: "Request origin rejected" });
  try {
    return send(res, 200, registry(ctx.config.root));
  } catch {
    return send(res, 400, { error: "Could not read project environments" });
  }
};

/** Create an empty, ignored environment source and register it. */
export const createProjectEnvironment: RouteHandler = async (ctx, req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (!requireAdmin(req, ctx.config, res)) return;
  if (!originAllowed(req)) return send(res, 403, { error: "Request origin rejected" });
  const body = (await readBody(req)) as { name?: unknown };
  const id = typeof body.name === "string" ? body.name.trim() : "";
  if (!/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(id))
    return send(res, 400, {
      error: "Use a name starting with a letter, followed by letters, numbers, _ or -.",
    });
  try {
    const current = registry(ctx.config.root);
    if (current.environments.some((env) => env.id.toLowerCase() === id.toLowerCase()))
      return send(res, 409, { error: "That environment already exists" });
    const sourcePath = `.env.${id}`;
    const source = join(ctx.config.root, sourcePath);
    execFileSync("git", ["-C", ctx.config.root, "check-ignore", "-q", "--", sourcePath], {
      stdio: "ignore",
    });
    if (existsSync(source))
      return send(res, 409, { error: "The environment source file already exists" });
    mkdirSync(dirname(source), { recursive: true, mode: 0o700 });
    writeFileSync(source, "", { mode: 0o600, flag: "wx" });
    chmodSync(source, 0o600);
    current.environments.push({
      id,
      sources: [{ id: "local", path: sourcePath, examplePath: ".env.example" }],
    });
    const path = join(ctx.config.root, registryPath);
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    writeFileSync(path, `${JSON.stringify(validateEnvironmentRegistry(current), null, 2)}\n`, {
      mode: 0o600,
    });
    chmodSync(path, 0o600);
    return send(res, 201, {
      environment: {
        id,
        sources: [{ id: "local", path: sourcePath, examplePath: ".env.example" }],
      },
    });
  } catch {
    return send(res, 400, {
      error: "Could not create project environment. Check that its source file is ignored by git.",
    });
  }
};

export const mutateProjectEnvironmentSecret: RouteHandler = async (ctx, req, res, params) => {
  res.setHeader("Cache-Control", "no-store");
  const user = requireAdmin(req, ctx.config, res);
  if (!user) return;
  if (!originAllowed(req)) return send(res, 403, { error: "Request origin rejected" });
  const body = (await readBody(req)) as {
    key?: unknown;
    value?: unknown;
    version?: unknown;
    action?: unknown;
  };
  const key = typeof body.key === "string" ? body.key : "";
  const action = body.action;
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) || isReservedProjectKey(key))
    return send(res, 400, { error: "Reserved or invalid project key" });
  if (!(action === "add" || action === "replace" || action === "delete"))
    return send(res, 400, { error: "Invalid action" });
  if (action !== "delete" && typeof body.value !== "string")
    return send(res, 400, { error: "A value is required" });
  if (typeof body.version !== "string")
    return send(res, 400, { error: "A metadata version is required" });
  try {
    const env = resolveEnv(ctx.config.root, params.param1 ?? "");
    if (!env) return send(res, 404, { error: "Unknown project environment" });
    const snapshot = readProjectEnvironment(ctx.config.root, env);
    const exists = snapshot.keys.includes(key);
    if ((action === "add" && exists) || (action === "replace" && !exists))
      return send(res, 409, { error: "Key status changed; reload metadata" });
    const writable = env.sources[env.sources.length - 1];
    if (
      action === "delete" &&
      !projectEnvironmentSourceHasKey(ctx.config.root, writable.path, key)
    ) {
      return send(res, 409, {
        error: "Key is not defined in the writable source; reload metadata",
      });
    }
    const version = writeProjectEnvironmentValue(
      ctx.config.root,
      writable.path,
      key,
      action === "delete" ? null : (body.value as string),
      body.version,
    );
    const after = readProjectEnvironment(ctx.config.root, env);
    const stillSet = after.keys.includes(key);
    audit(ctx.config.root, user.email, env.id, key, action);
    return send(res, 200, {
      ok: true,
      environment: env.id,
      key,
      status: stillSet ? "set" : "missing",
      version,
      consumers: readProjectEnvironmentBindings(ctx.config.root)
        .bindings.filter((row) => row.environment === env.id && row.keys.includes(key))
        .map((row) => row.consumer),
      restartNeeded: true,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "write failed";
    if (message.includes("changed since"))
      return send(res, 409, { error: "Environment source changed; reload metadata" });
    return send(res, 400, { error: "Could not update project environment" });
  }
};

/** Binding metadata only; environment values never leave the child builder. */
export const getProjectEnvironmentBindings: RouteHandler = (ctx, req, res) => {
  if (!requireAdmin(req, ctx.config, res)) return;
  if (!originAllowed(req)) return send(res, 403, { error: "Request origin rejected" });
  try {
    return send(res, 200, readProjectEnvironmentBindings(ctx.config.root));
  } catch {
    return send(res, 400, { error: "Could not read environment bindings" });
  }
};

export const putProjectEnvironmentBinding: RouteHandler = async (ctx, req, res) => {
  if (!requireAdmin(req, ctx.config, res)) return;
  if (!originAllowed(req)) return send(res, 403, { error: "Request origin rejected" });
  const body = (await readBody(req)) as {
    consumer?: unknown;
    environment?: unknown;
    keys?: unknown;
  };
  const consumer = typeof body.consumer === "string" ? body.consumer : "";
  const environment =
    body.environment === null ? null : typeof body.environment === "string" ? body.environment : "";
  if (!Array.isArray(body.keys) || !body.keys.every((key) => typeof key === "string"))
    return send(res, 400, { error: "Keys must be an array of key names" });
  const keys = body.keys as string[];
  if (!consumer || !environment)
    return send(res, 400, { error: "Consumer and environment are required" });
  try {
    if (!registry(ctx.config.root).environments.some((row) => row.id === environment))
      return send(res, 404, { error: "Unknown project environment" });
    const result = writeProjectEnvironmentBinding(ctx.config.root, consumer, environment, keys);
    return send(res, 200, { ok: true, ...result, restartNeeded: true });
  } catch (error) {
    return send(res, 400, {
      error: error instanceof Error ? error.message : "Could not save binding",
    });
  }
};
