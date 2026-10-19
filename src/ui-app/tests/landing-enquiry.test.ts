// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import worker, { type LandingEnv } from "../../../landing/worker.js";

const body = {
  name: "Alex at Example",
  email: "alex@example.com",
  problem: "A customer portal with <custom> reporting.",
  timing: "Exploring possibilities",
  website: "",
  submissionId: "5fa03a64-e43d-493a-8277-d9467b63e808",
};
let env: LandingEnv;
const send = vi.fn();
function request(data: unknown = body, headers: Record<string, string> = {}): Request {
  return new Request("https://repoos.org/api/enquiry", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "https://repoos.org",
      "CF-Connecting-IP": "192.0.2.1",
      ...headers,
    },
    body: JSON.stringify(data),
  });
}
beforeEach(() => {
  env = {
    ASSETS: { fetch: vi.fn(async () => new Response("asset")) },
    REPOOS_RESEND_API_KEY: "re_test_fake_0849",
    ENQUIRY_FROM: "RepoOS <enquiries@example.com>",
    ENQUIRY_RATE_LIMITER: { limit: vi.fn(async () => ({ success: true })) },
    ENQUIRY_GLOBAL_LIMITER: { limit: vi.fn(async () => ({ success: true })) },
  };
  send.mockReset().mockImplementation(async () => Response.json({ id: "fake-email-id" }));
  vi.stubGlobal("fetch", send);
});
afterEach(() => vi.unstubAllGlobals());

describe("landing project enquiries", () => {
  it("sends only to hello@repoos.org, with reply-to and plain-text project details", async () => {
    const response = await worker.fetch(
      request({ ...body, to: "attacker@example.com", from: "attacker@example.com" }),
      env,
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    const [url, options] = send.mock.calls[0]!;
    expect(url).toBe("https://api.resend.com/emails");
    const payload = JSON.parse(options.body);
    expect(payload).toEqual({
      from: env.ENQUIRY_FROM,
      to: ["hello@repoos.org"],
      reply_to: body.email,
      subject: "RepoOS — new project enquiry",
      text: expect.stringContaining(body.problem),
    });
    expect(payload).not.toHaveProperty("html");
    expect(options.headers.Authorization).toBe(`Bearer ${env.REPOOS_RESEND_API_KEY}`);
  });
  it("uses a stable provider idempotency key for retries, changing it for edited content", async () => {
    await worker.fetch(request(), env);
    await worker.fetch(request(), env);
    await worker.fetch(request({ ...body, problem: "An edited project" }), env);
    expect(send.mock.calls[0]![1].headers["Idempotency-Key"]).toBe(
      send.mock.calls[1]![1].headers["Idempotency-Key"],
    );
    expect(send.mock.calls[2]![1].headers["Idempotency-Key"]).not.toBe(
      send.mock.calls[0]![1].headers["Idempotency-Key"],
    );
  });
  it.each([
    { email: "invalid" },
    { email: "a@example.com\r\nBcc: victim@example.com" },
    { name: "\r\nInjected" },
    { name: " " },
    { problem: " " },
    { problem: "x".repeat(5001) },
    { timing: "unsupported" },
    { submissionId: "invalid" },
  ])("rejects invalid fields before sending (%j)", async (patch) => {
    expect((await worker.fetch(request({ ...body, ...patch }), env)).status).toBe(400);
    expect(send).not.toHaveBeenCalled();
  });
  it("rejects cross-origin and absent origins, and non-JSON requests", async () => {
    expect(
      (await worker.fetch(request(body, { Origin: "https://evil.example" }), env)).status,
    ).toBe(403);
    expect((await worker.fetch(request(body, { Origin: "null" }), env)).status).toBe(403);
    expect(
      (await worker.fetch(request(body, { "Sec-Fetch-Site": "cross-site" }), env)).status,
    ).toBe(403);
    expect((await worker.fetch(request(body, { "Content-Type": "text/plain" }), env)).status).toBe(
      415,
    );
    expect(send).not.toHaveBeenCalled();
  });
  it("rejects wrong methods and unknown API routes", async () => {
    const response = await worker.fetch(new Request("https://repoos.org/api/enquiry"), env);
    expect(response.status).toBe(405);
    expect(response.headers.get("Allow")).toBe("POST");
    expect((await worker.fetch(new Request("https://repoos.org/api/nope"), env)).status).toBe(404);
    expect(send).not.toHaveBeenCalled();
  });
  it("rejects oversized actual bodies even without Content-Length, malformed JSON and nonobjects", async () => {
    expect(
      (await worker.fetch(request({ ...body, problem: "x".repeat(25_000) }), env)).status,
    ).toBe(413);
    expect((await worker.fetch(request(body, { "Content-Length": "25000" }), env)).status).toBe(
      413,
    );
    for (const data of [null, [], "str"])
      expect((await worker.fetch(request(data), env)).status).toBe(400);
    expect((await worker.fetch(new Request(request(), { body: "{" }), env)).status).toBe(400);
    expect(send).not.toHaveBeenCalled();
  });
  it("discards a honeypot submission without emailing", async () => {
    expect((await worker.fetch(request({ ...body, website: "bot.example" }), env)).status).toBe(
      200,
    );
    expect(send).not.toHaveBeenCalled();
  });
  it("fails closed without secrets, sender, or rate limit bindings", async () => {
    for (const key of [
      "REPOOS_RESEND_API_KEY",
      "ENQUIRY_FROM",
      "ENQUIRY_RATE_LIMITER",
      "ENQUIRY_GLOBAL_LIMITER",
    ] as const) {
      expect((await worker.fetch(request(), { ...env, [key]: undefined })).status).toBe(503);
    }
    expect(send).not.toHaveBeenCalled();
  });
  it("enforces source and global throttles and fails closed on limiter errors", async () => {
    vi.mocked(env.ENQUIRY_RATE_LIMITER!.limit).mockResolvedValueOnce({ success: false });
    const response = await worker.fetch(request(), env);
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("60");
    vi.mocked(env.ENQUIRY_GLOBAL_LIMITER!.limit).mockResolvedValueOnce({ success: false });
    expect((await worker.fetch(request(), env)).status).toBe(429);
    vi.mocked(env.ENQUIRY_RATE_LIMITER!.limit).mockRejectedValueOnce(
      new Error("limiter unavailable"),
    );
    expect((await worker.fetch(request(), env)).status).toBe(503);
    expect(send).not.toHaveBeenCalled();
    expect(vi.mocked(env.ENQUIRY_RATE_LIMITER!.limit).mock.calls[0]![0].key).not.toContain(
      "192.0.2.1",
    );
  });
  it.each(["reject", "throw", "missing-id", "invalid-json"])(
    "returns a generic failure for provider %s, never a false success or leaked details",
    async (mode) => {
      if (mode === "throw") send.mockRejectedValueOnce(new Error("secret provider detail"));
      else if (mode === "reject")
        send.mockResolvedValueOnce(new Response("secret provider detail", { status: 401 }));
      else if (mode === "missing-id") send.mockResolvedValueOnce(Response.json({}));
      else send.mockResolvedValueOnce(new Response("not JSON"));
      const response = await worker.fetch(request(), env);
      expect(response.status).toBe(502);
      expect(await response.json()).toEqual({ ok: false });
    },
  );
  it("serves the real client HTML entry for both deep-link forms and forwards other assets", async () => {
    for (const path of ["/for-clients", "/for-clients/"]) {
      await worker.fetch(new Request(`https://repoos.org${path}?theme=gruvbox`), env);
      const forwarded = vi.mocked(env.ASSETS.fetch).mock.lastCall![0];
      expect(new URL(forwarded.url).pathname).toBe("/for-clients/index.html");
      expect(new URL(forwarded.url).search).toBe("?theme=gruvbox");
    }
    await worker.fetch(new Request("https://repoos.org/favicon.svg"), env);
    expect(vi.mocked(env.ASSETS.fetch).mock.lastCall![0].url).toBe(
      "https://repoos.org/favicon.svg",
    );
  });
});
