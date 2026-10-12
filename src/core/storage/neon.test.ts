/**
 * Neon Object Storage provider tests (#0660).
 *
 * The provider is exercised through an injected fake transport, so the full
 * request path (key mapping, signed headers, S3 verb + query, response
 * handling) is asserted without any network access. The credential model and
 * the registry integration (`status()` drives the #0659 local fallback) are
 * covered here too. SigV4 correctness is proven separately against the AWS
 * vectors in `sigv4.test.ts`.
 */
import { describe, expect, it } from "vitest";
import {
  NEON_MAX_OBJECT_BYTES,
  baseDiscriminator,
  neonObjectKey,
  neonStorageProvider,
  parseListKeys,
} from "./neon.js";
import {
  NEON_ACCESS_KEY_ID_ENV,
  NEON_BUCKET_ENV,
  NEON_ENDPOINT_ENV,
  NEON_PREFIX_ENV,
  NEON_REGION_ENV,
  NEON_SECRET_ACCESS_KEY_ENV,
  isNeonCredential,
  readNeonCredentials,
} from "./neon-credentials.js";
import {
  describeStorage,
  getStorageProviderFactory,
  listStorageProviderIds,
  resolveStorageProvider,
} from "./registry.js";
import type { SyncHttpRequest, SyncHttpResponse } from "./sync-http.js";
import type { NeonStorageCredentials } from "./neon-credentials.js";

const CRED: NeonStorageCredentials = {
  endpoint: "https://br-example.storage-c-2.us-east-2.aws.neon.tech",
  region: "us-east-2",
  bucket: "repoos-attachments",
  accessKeyId: "AKIDEXAMPLE",
  secretAccessKey: "wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY",
  prefix: "",
};

const BASE = "/repo/work";

/** A single recorded request/response pair from the fake transport. */
interface Call {
  request: SyncHttpRequest;
  response: SyncHttpResponse;
}

/**
 * A fake transport that records every request and replies from a queue of
 * handlers; the last handler is reused when the queue is exhausted.
 */
function fakeTransport(handlers: Array<(req: SyncHttpRequest) => Partial<SyncHttpResponse>>): {
  calls: Call[];
  transport: (req: SyncHttpRequest) => SyncHttpResponse;
} {
  const calls: Call[] = [];
  return {
    calls,
    transport(request) {
      const handler = handlers[Math.min(calls.length, handlers.length - 1)];
      const response: SyncHttpResponse = {
        status: 200,
        statusText: "OK",
        headers: {},
        body: Buffer.alloc(0),
        ...handler(request),
      };
      calls.push({ request, response });
      return response;
    },
  };
}

function build(handlers: Array<(req: SyncHttpRequest) => Partial<SyncHttpResponse>>) {
  const { calls, transport } = fakeTransport(handlers);
  const provider = neonStorageProvider(BASE, { credentials: CRED, transport });
  return { provider, calls };
}

describe("Neon credential model (#0660)", () => {
  const complete = {
    [NEON_ENDPOINT_ENV]: "https://br-x.neon.tech",
    [NEON_REGION_ENV]: "us-east-2",
    [NEON_BUCKET_ENV]: "bucket",
    [NEON_ACCESS_KEY_ID_ENV]: "key",
    [NEON_SECRET_ACCESS_KEY_ENV]: "secret",
  };

  it("reads a complete credential from the environment", () => {
    const cred = readNeonCredentials(complete);
    expect(isNeonCredential(cred)).toBe(true);
    if (isNeonCredential(cred)) {
      expect(cred.endpoint).toBe("https://br-x.neon.tech");
      expect(cred.region).toBe("us-east-2");
      expect(cred.bucket).toBe("bucket");
      expect(cred.prefix).toBe("");
    }
  });

  it("normalizes a trailing slash off the endpoint and slashes off the prefix", () => {
    const cred = readNeonCredentials({
      ...complete,
      [NEON_ENDPOINT_ENV]: "https://br-x.neon.tech/",
      [NEON_PREFIX_ENV]: "/instances/abc/",
    });
    expect(isNeonCredential(cred)).toBe(true);
    if (isNeonCredential(cred)) {
      expect(cred.endpoint).toBe("https://br-x.neon.tech");
      expect(cred.prefix).toBe("instances/abc");
    }
  });

  it("reports exactly which env vars are missing, without leaking values", () => {
    const cred = readNeonCredentials({ [NEON_REGION_ENV]: "us-east-2" });
    expect(isNeonCredential(cred)).toBe(false);
    if (!isNeonCredential(cred)) {
      expect(cred.problem).toContain(NEON_ENDPOINT_ENV);
      expect(cred.problem).toContain(NEON_BUCKET_ENV);
      expect(cred.problem).toContain(NEON_ACCESS_KEY_ID_ENV);
      expect(cred.problem).toContain(NEON_SECRET_ACCESS_KEY_ENV);
      expect(cred.problem).toContain("local storage");
    }
  });

  it("rejects a non-https or unparseable endpoint", () => {
    const http = readNeonCredentials({ ...complete, [NEON_ENDPOINT_ENV]: "http://br-x.neon.tech" });
    expect(isNeonCredential(http)).toBe(false);
    if (!isNeonCredential(http)) expect(http.problem).toMatch(/https/);

    const bad = readNeonCredentials({ ...complete, [NEON_ENDPOINT_ENV]: "not a url" });
    expect(isNeonCredential(bad)).toBe(false);
  });
});

describe("Neon object-key mapping", () => {
  it("maps namespace/name under the prefix and base discriminator", () => {
    const key = neonObjectKey({ prefix: "" }, BASE, "0123", "screenshot-1.png");
    expect(key).toBe(`${baseDiscriminator(BASE)}/0123/screenshot-1.png`);
  });

  it("puts a configured prefix first and keeps bases apart", () => {
    const work = neonObjectKey({ prefix: "inst1" }, "/repo/work", "0123", "a.png");
    const inputs = neonObjectKey({ prefix: "inst1" }, "/repo/inputs", "0123", "a.png");
    expect(work).toBe(`inst1/${baseDiscriminator("/repo/work")}/0123/a.png`);
    expect(inputs).toBe(`inst1/${baseDiscriminator("/repo/inputs")}/0123/a.png`);
    expect(work).not.toBe(inputs);
  });

  it("refuses unsafe names and namespaces", () => {
    expect(neonObjectKey({ prefix: "" }, BASE, "..", "a.png")).toBeNull();
    expect(neonObjectKey({ prefix: "" }, BASE, "0123", "../a.png")).toBeNull();
    expect(neonObjectKey({ prefix: "" }, BASE, "0123", "a\\b")).toBeNull();
  });

  it("parses ListObjectsV2 keys, decoding XML entities", () => {
    const xml =
      "<ListBucketResult><IsTruncated>false</IsTruncated>" +
      "<Contents><Key>p/0123/a.png</Key></Contents>" +
      "<Contents><Key>p/0123/b&amp;c.png</Key></Contents></ListBucketResult>";
    expect(parseListKeys(xml)).toEqual(["p/0123/a.png", "p/0123/b&c.png"]);
  });
});

describe("Neon provider implements the StorageProvider contract", () => {
  it("reports available with complete credentials, unavailable without", () => {
    const ok = neonStorageProvider(BASE, { credentials: CRED, transport: () => ({}) as never });
    expect(ok.status?.()).toEqual({ available: true });

    const none = neonStorageProvider(BASE, {
      credentials: { problem: "Neon Object Storage isn't configured yet." },
      transport: () => ({}) as never,
    });
    expect(none.status?.()).toMatchObject({ available: false });
  });

  it("PUT stores bytes at the mapped key with a signed request", () => {
    const { provider, calls } = build([() => ({ status: 200 })]);
    const result = provider.put("0123", "screenshot-1.png", Buffer.from("PNGDATA"));
    expect(result).toEqual({});
    expect(calls).toHaveLength(1);
    const { request } = calls[0];
    expect(request.method).toBe("PUT");
    expect(request.url).toBe(
      `${CRED.endpoint}/${CRED.bucket}/${baseDiscriminator(BASE)}/0123/screenshot-1.png`,
    );
    expect(request.headers["authorization"]).toContain("AWS4-HMAC-SHA256");
    expect(request.headers["content-type"]).toBe("application/octet-stream");
    expect(request.body?.toString()).toBe("PNGDATA");
  });

  it("PUT returns an error the caller can surface, never throws", () => {
    const { provider } = build([() => ({ status: 500, statusText: "Server Error" })]);
    const result = provider.put("0123", "a.png", Buffer.from("x"));
    expect(result).toMatchObject({ error: expect.stringContaining("HTTP 500") });
  });

  it("PUT refuses an object over the verified 5 GiB Neon ceiling", () => {
    const { provider, calls } = build([() => ({ status: 200 })]);
    // A Buffer header at the limit without allocating 5 GiB.
    const big = Buffer.alloc(1);
    Object.defineProperty(big, "length", { value: NEON_MAX_OBJECT_BYTES + 1 });
    const result = provider.put("0123", "huge.bin", big);
    expect(result).toMatchObject({ error: expect.stringContaining("5 GiB") });
    expect(calls).toHaveLength(0);
  });

  it("GET returns bytes on 200 and null on 404 (never throws)", () => {
    const ok = build([() => ({ status: 200, body: Buffer.from("BYTES") })]);
    expect(ok.provider.get("0123", "a.png")?.toString()).toBe("BYTES");

    const miss = build([() => ({ status: 404 })]);
    expect(miss.provider.get("0123", "a.png")).toBeNull();

    const boom = build([
      () => {
        throw new Error("network down");
      },
    ]);
    expect(boom.provider.get("0123", "a.png")).toBeNull();
  });

  it("get/list return null/[] and never throw when unconfigured", () => {
    const provider = neonStorageProvider(BASE, {
      credentials: { problem: "not configured" },
      transport: () => ({}) as never,
    });
    expect(provider.get("0123", "a.png")).toBeNull();
    expect(provider.list("0123")).toEqual([]);
    expect(provider.remove("0123", "a.png")).toBe(false);
    expect(provider.put("0123", "a.png", Buffer.from("x"))).toMatchObject({
      error: "not configured",
    });
  });

  it("LIST pages ListObjectsV2 and strips the namespace prefix", () => {
    const prefix = `${baseDiscriminator(BASE)}/0123`;
    const page1 =
      "<ListBucketResult><IsTruncated>true</IsTruncated>" +
      `<Contents><Key>${prefix}/a.png</Key></Contents>` +
      "<NextContinuationToken>TOK</NextContinuationToken></ListBucketResult>";
    const page2 =
      "<ListBucketResult><IsTruncated>false</IsTruncated>" +
      `<Contents><Key>${prefix}/b.png</Key></Contents></ListBucketResult>`;
    const { provider, calls } = build([
      () => ({ status: 200, body: Buffer.from(page1) }),
      () => ({ status: 200, body: Buffer.from(page2) }),
    ]);
    expect(provider.list("0123").sort()).toEqual(["a.png", "b.png"]);
    expect(calls).toHaveLength(2);
    expect(calls[0].request.url).toContain(`/${CRED.bucket}?`);
    expect(calls[0].request.url).not.toContain(`${CRED.bucket}/${CRED.bucket}`);
    expect(calls[0].request.url).toContain("list-type=2");
    expect(calls[0].request.url).toContain(`prefix=${encodeURIComponent(`${prefix}/`)}`);
    expect(calls[1].request.url).toContain("continuation-token=TOK");
  });

  it("REMOVE deletes one object and reports success on 204", () => {
    const { provider, calls } = build([() => ({ status: 204 })]);
    expect(provider.remove("0123", "a.png")).toBe(true);
    expect(calls[0].request.method).toBe("DELETE");
  });

  it("removeNamespace lists then batch-deletes, chunking at 1,000 keys", () => {
    const prefix = `${baseDiscriminator(BASE)}/0123`;
    const keys = Array.from(
      { length: 1500 },
      (_, i) => `<Contents><Key>${prefix}/f${i}.png</Key></Contents>`,
    ).join("");
    const listXml = `<ListBucketResult><IsTruncated>false</IsTruncated>${keys}</ListBucketResult>`;
    const { provider, calls } = build([
      (req) => {
        if (req.method === "GET") return { status: 200, body: Buffer.from(listXml) };
        return { status: 200, body: Buffer.from("<DeleteResult/>") };
      },
    ]);
    provider.removeNamespace("0123");
    const deletes = calls.filter((c) => c.request.method === "POST");
    expect(deletes).toHaveLength(2);
    // Both batches carry a content-md5 (required by DeleteObjects).
    expect(deletes[0].request.headers["content-md5"]).toBeTruthy();
    // The bucket appears exactly once in the path (no bucket/bucket).
    expect(deletes[0].request.url).toContain(`/${CRED.bucket}?delete`);
    expect(deletes[0].request.url).not.toContain(`${CRED.bucket}/${CRED.bucket}`);
    // 1000 + 500 objects across the two calls.
    const count = (buf?: Buffer) => ((buf?.toString() ?? "").match(/<Object>/g) ?? []).length;
    expect(count(deletes[0].request.body) + count(deletes[1].request.body)).toBe(1500);
  });

  it("SIZE uses a signed HEAD and reads content-length", () => {
    const { provider, calls } = build([
      () => ({ status: 200, headers: { "content-length": "1234" } }),
    ]);
    expect(provider.size?.("0123", "a.png")).toBe(1234);
    expect(calls[0].request.method).toBe("HEAD");
  });

  it("omits localPath — a remote provider has no file on this machine", () => {
    const { provider } = build([() => ({ status: 200 })]);
    expect(provider.localPath).toBeUndefined();
  });
});

describe("Neon registers and integrates with the #0659 fallback", () => {
  it("is a registered provider id", () => {
    expect(getStorageProviderFactory("neon")).not.toBeNull();
    expect(listStorageProviderIds()).toContain("neon");
  });

  it("falls back to local when Neon's credentials are absent", () => {
    // The registered factory reads the real environment; strip the Neon vars so
    // the test is deterministic regardless of the machine's `.env`.
    const saved: Record<string, string | undefined> = {};
    for (const name of Object.keys(process.env)) {
      if (name.startsWith("REPOOS_NEON_STORAGE_")) {
        saved[name] = process.env[name];
        delete process.env[name];
      }
    }
    try {
      const status = describeStorage("neon", "/repo/work");
      expect(status).toMatchObject({ configured: "neon", effective: "local", available: false });
      expect(status.reason).toContain("isn't configured yet");
    } finally {
      for (const [k, v] of Object.entries(saved)) process.env[k] = v;
    }
  });

  it("resolves Neon as effective when its credentials are complete", () => {
    const saved = { ...process.env };
    Object.assign(process.env, {
      [NEON_ENDPOINT_ENV]: "https://br-x.neon.tech",
      [NEON_REGION_ENV]: "us-east-2",
      [NEON_BUCKET_ENV]: "bucket",
      [NEON_ACCESS_KEY_ID_ENV]: "key",
      [NEON_SECRET_ACCESS_KEY_ENV]: "secret",
    });
    try {
      const { effective, available, provider } = resolveStorageProvider("/repo/work", "neon");
      expect(available).toBe(true);
      expect(effective).toBe("neon");
      expect(provider.id).toBe("neon");
    } finally {
      for (const name of [
        NEON_ENDPOINT_ENV,
        NEON_REGION_ENV,
        NEON_BUCKET_ENV,
        NEON_ACCESS_KEY_ID_ENV,
        NEON_SECRET_ACCESS_KEY_ENV,
      ]) {
        delete process.env[name];
        if (saved[name] !== undefined) process.env[name] = saved[name];
      }
    }
  });
});
