/**
 * HTTP client for the running RepoOS control plane (#0723).
 *
 * Authenticates with the loopback local-cli token when available (#0582), else a
 * stored session cookie, and transparently re-logs in via the dev backdoor on
 * 401 after a server reload (never prints the backdoor code).
 */
import { boardRoot, loadConfig, resolveServePort } from "../core/config.js";
import { SESSION_COOKIE_NAME } from "../core/auth.js";
import { readLocalCliToken } from "../server/local-token.js";
import {
  clearCliSession,
  readCliSession,
  sessionTokenFromSetCookie,
  writeCliSession,
} from "./cli-session.js";
import { readServeLocks } from "../commands/status.js";

export class RepoOsApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body?: unknown,
  ) {
    super(message);
    this.name = "RepoOsApiError";
  }
}

export interface RepoOsApiOptions {
  root?: string;
  port?: number;
  json?: boolean;
}

export interface ApiJson {
  ok?: boolean;
  error?: string;
  [key: string]: unknown;
}

function readApiError(body: unknown, status: number): string {
  if (body && typeof body === "object" && "error" in body) {
    const err = (body as { error?: unknown }).error;
    if (typeof err === "string" && err.trim()) return err.trim();
  }
  return `HTTP ${status}`;
}

export function resolveControlPlaneBase(opts: RepoOsApiOptions = {}): {
  root: string;
  baseUrl: string;
  config: ReturnType<typeof loadConfig>;
} {
  const { root } = opts.root ? { root: opts.root } : boardRoot();
  const config = loadConfig(root);
  const configuredPort = resolveServePort(root, config);
  const liveLock = readServeLocks(root, config.cacheDir).find(
    (l) => l.alive && (l.port ?? configuredPort) > 0,
  );
  const port = opts.port ?? liveLock?.port ?? configuredPort;
  return { root, baseUrl: `http://127.0.0.1:${port}`, config };
}

export class RepoOsApi {
  private readonly root: string;
  private readonly baseUrl: string;
  private readonly config: ReturnType<typeof loadConfig>;
  private session: string | null;
  constructor(opts: RepoOsApiOptions = {}) {
    const resolved = resolveControlPlaneBase(opts);
    this.root = resolved.root;
    this.baseUrl = resolved.baseUrl;
    this.config = resolved.config;
    this.session = readCliSession(this.root, this.config.cacheDir);
  }

  private localToken(): string | null {
    return readLocalCliToken(this.root, this.config.cacheDir);
  }

  get base(): string {
    return this.baseUrl;
  }

  private buildHeaders(jsonBody: boolean): Record<string, string> {
    const headers: Record<string, string> = {};
    if (jsonBody) headers["content-type"] = "application/json";
    const token = this.localToken();
    if (token) headers["x-repoos-local-token"] = token;
    if (this.session) headers.cookie = `${SESSION_COOKIE_NAME}=${this.session}`;
    return headers;
  }

  private async devBackdoorLogin(): Promise<boolean> {
    if (this.config.auth?.enabled !== true) return true;
    const email = this.config.auth.bootstrapAdmin?.trim().toLowerCase();
    const code = this.config.auth.devBackdoorCode?.trim();
    if (!email || !code || process.env.NODE_ENV === "production") return false;

    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}/api/auth/verify-otp`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, code }),
      });
    } catch {
      return false;
    }
    if (!res.ok) return false;
    const setCookie =
      typeof res.headers.getSetCookie === "function"
        ? res.headers.getSetCookie()
        : (res.headers.get("set-cookie") ?? undefined);
    const token = sessionTokenFromSetCookie(setCookie, SESSION_COOKIE_NAME);
    if (!token) return false;
    this.session = token;
    writeCliSession(this.root, this.config.cacheDir, token);
    return true;
  }

  async health(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/api/health`);
      return res.ok;
    } catch {
      return false;
    }
  }

  async request(
    method: string,
    path: string,
    body?: unknown,
    opts: { retryAuth?: boolean } = {},
  ): Promise<{ status: number; body: ApiJson }> {
    const jsonBody = body !== undefined;
    const doFetch = async (): Promise<Response> => {
      try {
        return await fetch(`${this.baseUrl}${path}`, {
          method,
          headers: this.buildHeaders(jsonBody),
          body: jsonBody ? JSON.stringify(body) : undefined,
        });
      } catch (err) {
        throw new RepoOsApiError(
          `Can't reach the RepoOS server at ${this.baseUrl}. Is \`repoos serve\` running? ${(err as Error).message}`,
          0,
        );
      }
    };

    let res = await doFetch();
    if (res.status === 401 && opts.retryAuth !== false) {
      const relogged = await this.devBackdoorLogin();
      if (relogged) {
        res = await doFetch();
      } else {
        clearCliSession(this.root, this.config.cacheDir);
        this.session = null;
      }
    }

    let parsed: ApiJson = {};
    const text = await res.text();
    if (text) {
      try {
        parsed = JSON.parse(text) as ApiJson;
      } catch {
        parsed = { error: text };
      }
    }

    return { status: res.status, body: parsed };
  }

  async requestOk(
    method: string,
    path: string,
    body?: unknown,
    allowedStatuses?: number[],
  ): Promise<ApiJson> {
    const { status, body: data } = await this.request(method, path, body);
    const allowed = allowedStatuses ?? [200];
    if (!allowed.includes(status)) {
      throw new RepoOsApiError(readApiError(data, status), status, data);
    }
    return data;
  }
}

export async function pollUntil<T>(
  fn: () => Promise<T | null>,
  opts: { intervalMs?: number; timeoutMs?: number; label?: string },
): Promise<T> {
  const intervalMs = opts.intervalMs ?? 250;
  const timeoutMs = opts.timeoutMs ?? 120_000;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await fn();
    if (value !== null) return value;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new RepoOsApiError(
    opts.label ? `Timed out: ${opts.label}` : "Timed out waiting for operation",
    408,
  );
}
