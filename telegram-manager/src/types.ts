/**
 * Wire-format types for the #0559 provisioning service — the hosted side of
 * the contract `src/server/telegram/provisioning.ts` (in the main RepoOS
 * package) implements as a client. Deliberately duplicated rather than
 * imported: this service is a *separately deployed* boundary (its own
 * package.json, own lockfile, own Neon Function deploy) and must never
 * depend on `@repo-os/repoos` or vice versa (AGENTS.md zero-runtime-deps is
 * a constraint on the core package; isolating this service's own dependency
 * tree is the other half of that same rule). `docs/telegram-adapter.md` and
 * `docs/telegram-manager-service.md` are the single prose source of truth
 * for this contract — keep both in sync with any change here.
 */

/** A provisioning request's server-owned state machine. */
export type ProvisioningState =
  | "pending"
  | "awaiting_bot_creation"
  | "ready"
  | "redeemed"
  | "expired"
  | "failed";

export interface BeginRequestBody {
  repository: string;
  instance: { id: string };
  requestedBy: string;
  botNameHint?: string;
}

export interface BotSummary {
  id: number;
  username: string;
  display_name: string;
  source: "managed";
}

export interface BeginResponseBody {
  id: string;
  deep_link: string;
  expires_at: string;
  /** The one-time code the admin sends to the manager bot to bind their
   * Telegram identity to this request BEFORE tapping the create-bot link —
   * see docs/telegram-manager-service.md#correlation. Not part of #0531's
   * client contract (which only reads id/deep_link/expires_at), so the
   * local instance ignores it; it exists for the browser-rendered
   * instructions the admin follows by hand. */
  link_code: string;
}

export interface StatusResponseBody {
  id: string;
  state: ProvisioningState;
  deep_link: string;
  expires_at: string;
  bot?: BotSummary;
  error?: string;
}

export interface RedeemResponseBody {
  token: string;
}

export interface ErrorResponseBody {
  error: string;
}
