/**
 * Concrete decision-provider adapters (#0791): TypeSafe Jev and Cloudflare
 * Clef-Flash. Both speak the System One `/v1/systemone` contract via the shared
 * codec in `system-one.ts`; they differ only in endpoint, auth and model id.
 *
 * Built-in `fetch` only (zero runtime dependencies). Every call is bounded by an
 * `AbortController` timeout and every failure is a typed `RoutingProviderError`
 * so the policy can fall back deterministically. API keys are passed in by the
 * caller (resolved from the env/.env secret store) and never logged or echoed.
 */
import { decodeSystemOneResponse, encodeSystemOneRequest } from "./system-one.js";
import {
  RoutingProviderError,
  type RoutingDecisionProvider,
  type RoutingDecisionRequest,
  type RoutingDecisionResponse,
  type RoutingProviderId,
} from "./types.js";

/** Hosted TypeSafe endpoint (verified: docs.typesafe.ai quickstart). */
export const JEV_ENDPOINT = "https://api.typesafe.ai/v1/systemone";
/** Default Jev model: the floating alias. Pin a version (e.g. "jev-1.13.0") in config for reproducibility. */
export const JEV_DEFAULT_MODEL = "jev-latest";
/** Default Clef-Flash model id as served by SGLang. */
export const CLEF_FLASH_DEFAULT_MODEL = "Cloudflare/clef-flash";

export interface JevProviderOptions {
  apiKey: string;
  model?: string;
  endpoint?: string;
  fetchImpl?: typeof fetch;
}

export interface ClefFlashProviderOptions {
  /** Base URL of the self-hosted SGLang server, e.g. http://localhost:30000 (no trailing path). */
  baseUrl: string;
  /** Optional bearer token when the self-hosted server is protected. */
  apiKey?: string;
  model?: string;
  fetchImpl?: typeof fetch;
}

/** Shared POST-and-decode path for both adapters. */
async function postSystemOne(
  url: string,
  headers: Record<string, string>,
  model: string,
  request: RoutingDecisionRequest,
  fetchImpl: typeof fetch,
): Promise<RoutingDecisionResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), request.timeoutMs);
  let res: Response;
  try {
    res = await fetchImpl(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(encodeSystemOneRequest(model, request)),
      signal: controller.signal,
    });
  } catch (err) {
    const aborted = (err as { name?: string })?.name === "AbortError";
    throw new RoutingProviderError(
      aborted ? "timeout" : "transport",
      aborted ? `decision timed out after ${request.timeoutMs}ms` : "decision request failed",
    );
  } finally {
    clearTimeout(timer);
  }
  if (res.status === 401 || res.status === 403) {
    throw new RoutingProviderError(
      "auth",
      `decision provider rejected credentials (HTTP ${res.status})`,
    );
  }
  if (!res.ok) {
    throw new RoutingProviderError("http", `decision provider returned HTTP ${res.status}`);
  }
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new RoutingProviderError("malformed", "decision provider returned non-JSON");
  }
  return decodeSystemOneResponse(
    body,
    request.questions.map((q) => q.id),
  );
}

/** TypeSafe Jev — hosted System One API. */
export function createJevProvider(opts: JevProviderOptions): RoutingDecisionProvider {
  if (!opts.apiKey) {
    throw new RoutingProviderError("not-configured", "Jev needs an API key (TYPESAFE_API_KEY)");
  }
  const url = opts.endpoint ?? JEV_ENDPOINT;
  const model = opts.model ?? JEV_DEFAULT_MODEL;
  const fetchImpl = opts.fetchImpl ?? fetch;
  return {
    id: "jev",
    decide: (request) =>
      postSystemOne(url, { Authorization: `Bearer ${opts.apiKey}` }, model, request, fetchImpl),
  };
}

/** Cloudflare Clef-Flash — self-hosted SGLang serving the same System One contract. */
export function createClefFlashProvider(opts: ClefFlashProviderOptions): RoutingDecisionProvider {
  if (!opts.baseUrl) {
    throw new RoutingProviderError(
      "not-configured",
      "Clef-Flash needs a base URL of the self-hosted server",
    );
  }
  const url = `${opts.baseUrl.replace(/\/+$/, "")}/v1/systemone`;
  const model = opts.model ?? CLEF_FLASH_DEFAULT_MODEL;
  const fetchImpl = opts.fetchImpl ?? fetch;
  const headers: Record<string, string> = opts.apiKey
    ? { Authorization: `Bearer ${opts.apiKey}` }
    : {};
  return {
    id: "clef-flash",
    decide: (request) => postSystemOne(url, headers, model, request, fetchImpl),
  };
}

/** Narrow a stored provider string to a known id, or null. */
export function parseRoutingProviderId(value: unknown): RoutingProviderId | null {
  return value === "jev" || value === "clef-flash" ? value : null;
}
