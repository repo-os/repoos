/**
 * Runs the generated service worker against fake `caches` and `fetch`.
 * Regression guard for docs going stale in the UI: the worker used to serve
 * every non-API GET cache-first, so an edited doc kept its first-fetched
 * version until the next UI build.
 */
import { describe, expect, it } from "vitest";
import { serviceWorkerSource } from "../src/lib/sw-source";

interface FakeResponse {
  ok: boolean;
  status: number;
  body: string;
  clone(): FakeResponse;
}
type Req = string | { url: string };

function response(body: string, status = 200): FakeResponse {
  const r: FakeResponse = { ok: status < 400, status, body, clone: () => r };
  return r;
}

function loadWorker(precache: string[] = ["/", "/assets/index.js"]) {
  const listeners: Record<string, (e: unknown) => void> = {};
  const store = new Map<string, FakeResponse>();
  const keyOf = (r: Req) =>
    typeof r === "string" ? r : new URL(r.url).pathname + new URL(r.url).search;
  const network = { calls: 0, down: false, next: (_path: string): FakeResponse => response("net") };
  const cache = {
    match: async (r: Req) => store.get(keyOf(r)),
    put: async (r: Req, res: FakeResponse) => void store.set(keyOf(r), res),
    addAll: async (urls: string[]) => urls.forEach((u) => store.set(u, response(`pre:${u}`))),
  };
  const cachesApi = {
    open: async () => cache,
    match: async (r: Req) => store.get(keyOf(r)),
    keys: async () => ["current"],
    delete: async () => true,
  };
  const fakeFetch = async (r: { url: string }) => {
    network.calls++;
    if (network.down) throw new TypeError("offline");
    return network.next(keyOf(r));
  };
  const self = {
    location: { origin: "http://repoos.test" },
    addEventListener: (type: string, fn: (e: unknown) => void) => (listeners[type] = fn),
    skipWaiting: async () => {},
    clients: { claim: async () => {} },
  };
  const FakeResponseCtor = { error: () => response("network error", 599) };
  new Function("self", "caches", "fetch", "Response", serviceWorkerSource(precache, "test-cache"))(
    self,
    cachesApi,
    fakeFetch,
    FakeResponseCtor,
  );

  const tick = () => new Promise((r) => setTimeout(r, 0));
  async function request(
    path: string,
    mode = "cors",
    method = "GET",
  ): Promise<FakeResponse | null> {
    let responded: Promise<FakeResponse> | null = null;
    listeners.fetch({
      request: { url: `http://repoos.test${path}`, method, mode },
      respondWith: (p: Promise<FakeResponse>) => (responded = Promise.resolve(p)),
    });
    if (!responded) return null;
    const res = await responded;
    await tick();
    return res;
  }
  return { store, network, request };
}

describe("service worker source", () => {
  it("does not intercept repo docs, the API, or sw.js", async () => {
    const w = loadWorker();
    for (const path of [
      "/docs/architecture.md",
      "/AGENTS.md",
      "/README.md",
      "/api/tasks",
      "/sw.js",
      "/work/.attachments/a.png",
    ]) {
      expect(await w.request(path), path).toBeNull();
    }
    expect(w.network.calls).toBe(0);
  });

  it("serves content-hashed /assets cache-first and stores only successful responses", async () => {
    const w = loadWorker();
    w.network.next = () => response("chunk v1");
    expect((await w.request("/assets/chunk-abc.js"))?.body).toBe("chunk v1");
    w.network.next = () => response("should not be fetched");
    expect((await w.request("/assets/chunk-abc.js"))?.body).toBe("chunk v1");
    expect(w.network.calls).toBe(1);

    w.network.next = () => response("missing", 404);
    expect((await w.request("/assets/gone.js"))?.status).toBe(404);
    expect(w.store.has("/assets/gone.js")).toBe(false);
  });

  it("goes to the network first for navigations, falling back to the cached shell offline", async () => {
    const w = loadWorker();
    w.store.set("/", response("cached shell"));
    w.network.next = () => response("fresh shell");
    expect((await w.request("/work", "navigate"))?.body).toBe("fresh shell");
    expect(w.store.get("/")?.body).toBe("fresh shell");

    w.network.down = true;
    expect((await w.request("/context", "navigate"))?.body).toBe("fresh shell");
  });

  it("does not replace the cached shell with a failed navigation response", async () => {
    const w = loadWorker();
    w.store.set("/", response("good shell"));
    w.network.next = () => response("server error", 500);
    expect((await w.request("/", "navigate"))?.status).toBe(500);
    expect(w.store.get("/")?.body).toBe("good shell");
  });

  it("ignores non-GET requests", async () => {
    const w = loadWorker();
    expect(await w.request("/assets/chunk-abc.js", "cors", "POST")).toBeNull();
  });

  it("embeds the cache name and precache list", () => {
    const src = serviceWorkerSource(["/", "/assets/a.js"], "repoos-shell-xyz");
    expect(src).toContain('const CACHE = "repoos-shell-xyz";');
    expect(src).toContain('const PRECACHE = ["/","/assets/a.js"];');
  });
});
