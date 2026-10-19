/** Public marketing-site endpoint. No RepoOS control-plane imports or runtime dependencies. */
interface RateLimiter {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}
export interface LandingEnv {
  ASSETS: { fetch(request: Request): Promise<Response> };
  REPOOS_RESEND_API_KEY?: string;
  ENQUIRY_FROM?: string;
  ENQUIRY_RATE_LIMITER?: RateLimiter;
  ENQUIRY_GLOBAL_LIMITER?: RateLimiter;
}

const MAX_BYTES = 24_000;
const TIMINGS = new Set([
  "Exploring possibilities",
  "Ready to start soon",
  "We have a target launch date",
]);
function json(status: number, ok: boolean): Response {
  return Response.json(
    { ok },
    {
      status,
      headers: {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        ...(status === 429 ? { "Retry-After": "60" } : {}),
        ...(status === 405 ? { Allow: "POST" } : {}),
      },
    },
  );
}
function singleLine(value: unknown, max: number): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.length <= max &&
    // oxlint-disable-next-line no-control-regex -- Reject control characters in email/header fields.
    !/[\x00-\x1f\x7f]/.test(value)
  );
}
function validEmail(value: unknown): value is string {
  return (
    singleLine(value, 254) &&
    /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+$/.test(
      value,
    )
  );
}
async function readBody(request: Request): Promise<string> {
  // Content-Length alone is not a bound: chunked bodies may omit or lie about it.
  const reader = request.body?.getReader();
  if (!reader) return "";
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) {
        await reader.cancel();
        throw new RangeError("Request too large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}
async function hash(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function handleEnquiry(request: Request, env: LandingEnv): Promise<Response> {
  if (request.method !== "POST") return json(405, false);
  const origin = new URL(request.url).origin;
  if (
    request.headers.get("Origin") !== origin ||
    request.headers.get("Sec-Fetch-Site") === "cross-site"
  )
    return json(403, false);
  if (
    request.headers.get("Content-Type")?.split(";", 1)[0]?.trim().toLowerCase() !==
    "application/json"
  )
    return json(415, false);
  const length = Number(request.headers.get("Content-Length") || 0);
  if (!Number.isFinite(length) || length < 0 || length > MAX_BYTES) return json(413, false);
  if (
    !env.REPOOS_RESEND_API_KEY ||
    !env.ENQUIRY_FROM ||
    !env.ENQUIRY_RATE_LIMITER ||
    !env.ENQUIRY_GLOBAL_LIMITER
  )
    return json(503, false);

  try {
    const limited = await env.ENQUIRY_RATE_LIMITER.limit({
      key: await hash(`enquiry:${request.headers.get("CF-Connecting-IP") || "unknown"}`),
    });
    if (!limited.success) return json(429, false);
  } catch {
    return json(503, false);
  }

  let data: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(await readBody(request));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return json(400, false);
    data = parsed as Record<string, unknown>;
  } catch (error) {
    return json(error instanceof RangeError ? 413 : 400, false);
  }
  if (typeof data.website !== "string" || data.website.length > 300) return json(400, false);
  // Silently discard the hidden bot field. Never send an acknowledgement to a visitor.
  if (data.website.trim()) return json(200, true);
  if (
    !singleLine(data.name, 160) ||
    !validEmail(data.email) ||
    typeof data.problem !== "string" ||
    !data.problem.trim() ||
    data.problem.length > 5000 ||
    // oxlint-disable-next-line no-control-regex -- Allow only ordinary newlines/tabs in the plain-text brief.
    /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(data.problem) ||
    typeof data.timing !== "string" ||
    !TIMINGS.has(data.timing) ||
    typeof data.submissionId !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      data.submissionId,
    )
  )
    return json(400, false);

  const payload = {
    from: env.ENQUIRY_FROM,
    to: ["hello@repoos.org"],
    reply_to: data.email.trim(),
    subject: "RepoOS — new project enquiry",
    text: `New For Clients enquiry\n\nName / company: ${data.name.trim()}\nWork email: ${data.email.trim()}\nTiming: ${data.timing}\n\nProject / problem:\n${data.problem.trim()}\n`,
  };
  // Hash the content too: an edited draft with a reused ID cannot collide with a prior send.
  const idempotencyKey = `enquiry/${data.submissionId}/${await hash(JSON.stringify(payload))}`;
  try {
    const globalLimit = await env.ENQUIRY_GLOBAL_LIMITER.limit({ key: "enquiry-global" });
    if (!globalLimit.success) return json(429, false);
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.REPOOS_RESEND_API_KEY}`,
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000),
      redirect: "error",
    });
    if (!response.ok) return json(502, false);
    const result = (await response.json()) as { id?: unknown };
    if (typeof result.id !== "string" || !result.id) return json(502, false);
    return json(200, true);
  } catch {
    // No provider responses, keys, client details, or project briefs in logs or errors.
    return json(502, false);
  }
}

export default {
  async fetch(request: Request, env: LandingEnv): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/api/enquiry") return handleEnquiry(request, env);
    if (url.pathname.startsWith("/api/")) return json(404, false);
    if (/^\/for-clients\/?$/.test(url.pathname)) {
      url.pathname = "/for-clients/index.html";
      return env.ASSETS.fetch(new Request(url, request));
    }
    return env.ASSETS.fetch(request);
  },
};
