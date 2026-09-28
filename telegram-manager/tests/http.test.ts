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

  it("revokes a managed bot over HTTP for the #0539 disconnect caller", async () => {
    const { app, telegram, store } = makeApp();
    const auth = { Authorization: "Bearer instance-key-xyz", "Content-Type": "application/json" };
    const begun = await json(
      await app.request("/v1/provisioning/requests", {
        method: "POST",
        headers: auth,
        body: JSON.stringify({
          repository: "acme/widgets",
          instance: { id: "inst-a" },
          requestedBy: "admin@acme.test",
        }),
      }),
    );
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

    // Exactly the body/shape `HttpProvisioningClient.revokeBot` sends (main,
    // #0539): the route is keyed by bot id, not request id.
    const revokeRes = await app.request("/v1/provisioning/bots/555/revoke", {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ repository: "acme/widgets", instance: { id: "inst-a" } }),
    });
    expect(revokeRes.status).toBe(200);
    expect(await json(revokeRes)).toEqual({ confirmed: true });
    expect(telegram.replaceTokenCallCount).toBe(1);

    // The dropped credential can no longer be replayed, and mismatches are
    // the same impersonation-safe 404 the per-request routes use.
    const lateReplay = await app.request(`/v1/provisioning/requests/${begun.id}/redeem`, {
      method: "POST",
      headers: auth,
    });
    expect(lateReplay.status).toBe(200);
    expect(await json(lateReplay)).toEqual({});
    const alien = await app.request("/v1/provisioning/bots/555/revoke", {
      method: "POST",
      headers: { Authorization: "Bearer another-key" },
      body: JSON.stringify({ repository: "acme/widgets", instance: { id: "inst-a" } }),
    });
    expect(alien.status).toBe(401);
    const unknownBot = await app.request("/v1/provisioning/bots/999/revoke", {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ repository: "acme/widgets", instance: { id: "inst-a" } }),
    });
    expect(unknownBot.status).toBe(404);
    expect((await json(unknownBot)).error).toBe("no such managed bot");

    const events = store.auditLog.map((e) => e.event);
    expect(events).toContain("bot_revoked");
  });

  it("validates the revoke body shape", async () => {
    const { app } = makeApp();
    const auth = { Authorization: "Bearer instance-key-xyz", "Content-Type": "application/json" };
    const badBotId = await app.request("/v1/provisioning/bots/not-a-number/revoke", {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ repository: "r", instance: { id: "i" } }),
    });
    expect(badBotId.status).toBe(400);
    const missingRepository = await app.request("/v1/provisioning/bots/5/revoke", {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ instance: { id: "i" } }),
    });
    expect(missingRepository.status).toBe(400);
    const missingInstance = await app.request("/v1/provisioning/bots/5/revoke", {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ repository: "r" }),
    });
    expect(missingRepository.status).toBe(400);
  });

  it("answers a duplicate begin for the same repository/instance with 409, not 500", async () => {
    const { app, store } = makeApp();
    const auth = { Authorization: "Bearer instance-key-xyz", "Content-Type": "application/json" };
    const body = {
      repository: "acme/widgets",
      instance: { id: "inst-a" },
      requestedBy: "admin@acme.test",
    };
    const first = await app.request("/v1/provisioning/requests", {
      method: "POST",
      headers: auth,
      body: JSON.stringify(body),
    });
    expect(first.status).toBe(200);
    // Regression: previously the per-(repository, instance) active-request
    // unique index threw an unhandled Postgres unique violation (opaque 500).
    // Now the service maps it to a clean conflict.
    const second = await app.request("/v1/provisioning/requests", {
      method: "POST",
      headers: auth,
      body: JSON.stringify(body),
    });
    expect(second.status).toBe(409);
    const err = await json(second);
    expect(String(err.error)).toContain("already have a live provisioning request");

    // A different repository on the same (shared) auth key is not blocked.
    const other = await app.request("/v1/provisioning/requests", {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ ...body, repository: "beta/gizmos" }),
    });
    expect(other.status).toBe(200);
    expect(store.auditLog.map((e) => e.event)).toContain("begin_rejected_active_exists");
  });
});
