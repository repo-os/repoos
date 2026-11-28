import { describe, expect, it } from "vitest";
import worker, { type LandingEnv } from "../../../landing/worker.js";

function envFor(objects: Record<string, string>): LandingEnv {
  return {
    ASSETS: { fetch: async () => new Response("asset") },
    HUB_DOWNLOADS: {
      get: async (key) => {
        const value = objects[key];
        return value === undefined ? null : { body: new Response(value).body, size: value.length };
      },
    },
  };
}

describe("Hub download Worker routes", () => {
  it("serves only the APK and metadata keys with their download headers", async () => {
    const env = envFor({
      "repoos-hub.apk": "apk-bytes",
      "version.json": '{"versionName":"1.2.3"}',
    });
    const apk = await worker.fetch(new Request("https://repoos.org/downloads/repoos-hub.apk"), env);
    expect(apk.status).toBe(200);
    expect(apk.headers.get("Content-Type")).toBe("application/vnd.android.package-archive");
    expect(apk.headers.get("Content-Disposition")).toContain("attachment");
    expect(await apk.text()).toBe("apk-bytes");
    const metadata = await worker.fetch(
      new Request("https://repoos.org/downloads/version.json"),
      env,
    );
    expect(metadata.headers.get("Content-Type")).toContain("application/json");
    expect(metadata.headers.get("Cache-Control")).toContain("max-age=60");
    expect(await metadata.json()).toEqual({ versionName: "1.2.3" });
  });

  it("returns 404 for absent objects and unrelated download paths", async () => {
    const env = envFor({});
    expect(
      (await worker.fetch(new Request("https://repoos.org/downloads/version.json"), env)).status,
    ).toBe(404);
    expect(
      (await worker.fetch(new Request("https://repoos.org/downloads/other"), env)).status,
    ).toBe(404);
  });

  it("allows HEAD and rejects writes", async () => {
    const env = envFor({ "repoos-hub.apk": "apk" });
    const head = await worker.fetch(
      new Request("https://repoos.org/downloads/repoos-hub.apk", { method: "HEAD" }),
      env,
    );
    expect(head.status).toBe(200);
    expect(await head.text()).toBe("");
    expect(
      (
        await worker.fetch(
          new Request("https://repoos.org/downloads/repoos-hub.apk", { method: "PUT" }),
          env,
        )
      ).status,
    ).toBe(405);
  });
});
