/**
 * Server-issued capabilities for trusted native RepoOS clients.
 *
 * These are deliberately separate from browser sessions. The plaintext value
 * is returned only by the explicit create/rotate operation; servers persist
 * only its SHA-256 digest.
 */
import { hashSessionToken, randomHex } from "./auth.js";

export const HUB_CAPABILITY_VERSION = 1;
export const HUB_CAPABILITY_AUDIENCE = "repoos-hub";
export const HUB_CAPABILITY_SCOPE = "summary:read";
export const HUB_CAPABILITY_DEFAULT_TTL_SECONDS = 30 * 24 * 60 * 60;
export const HUB_CAPABILITY_MAX_TTL_SECONDS = 90 * 24 * 60 * 60;
export const HUB_CAPABILITY_TOKEN_PREFIX = "roh_";

export interface HubCapability {
  id: string;
  label: string;
  ownerEmail: string;
  tokenHash: string;
  origin: string;
  audience: typeof HUB_CAPABILITY_AUDIENCE;
  scope: typeof HUB_CAPABILITY_SCOPE;
  version: typeof HUB_CAPABILITY_VERSION;
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
  lastUsedAt: string | null;
}

export interface IssuedHubCapability {
  capability: HubCapability;
  token: string;
}

export function createHubCapabilityToken(): { token: string; tokenHash: string } {
  const token = `${HUB_CAPABILITY_TOKEN_PREFIX}${randomHex(32)}`;
  return { token, tokenHash: hashSessionToken(token) };
}

export function normalizeHubLabel(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const label = value.trim();
  if (label.length < 1 || label.length > 80 || /[\u0000-\u001f\u007f]/.test(label)) return null;
  return label;
}

export function clampHubTtl(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return HUB_CAPABILITY_DEFAULT_TTL_SECONDS;
  }
  return Math.max(300, Math.min(HUB_CAPABILITY_MAX_TTL_SECONDS, Math.floor(value)));
}

export function normalizeHubOrigin(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || !url.hostname || url.username || url.password) return null;
    if (url.pathname !== "/" || url.search || url.hash) return null;
    url.hostname = url.hostname.toLowerCase();
    if (url.port === "443") url.port = "";
    return url.origin;
  } catch {
    return null;
  }
}

export function capabilityRequestOrigin(
  headers: Record<string, string | string[] | undefined>,
): string | null {
  const forwardedProto =
    typeof headers["x-forwarded-proto"] === "string"
      ? headers["x-forwarded-proto"].split(",")[0].trim().toLowerCase()
      : null;
  const proto = forwardedProto ?? "http";
  const host = typeof headers.host === "string" ? headers.host : null;
  if (proto !== "https" || !host) return null;
  return normalizeHubOrigin(`https://${host}`);
}
