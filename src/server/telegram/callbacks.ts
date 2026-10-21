/**
 * Signed, single-use inline-button payloads (#0543).
 *
 * Telegram hands callback data back verbatim, so it is attacker-controlled:
 * anyone in a bound chat can replay it, and the renderer's role must never be
 * trusted at press time. Three properties are load-bearing here:
 *
 *  - **Signed.** Every payload carries a truncated HMAC over its fields with
 *    the instance session secret (the same secret the identity layer uses).
 *    A forged `action`/`taskId` fails verification.
 *  - **Short-lived.** Payloads carry an expiry (15 minutes by default), and
 *    verification rejects anything past it before any repository work.
 *  - **Single-use.** The nonce is consumed against a small persisted ledger
 *    before the action runs. A replayed payload — including one whose original
 *    renderer was an admin — is refused even when its signature is valid.
 *
 * The wire format is deliberately compact: Telegram caps callback data at
 * 64 bytes, and the fields must still fit with a mac:
 *
 *   `<kind>.<task-or-draft>.<nonce>.<exp>.<mac>`
 *
 * `kind` is 1–3 chars, `task-or-draft` is a 4–9 digit task id or an 8-char
 * draft nonce, `nonce` is 8 hex chars, `exp` is base36 epoch seconds and
 * `mac` is the first 16 hex chars (64 bits) of HMAC-SHA256. 64 bits is ample
 * for a 15-minute, single-use token whose value is one already-authorized
 * transition; the shorter mac is what keeps the payload inside Telegram's cap.
 */
import { createHmac as hmac, timingSafeEqual } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { randomBytes } from "node:crypto";

/** Inline actions that carry a signed payload. */
export type TelegramActionKind =
  | "create"
  | "edit"
  | "cancel"
  | "edit-title"
  | "edit-type"
  | "edit-priority"
  | "edit-area"
  | "start"
  | "pause"
  | "resume"
  | "review"
  | "done"
  | "confirm"
  | "cancel-done";

/** Compact one- or two-character wire codes. */
const KIND_CODES: Record<TelegramActionKind, string> = {
  create: "c",
  edit: "e",
  cancel: "x",
  "edit-title": "et",
  "edit-type": "ey",
  "edit-priority": "ep",
  "edit-area": "ea",
  start: "s",
  pause: "p",
  resume: "r",
  review: "v",
  done: "d",
  confirm: "m",
  "cancel-done": "cd",
};

const CODE_KINDS = new Map<string, TelegramActionKind>(
  Object.entries(KIND_CODES).map(([kind, code]) => [code, kind as TelegramActionKind]),
);

export const TELEGRAM_ACTION_TTL_MS = 15 * 60 * 1000;
const NONCE_BYTES = 4;
const MAC_HEX_CHARS = 16;

export interface TelegramActionPayload {
  kind: TelegramActionKind;
  /** Canonical task id, or an 8-char draft nonce for creation actions. */
  ref: string;
  nonce: string;
  /** Unix seconds. */
  expiresAt: number;
}

export type TelegramActionVerifyResult =
  | { ok: true; payload: TelegramActionPayload }
  | { ok: false; reason: "invalid" | "expired" | "replay" };

const NONCE_RE = /^[0-9a-f]{8}$/;
const REF_RE = /^[0-9a-f]{8}$|^\d{4,9}$/;
const EXP_RE = /^[0-9a-z]{1,12}$/;

export function createTelegramActionNonce(): string {
  return randomBytes(NONCE_BYTES).toString("hex");
}

function macFor(secret: string, parts: string): string {
  return hmac("sha256", secret).update(parts).digest("hex").slice(0, MAC_HEX_CHARS);
}

/**
 * Serialize and sign one payload. The nonce is generated here so callers
 * cannot accidentally reuse one across two buttons.
 */
export function signTelegramAction(
  secret: string,
  input: {
    kind: TelegramActionKind;
    ref: string;
    now?: Date;
    ttlMs?: number;
    nonce?: string;
  },
): string {
  const ref = input.ref.trim();
  if (!REF_RE.test(ref)) throw new Error(`invalid Telegram action ref "${ref}"`);
  const nonce = input.nonce ?? createTelegramActionNonce();
  if (!NONCE_RE.test(nonce)) throw new Error(`invalid Telegram action nonce "${nonce}"`);
  const expSec = Math.floor(
    ((input.now ?? new Date()).getTime() + (input.ttlMs ?? TELEGRAM_ACTION_TTL_MS)) / 1000,
  );
  const code = KIND_CODES[input.kind];
  const core = `${code}.${ref}.${nonce}.${expSec.toString(36)}`;
  return `${core}.${macFor(secret, core)}`;
}

/**
 * Verify signature + expiry only. Single-use is a separate consume step
 * ({@link TelegramActionNonceLedger.consume}) so a caller can decide whether
 * the user is still authorized before burning the nonce.
 */
export function verifyTelegramAction(
  secret: string,
  token: string | null | undefined,
  now: Date = new Date(),
): TelegramActionVerifyResult {
  if (!secret || typeof token !== "string") return { ok: false, reason: "invalid" };
  if (token.length > 64) return { ok: false, reason: "invalid" };
  const parts = token.split(".");
  if (parts.length !== 5) return { ok: false, reason: "invalid" };
  const [code, ref, nonce, expRaw, mac] = parts;
  const kind = CODE_KINDS.get(code);
  if (!kind || !REF_RE.test(ref) || !NONCE_RE.test(nonce)) {
    return { ok: false, reason: "invalid" };
  }
  if (!EXP_RE.test(expRaw) || !/^[0-9a-f]{16}$/.test(mac)) {
    return { ok: false, reason: "invalid" };
  }
  const expiresAt = Number.parseInt(expRaw, 36);
  if (!Number.isFinite(expiresAt)) return { ok: false, reason: "invalid" };
  const core = `${code}.${ref}.${nonce}.${expRaw}`;
  const expected = macFor(secret, core);
  const a = Buffer.from(mac, "hex");
  const b = Buffer.from(expected, "hex");
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { ok: false, reason: "invalid" };
  if (Math.floor(now.getTime() / 1000) >= expiresAt) return { ok: false, reason: "expired" };
  return { ok: true, payload: { kind, ref, nonce, expiresAt } };
}

/**
 * Persisted nonce ledger. One JSON file per repository under the gitignored
 * cache dir, so a process restart or a second process cannot replay a button
 * that already ran. Reads/writes are synchronous and best-effort: an I/O
 * failure refuses the action (fail closed) rather than allowing a replay.
 */
export class TelegramActionNonceLedger {
  private readonly path: string;
  private readonly now: () => Date;

  constructor(root: string, cacheDir = ".repoos", now: () => Date = () => new Date()) {
    this.path = join(root, cacheDir, "telegram-action-nonces.json");
    this.now = now;
  }

  /** Consume a nonce. False means it was already used (or storage failed). */
  consume(nonce: string, expiresAt: number): boolean {
    const nowSec = Math.floor(this.now().getTime() / 1000);
    let used: Record<string, number> = {};
    try {
      if (existsSync(this.path)) {
        const parsed = JSON.parse(readFileSync(this.path, "utf8")) as {
          used?: Record<string, number>;
        };
        if (parsed?.used && typeof parsed.used === "object") used = parsed.used;
      }
    } catch {
      // Unreadable ledger: refuse rather than risk a replay.
      return false;
    }
    for (const [key, exp] of Object.entries(used)) {
      if (typeof exp !== "number" || exp <= nowSec) delete used[key];
    }
    if (used[nonce] !== undefined) return false;
    used[nonce] = expiresAt;
    try {
      mkdirSync(dirname(this.path), { recursive: true });
      writeFileSync(this.path, `${JSON.stringify({ version: 1, used }, null, 2)}\n`, {
        mode: 0o600,
      });
    } catch {
      return false;
    }
    return true;
  }

  /** Test seam: forget every consumed nonce. */
  reset(): void {
    try {
      if (existsSync(this.path)) writeFileSync(this.path, `${JSON.stringify({ used: {} })}\n`);
    } catch {
      /* best effort */
    }
  }
}
