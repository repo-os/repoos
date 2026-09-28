import { describe, expect, it } from "vitest";
import { InMemoryProvisioningStore } from "../src/memory-store.js";
import { ProvisioningService, REDEEM_GRACE_MS } from "../src/service.js";
import type { ManagerConfig } from "../src/config.js";
import { FakeTelegramManagerClient, linkMessage, managedBotUpdate } from "./fakes.js";

function makeConfig(): ManagerConfig {
  return {
    databaseUrl: "unused",
    managerBotToken: "999:manager-token",
    managerBotUsername: "RepoOSManagerBot",
    webhookSecret: "whsec",
    instanceAuthKey: "instance-key",
    encryptionKey: "0".repeat(64), // 32 bytes hex
    telegramApiBase: "https://api.telegram.org",
  };
}

function setup(nowRef: { value: Date }) {
  const store = new InMemoryProvisioningStore();
  const telegram = new FakeTelegramManagerClient();
  const config = makeConfig();
  const service = new ProvisioningService(
    store,
    telegram,
    config,
    config.managerBotUsername,
    () => nowRef.value,
  );
  return { store, telegram, service };
}

async function driveToReady(
  service: ProvisioningService,
  telegram: FakeTelegramManagerClient,
  opts: {
    instanceId: string;
    repository: string;
    adminEmail: string;
    telegramUserId: number;
    botId: number;
  },
) {
  const begin = await service.begin(opts.instanceId, {
    repository: opts.repository,
    instance: { id: opts.instanceId },
    requestedBy: opts.adminEmail,
  });
  await service.handleUpdate(linkMessage(500, opts.telegramUserId, begin.linkCode));
  await service.handleUpdate(
    managedBotUpdate(1, opts.telegramUserId, {
      id: opts.botId,
      username: "project_bot",
      firstName: "Project Bot",
    }),
  );
  telegram.tokensByBotId.set(opts.botId, `token-for-${opts.botId}`);
  return begin;
}

describe("provisioning state machine", () => {
  it("goes pending -> awaiting_bot_creation -> ready -> redeemed end to end", async () => {
    const nowRef = { value: new Date("2026-09-28T00:00:00Z") };
    const { service, telegram } = setup(nowRef);
    const begin = await driveToReady(service, telegram, {
      instanceId: "inst-a",
      repository: "acme/widgets",
      adminEmail: "admin@acme.test",
      telegramUserId: 42,
      botId: 777,
    });

    const status = await service.getStatus(begin.id);
    expect(status.state).toBe("ready");
    expect(status.bot?.id).toBe(777);

    const redeemed = await service.redeem(begin.id);
    expect(redeemed.token).toBe("token-for-777");
    expect(redeemed.bot?.username).toBe("project_bot");

    const afterStatus = await service.getStatus(begin.id);
    expect(afterStatus.state).toBe("redeemed");
  });

  it("replays the same token within the grace window, then refuses a second delivery", async () => {
    const nowRef = { value: new Date("2026-09-28T00:00:00Z") };
    const { service, telegram } = setup(nowRef);
    const begin = await driveToReady(service, telegram, {
      instanceId: "inst-a",
      repository: "acme/widgets",
      adminEmail: "admin@acme.test",
      telegramUserId: 42,
      botId: 777,
    });
    const first = await service.redeem(begin.id);
    expect(first.token).toBe("token-for-777");
    expect(telegram.getTokenCallCount).toBe(1);

    // Replay within grace window: same token, no second Telegram call.
    const replay = await service.redeem(begin.id);
    expect(replay.token).toBe("token-for-777");
    expect(telegram.getTokenCallCount).toBe(1);

    // Past the grace window: no credential, no throw (client reads a
    // tokenless 200 as ManagedRedemptionFollowUpError — see #0531 contract).
    nowRef.value = new Date(nowRef.value.getTime() + REDEEM_GRACE_MS + 1000);
    const gone = await service.redeem(begin.id);
    expect(gone.token).toBeUndefined();
  });

  it("never lets two repositories cross-claim each other's credential", async () => {
    const nowRef = { value: new Date("2026-09-28T00:00:00Z") };
    const { service, telegram } = setup(nowRef);
    const a = await driveToReady(service, telegram, {
      instanceId: "inst-a",
      repository: "acme/widgets",
      adminEmail: "admin@acme.test",
      telegramUserId: 42,
      botId: 111,
    });
    const b = await driveToReady(service, telegram, {
      instanceId: "inst-b",
      repository: "beta/gizmos",
      adminEmail: "admin@beta.test",
      telegramUserId: 43,
      botId: 222,
    });

    const redeemedA = await service.redeem(a.id);
    const redeemedB = await service.redeem(b.id);
    expect(redeemedA.token).toBe("token-for-111");
    expect(redeemedB.token).toBe("token-for-222");
    expect(redeemedA.token).not.toBe(redeemedB.token);

    // b's request id never yields a's credential, even hypothetically:
    // redeeming a's id again only ever replays a's own token.
    const replayA = await service.redeem(a.id);
    expect(replayA.token).toBe("token-for-111");
  });

  it("rejects an expired request instead of letting it be redeemed", async () => {
    const nowRef = { value: new Date("2026-09-28T00:00:00Z") };
    const { service, telegram } = setup(nowRef);
    const begin = await driveToReady(service, telegram, {
      instanceId: "inst-a",
      repository: "acme/widgets",
      adminEmail: "admin@acme.test",
      telegramUserId: 42,
      botId: 777,
    });
    nowRef.value = new Date(nowRef.value.getTime() + 60 * 60 * 1000); // +1h, past the 15m TTL

    const status = await service.getStatus(begin.id);
    expect(status.state).toBe("expired");

    await expect(service.redeem(begin.id)).rejects.toMatchObject({ kind: "gone" });
  });

  it("refuses a stale or already-used link code, and never binds without one", async () => {
    const nowRef = { value: new Date("2026-09-28T00:00:00Z") };
    const { service, store } = setup(nowRef);
    const begin = await service.begin("inst-a", {
      repository: "acme/widgets",
      instance: { id: "inst-a" },
      requestedBy: "admin@acme.test",
    });

    // Wrong code: no state change.
    await service.handleUpdate(linkMessage(500, 42, "WRONGCODE"));
    let status = await service.getStatus(begin.id);
    expect(status.state).toBe("pending");

    // Correct code binds it once...
    await service.handleUpdate(linkMessage(500, 42, begin.linkCode));

    // ...and a second attempt with the same code (now cleared) fails, even
    // from the same Telegram user.
    await service.handleUpdate(linkMessage(500, 99, begin.linkCode));
    const auditEvents =
      store instanceof InMemoryProvisioningStore ? store.auditLog.map((e) => e.event) : [];
    expect(auditEvents).toContain("link_rejected");
  });

  it("drops a managed_bot event that never sent /link first (no request matched)", async () => {
    const nowRef = { value: new Date("2026-09-28T00:00:00Z") };
    const { service, store } = setup(nowRef);
    await service.begin("inst-a", {
      repository: "acme/widgets",
      instance: { id: "inst-a" },
      requestedBy: "admin@acme.test",
    });
    await service.handleUpdate(managedBotUpdate(1, 42, { id: 777, username: "x", firstName: "X" }));
    const events = store.auditLog.map((e) => e.event);
    expect(events).toContain("bot_created_unmatched");
  });

  it("deduplicates a Telegram update delivered twice (at-least-once webhook retries)", async () => {
    const nowRef = { value: new Date("2026-09-28T00:00:00Z") };
    const { service, store } = setup(nowRef);
    const begin = await service.begin("inst-a", {
      repository: "acme/widgets",
      instance: { id: "inst-a" },
      requestedBy: "admin@acme.test",
    });
    const update = linkMessage(500, 42, begin.linkCode);
    const firstSeen = await store.seeUpdate(update.update_id as number, nowRef.value);
    expect(firstSeen).toBe(true);
    await service.handleUpdate(update);
    const secondSeen = await store.seeUpdate(update.update_id as number, nowRef.value);
    expect(secondSeen).toBe(false); // the webhook route would skip re-processing

    const status = await service.getStatus(begin.id);
    expect(status.state).toBe("awaiting_bot_creation"); // bound exactly once
  });

  it("recovers full state from the store after a simulated service restart", async () => {
    const nowRef = { value: new Date("2026-09-28T00:00:00Z") };
    const { service: firstProcess, telegram, store } = setup(nowRef);
    const begin = await driveToReady(firstProcess, telegram, {
      instanceId: "inst-a",
      repository: "acme/widgets",
      adminEmail: "admin@acme.test",
      telegramUserId: 42,
      botId: 777,
    });

    // A brand new ProvisioningService instance (as a fresh cold start /
    // process restart would construct) sees identical state because nothing
    // lived in the old process's memory except the store, which persists.
    const config = makeConfig();
    const restarted = new ProvisioningService(
      store,
      telegram,
      config,
      config.managerBotUsername,
      () => nowRef.value,
    );
    const status = await restarted.getStatus(begin.id);
    expect(status.state).toBe("ready");
    const redeemed = await restarted.redeem(begin.id);
    expect(redeemed.token).toBe("token-for-777");
  });

  it("rate-limits repeated begin calls from one instance", async () => {
    const nowRef = { value: new Date("2026-09-28T00:00:00Z") };
    const { service } = setup(nowRef);
    const attempt = () =>
      service.begin("inst-a", {
        repository: "acme/widgets",
        instance: { id: "inst-a" },
        requestedBy: "admin@acme.test",
      });
    for (let i = 0; i < 5; i++) await attempt();
    await expect(attempt()).rejects.toMatchObject({ kind: "rate_limited" });
  });
});
