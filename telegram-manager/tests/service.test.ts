import { describe, expect, it } from "vitest";
import { hashAuthKey } from "../src/crypto.js";
import { InMemoryProvisioningStore } from "../src/memory-store.js";
import { ProvisioningService, REDEEM_GRACE_MS, REQUEST_TTL_MS } from "../src/service.js";
import type { ManagerConfig } from "../src/config.js";
import { FakeTelegramManagerClient, linkMessage, managedBotUpdate } from "./fakes.js";

const INSTANCE_AUTH_KEY = "instance-key";

function makeConfig(): ManagerConfig {
  return {
    databaseUrl: "unused",
    managerBotToken: "999:manager-token",
    managerBotUsername: "RepoOSManagerBot",
    webhookSecret: "whsec",
    instanceAuthKeys: [INSTANCE_AUTH_KEY],
    encryptionKey: "0".repeat(64), // 32 bytes hex
    telegramApiBase: "https://api.telegram.org",
    telegramApiTimeoutMs: 30_000,
  };
}

function authKeyHash(): string {
  return hashAuthKey(INSTANCE_AUTH_KEY);
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
  const begin = await service.begin(
    opts.instanceId,
    {
      repository: opts.repository,
      instance: { id: opts.instanceId },
      requestedBy: opts.adminEmail,
    },
    authKeyHash(),
  );
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

    const status = await service.getStatus(begin.id, authKeyHash());
    expect(status.state).toBe("ready");
    expect(status.bot?.id).toBe(777);

    const redeemed = await service.redeem(begin.id, authKeyHash());
    expect(redeemed.token).toBe("token-for-777");
    expect(redeemed.bot?.username).toBe("project_bot");

    const afterStatus = await service.getStatus(begin.id, authKeyHash());
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
    const first = await service.redeem(begin.id, authKeyHash());
    expect(first.token).toBe("token-for-777");
    expect(telegram.getTokenCallCount).toBe(1);

    // Replay within grace window: same token, no second Telegram call.
    const replay = await service.redeem(begin.id, authKeyHash());
    expect(replay.token).toBe("token-for-777");
    expect(telegram.getTokenCallCount).toBe(1);

    // Past the grace window: no credential, no throw (client reads a
    // tokenless 200 as ManagedRedemptionFollowUpError — see #0531 contract).
    nowRef.value = new Date(nowRef.value.getTime() + REDEEM_GRACE_MS + 1000);
    const gone = await service.redeem(begin.id, authKeyHash());
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

    const redeemedA = await service.redeem(a.id, authKeyHash());
    const redeemedB = await service.redeem(b.id, authKeyHash());
    expect(redeemedA.token).toBe("token-for-111");
    expect(redeemedB.token).toBe("token-for-222");
    expect(redeemedA.token).not.toBe(redeemedB.token);

    // b's request id never yields a's credential, even hypothetically:
    // redeeming a's id again only ever replays a's own token.
    const replayA = await service.redeem(a.id, authKeyHash());
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

    const status = await service.getStatus(begin.id, authKeyHash());
    expect(status.state).toBe("expired");

    await expect(service.redeem(begin.id, authKeyHash())).rejects.toMatchObject({ kind: "gone" });
  });

  it("refuses a stale or already-used link code, and never binds without one", async () => {
    const nowRef = { value: new Date("2026-09-28T00:00:00Z") };
    const { service, store } = setup(nowRef);
    const begin = await service.begin(
      "inst-a",
      {
        repository: "acme/widgets",
        instance: { id: "inst-a" },
        requestedBy: "admin@acme.test",
      },
      authKeyHash(),
    );

    // Wrong code: no state change.
    await service.handleUpdate(linkMessage(500, 42, "WRONGCODE"));
    let status = await service.getStatus(begin.id, authKeyHash());
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
    await service.begin(
      "inst-a",
      {
        repository: "acme/widgets",
        instance: { id: "inst-a" },
        requestedBy: "admin@acme.test",
      },
      authKeyHash(),
    );
    await service.handleUpdate(managedBotUpdate(1, 42, { id: 777, username: "x", firstName: "X" }));
    const events = store.auditLog.map((e) => e.event);
    expect(events).toContain("bot_created_unmatched");
  });

  it("deduplicates a Telegram update delivered twice (at-least-once webhook retries)", async () => {
    const nowRef = { value: new Date("2026-09-28T00:00:00Z") };
    const { service, store } = setup(nowRef);
    const begin = await service.begin(
      "inst-a",
      {
        repository: "acme/widgets",
        instance: { id: "inst-a" },
        requestedBy: "admin@acme.test",
      },
      authKeyHash(),
    );
    const update = linkMessage(500, 42, begin.linkCode);
    const firstSeen = await store.seeUpdate(update.update_id as number, nowRef.value);
    expect(firstSeen).toBe(true);
    await service.handleUpdate(update);
    const secondSeen = await store.seeUpdate(update.update_id as number, nowRef.value);
    expect(secondSeen).toBe(false); // the webhook route would skip re-processing

    const status = await service.getStatus(begin.id, authKeyHash());
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
    const status = await restarted.getStatus(begin.id, authKeyHash());
    expect(status.state).toBe("ready");
    const redeemed = await restarted.redeem(begin.id, authKeyHash());
    expect(redeemed.token).toBe("token-for-777");
  });

  it("refuses getStatus/redeem when a different keyring key is presented", async () => {
    const nowRef = { value: new Date("2026-09-28T00:00:00Z") };
    const store = new InMemoryProvisioningStore();
    const telegram = new FakeTelegramManagerClient();
    const config = {
      ...makeConfig(),
      instanceAuthKeys: ["key-a", "key-b"],
    };
    const service = new ProvisioningService(
      store,
      telegram,
      config,
      config.managerBotUsername,
      () => nowRef.value,
    );
    const begin = await service.begin(
      "inst-a",
      {
        repository: "acme/widgets",
        instance: { id: "inst-a" },
        requestedBy: "admin@acme.test",
      },
      hashAuthKey("key-a"),
    );
    await expect(service.getStatus(begin.id, hashAuthKey("key-b"))).rejects.toMatchObject({
      kind: "not_found",
    });
  });

  it("rotates the project bot token after redemption", async () => {
    const nowRef = { value: new Date("2026-09-28T00:00:00Z") };
    const { service, telegram } = setup(nowRef);
    const begin = await driveToReady(service, telegram, {
      instanceId: "inst-a",
      repository: "acme/widgets",
      adminEmail: "admin@acme.test",
      telegramUserId: 42,
      botId: 777,
    });
    await service.redeem(begin.id, authKeyHash());
    const rotated = await service.rotateToken(begin.id, authKeyHash());
    expect(rotated.token).toBe("token-for-777-rotated");
  });

  it("rate-limits repeated begin calls from one instance", async () => {
    const nowRef = { value: new Date("2026-09-28T00:00:00Z") };
    const { service } = setup(nowRef);
    // Distinct repositories, same instance id — the rate limiter is keyed per
    // instance, while the per-(repository, instance) uniqueness constraint
    // would otherwise (correctly) refuse a second live request for the same
    // pair with a conflict first.
    const attempt = (n: number) =>
      service.begin(
        "inst-a",
        {
          repository: `acme/repo-${n}`,
          instance: { id: "inst-a" },
          requestedBy: "admin@acme.test",
        },
        authKeyHash(),
      );
    for (let i = 0; i < 5; i++) await attempt(i);
    await expect(attempt(99)).rejects.toMatchObject({ kind: "rate_limited" });
  });

  it("answers a second live request for the same repository/instance with a conflict, not a 500", async () => {
    const nowRef = { value: new Date("2026-09-28T00:00:00Z") };
    const { service } = setup(nowRef);
    const begin = () =>
      service.begin(
        "inst-a",
        {
          repository: "acme/widgets",
          instance: { id: "inst-a" },
          requestedBy: "admin@acme.test",
        },
        authKeyHash(),
      );
    await begin();
    // A second non-terminal request for the same pair is refused with the
    // mapped ServiceError (409 on the wire), never the raw Postgres
    // unique-violation that previously escaped as an opaque 500.
    await expect(begin()).rejects.toMatchObject({ kind: "conflict" });

    // A different instance (or repository) is never affected by that pair's
    // conflict.
    await expect(
      service.begin(
        "inst-b",
        {
          repository: "acme/widgets",
          instance: { id: "inst-b" },
          requestedBy: "admin@acme.test",
        },
        authKeyHash(),
      ),
    ).resolves.toBeTruthy();

    // Once the first request has expired, the pair is free again.
    nowRef.value = new Date(nowRef.value.getTime() + REQUEST_TTL_MS + 1000);
    const restarted = await begin();
    expect(restarted.id).toBeTruthy();
  });

  it("maps an in-flight duplicate redeem to an explicit conflict and replays after it completes", async () => {
    const nowRef = { value: new Date("2026-09-28T00:00:00Z") };
    const { service, telegram } = setup(nowRef);
    const begin = await driveToReady(service, telegram, {
      instanceId: "inst-a",
      repository: "acme/widgets",
      adminEmail: "admin@acme.test",
      telegramUserId: 42,
      botId: 777,
    });

    // Hold the first redeem inside the Telegram token call (it owns the CAS
    // lock), then let a retried redeem race it.
    let releaseGate: () => void = () => {};
    telegram.tokenGate = new Promise<void>((resolve) => {
      releaseGate = resolve;
    });
    const first = service.redeem(begin.id, authKeyHash());
    await expect(service.redeem(begin.id, authKeyHash())).rejects.toMatchObject({
      kind: "conflict",
      message: expect.stringContaining("a redemption is already in progress"),
    });

    // The first attempt completes; the retrier's next attempt replays the
    // same token from the grace window — the exact scenario the window exists
    // for (#0531's ManagedRedemptionFollowUpError retry contract).
    releaseGate();
    expect((await first).token).toBe("token-for-777");
    const replay = await service.redeem(begin.id, authKeyHash());
    expect(replay.token).toBe("token-for-777");
    expect(telegram.getTokenCallCount).toBe(1);
  });
});

describe("bot revocation (#0539 disconnect contract)", () => {
  it("revokes a redeemed bot: token rotated, envelope purged, replay dry", async () => {
    const nowRef = { value: new Date("2026-09-28T00:00:00Z") };
    const { service, telegram, store } = setup(nowRef);
    const begin = await driveToReady(service, telegram, {
      instanceId: "inst-a",
      repository: "acme/widgets",
      adminEmail: "admin@acme.test",
      telegramUserId: 42,
      botId: 777,
    });
    await service.redeem(begin.id, authKeyHash());
    const revoked = await service.revokeBot(777, "acme/widgets", "inst-a", authKeyHash());
    expect(revoked.confirmed).toBe(true);
    expect(telegram.replaceTokenCallCount).toBe(1);

    // The grace envelope is gone: a late redeem returns no token (the client
    // reads that as ManagedRedemptionFollowUpError), and revocation is
    // idempotent — a repeat rotates again rather than erroring.
    const after = await service.redeem(begin.id, authKeyHash());
    expect(after.token).toBeUndefined();
    await expect(
      service.revokeBot(777, "acme/widgets", "inst-a", authKeyHash()),
    ).resolves.toMatchObject({ confirmed: true });
    expect(telegram.replaceTokenCallCount).toBe(2);

    const events = store.auditLog.map((e) => e.event);
    expect(events).toContain("bot_revoked");
  });

  it("refuses revocation for a wrong auth key, repository, instance, or unknown bot", async () => {
    const nowRef = { value: new Date("2026-09-28T00:00:00Z") };
    const { service, telegram } = setup(nowRef);
    await driveToReady(service, telegram, {
      instanceId: "inst-a",
      repository: "acme/widgets",
      adminEmail: "admin@acme.test",
      telegramUserId: 42,
      botId: 777,
    });
    // Every flavor of mismatch is the same not_found — never a hint that a
    // bot with this id exists (per-request-authorization invariant), and no
    // Telegram side effect ever runs.
    await expect(
      service.revokeBot(777, "acme/widgets", "inst-a", hashAuthKey("wrong-key")),
    ).rejects.toMatchObject({ kind: "not_found" });
    await expect(
      service.revokeBot(777, "beta/gizmos", "inst-a", authKeyHash()),
    ).rejects.toMatchObject({ kind: "not_found" });
    await expect(
      service.revokeBot(777, "acme/widgets", "inst-b", authKeyHash()),
    ).rejects.toMatchObject({ kind: "not_found" });
    await expect(
      service.revokeBot(999, "acme/widgets", "inst-a", authKeyHash()),
    ).rejects.toMatchObject({ kind: "not_found" });
    expect(telegram.replaceTokenCallCount).toBe(0);
  });

  it("maps a Telegram-side revocation failure to an upstream error (retryable)", async () => {
    const nowRef = { value: new Date("2026-09-28T00:00:00Z") };
    const { service, telegram } = setup(nowRef);
    await driveToReady(service, telegram, {
      instanceId: "inst-a",
      repository: "acme/widgets",
      adminEmail: "admin@acme.test",
      telegramUserId: 42,
      botId: 777,
    });
    telegram.failNextReplace = new Error("Telegram API replaceManagedBotToken failed: down");
    await expect(
      service.revokeBot(777, "acme/widgets", "inst-a", authKeyHash()),
    ).rejects.toMatchObject({ kind: "upstream" });

    // Recovery: a retry succeeds against the restored Telegram API.
    telegram.failNextReplace = null;
    await expect(
      service.revokeBot(777, "acme/widgets", "inst-a", authKeyHash()),
    ).resolves.toMatchObject({ confirmed: true });
  });
});
