import { describe, expect, it } from "vitest";
import { createApp } from "../src/http.js";
import { InMemoryProvisioningStore } from "../src/memory-store.js";
import type { ManagerConfig } from "../src/config.js";
import { FakeTelegramManagerClient, linkMessage, managedBotUpdate } from "./fakes.js";

function makeConfig(): ManagerConfig {
  return {
    databaseUrl: "unused",
    managerBotToken: "999:manager-token",
    managerBotUsername: "RepoOSManagerBot",
    webhookSecret: "whsec-abc",
    instanceAuthKeys: ["instance-key-xyz"],
    encryptionKey: "0".repeat(64),
    telegramApiBase: "https://api.telegram.org",
    telegramApiTimeoutMs: 30_000,
  };
}

function makeApp() {
  const store = new InMemoryProvisioningStore();
  const telegram = new FakeTelegramManagerClient();
  const config = makeConfig();
  const app = createApp({ config, store, telegram });
  return { app, store, telegram, config };
}

async function json(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

describe("HTTP contract (#0531 client boundary)", () => {
  it("requires the instance auth key on provisioning routes", async () => {
    const { app } = makeApp();
    const res = await app.request("/v1/provisioning/requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ repository: "r", instance: { id: "i" }, requestedBy: "a@b.test" }),
    });
    expect(res.status).toBe(401);
  });

  it("rejects a wrong instance auth key (impersonation attempt)", async () => {
    const { app } = makeApp();
    const res = await app.request("/v1/provisioning/requests", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer wrong-key" },
      body: JSON.stringify({ repository: "r", instance: { id: "i" }, requestedBy: "a@b.test" }),
    });
    expect(res.status).toBe(401);
  });

  it("begins, matches status, and redeems through the full HTTP surface", async () => {
    const { app, telegram } = makeApp();
    const auth = { Authorization: "Bearer instance-key-xyz", "Content-Type": "application/json" };

    const beginRes = await app.request("/v1/provisioning/requests", {
      method: "POST",
      headers: auth,
      body: JSON.stringify({
        repository: "acme/widgets",
        instance: { id: "inst-a" },
        requestedBy: "admin@acme.test",
        botNameHint: "Acme Bot",
      }),
    });
    expect(beginRes.status).toBe(200);
    const begun = await json(beginRes);
    expect(typeof begun.id).toBe("string");
    expect(String(begun.deep_link)).toContain("t.me/newbot/RepoOSManagerBot");
    expect(typeof begun.link_code).toBe("string");

    const webhook = (body: Record<string, unknown>) =>
      app.request("/v1/telegram/webhook", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Telegram-Bot-Api-Secret-Token": "whsec-abc",
        },
        body: JSON.stringify(body),
      });
    await webhook(linkMessage(1, 42, String(begun.link_code)));
    await webhook(
      managedBotUpdate(2, 42, { id: 555, username: "acme_bot", firstName: "Acme Bot" }),
    );
    telegram.tokensByBotId.set(555, "secret-project-token");

    const statusRes = await app.request(`/v1/provisioning/requests/${begun.id}`, { headers: auth });
    const statusBody = await json(statusRes);
    expect(statusBody.state).toBe("ready");
    expect((statusBody.bot as Record<string, unknown>).id).toBe(555);

    const redeemRes = await app.request(`/v1/provisioning/requests/${begun.id}/redeem`, {
      method: "POST",
      headers: auth,
    });
    const redeemBody = await json(redeemRes);
    expect(redeemRes.status).toBe(200);
    expect(redeemBody.token).toBe("secret-project-token");
    // Never echoes anything credential-shaped besides the one field.
    expect(JSON.stringify(redeemBody)).not.toContain("manager-token");
  });

  it("rejects a webhook call with the wrong secret token", async () => {
    const { app } = makeApp();
    const res = await app.request("/v1/telegram/webhook", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Telegram-Bot-Api-Secret-Token": "nope" },
      body: JSON.stringify({ update_id: 1 }),
    });
    expect(res.status).toBe(403);
  });

  it("acknowledges a duplicate webhook update without processing it twice", async () => {
    const { app, store } = makeApp();
    const auth = { Authorization: "Bearer instance-key-xyz", "Content-Type": "application/json" };
    const beginRes = await app.request("/v1/provisioning/requests", {
      method: "POST",
      headers: auth,
      body: JSON.stringify({
        repository: "r",
        instance: { id: "inst-a" },
        requestedBy: "a@b.test",
      }),
    });
    const begun = await json(beginRes);
    const update = linkMessage(1, 42, String(begun.link_code));

    const send = () =>
      app.request("/v1/telegram/webhook", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Telegram-Bot-Api-Secret-Token": "whsec-abc",
        },
        body: JSON.stringify(update),
      });
    const first = await send();
    const second = await send();
    expect(first.status).toBe(200);
    expect(second.status).toBe(200); // Telegram always sees 200, even for a dup

    const boundEvents = store.auditLog.filter((e) => e.event === "link_bound");
    expect(boundEvents).toHaveLength(1);
  });

  it("returns 404 when a different instance key probes another instance's request", async () => {
    const store = new InMemoryProvisioningStore();
    const telegram = new FakeTelegramManagerClient();
    const config = {
      ...makeConfig(),
      instanceAuthKeys: ["key-for-inst-a", "key-for-inst-b"],
    };
    const app = createApp({ config, store, telegram });
    const beginRes = await app.request("/v1/provisioning/requests", {
      method: "POST",
      headers: {
        Authorization: "Bearer key-for-inst-a",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        repository: "acme/widgets",
        instance: { id: "inst-a" },
        requestedBy: "admin@acme.test",
      }),
    });
    const begun = await json(beginRes);
    const probe = await app.request(`/v1/provisioning/requests/${begun.id}`, {
      headers: { Authorization: "Bearer key-for-inst-b" },
    });
    expect(probe.status).toBe(404);
  });

  it("rotates a redeemed project bot token for the owning instance", async () => {
    const { app, telegram } = makeApp();
    const auth = { Authorization: "Bearer instance-key-xyz", "Content-Type": "application/json" };
    const beginRes = await app.request("/v1/provisioning/requests", {
      method: "POST",
      headers: auth,
      body: JSON.stringify({
        repository: "r",
        instance: { id: "inst-a" },
        requestedBy: "a@b.test",
      }),
    });
    const begun = await json(beginRes);
    const webhook = (body: Record<string, unknown>) =>
      app.request("/v1/telegram/webhook", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Telegram-Bot-Api-Secret-Token": "whsec-abc",
        },
        body: JSON.stringify(body),
      });
    await webhook(linkMessage(1, 42, String(begun.link_code)));
    await webhook(
      managedBotUpdate(2, 42, { id: 555, username: "acme_bot", firstName: "Acme Bot" }),
    );
    telegram.tokensByBotId.set(555, "secret-project-token");
    await app.request(`/v1/provisioning/requests/${begun.id}/redeem`, {
      method: "POST",
      headers: auth,
    });
    const rotateRes = await app.request(`/v1/provisioning/requests/${begun.id}/rotate-token`, {
      method: "POST",
      headers: auth,
    });
    expect(rotateRes.status).toBe(200);
    const rotated = await json(rotateRes);
    expect(rotated.token).toBe("secret-project-token-rotated");
  });

  it("forgets dedup when handling fails so Telegram can redeliver", async () => {
    const store = new InMemoryProvisioningStore();
    const telegram = new FakeTelegramManagerClient();
    const app = createApp({ config: makeConfig(), store, telegram });
    const auth = { Authorization: "Bearer instance-key-xyz", "Content-Type": "application/json" };
    const beginRes = await app.request("/v1/provisioning/requests", {
      method: "POST",
      headers: auth,
      body: JSON.stringify({
        repository: "r",
        instance: { id: "inst-a" },
        requestedBy: "a@b.test",
      }),
    });
    const begun = await json(beginRes);
    const update = linkMessage(1, 42, String(begun.link_code));
    const originalBind = store.bindLinkCode.bind(store);
    let failOnce = true;
    store.bindLinkCode = async (...args) => {
      if (failOnce) {
        failOnce = false;
        throw new Error("transient postgres blip");
      }
      return originalBind(...args);
    };
    const send = () =>
      app.request("/v1/telegram/webhook", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Telegram-Bot-Api-Secret-Token": "whsec-abc",
        },
        body: JSON.stringify(update),
      });
    const failed = await send();
    expect(failed.status).toBe(500);
    const recovered = await send();
    expect(recovered.status).toBe(200);
    const statusRes = await app.request(`/v1/provisioning/requests/${begun.id}`, { headers: auth });
    expect((await json(statusRes)).state).toBe("awaiting_bot_creation");
  });

  it("returns 404 for an unknown request id and 409 for redeeming before ready", async () => {
    const { app } = makeApp();
    const auth = { Authorization: "Bearer instance-key-xyz", "Content-Type": "application/json" };
    const missing = await app.request("/v1/provisioning/requests/does-not-exist", {
      headers: auth,
    });
    expect(missing.status).toBe(404);

    const beginRes = await app.request("/v1/provisioning/requests", {
      method: "POST",
      headers: auth,
      body: JSON.stringify({
        repository: "r",
        instance: { id: "inst-a" },
        requestedBy: "a@b.test",
      }),
    });
    const begun = await json(beginRes);
    const tooSoon = await app.request(`/v1/provisioning/requests/${begun.id}/redeem`, {
      method: "POST",
      headers: auth,
    });
    expect(tooSoon.status).toBe(409);
  });
});
