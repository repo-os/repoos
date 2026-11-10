/**
 * The one outbound mail path RepoOS uses: the project's `[auth.emailProvider]`
 * (Resend). Login codes and invites (routes/auth.ts) and release emails
 * (release-email.ts) both send through `sendEmail`, so the provider, the From
 * header and the error logging exist in exactly one place. Zero runtime
 * dependencies: plain `fetch` against the Resend HTTP API.
 */

import type { RepoOSConfig } from "../core/types.js";
import type { AuthEmailProvider } from "../core/auth.js";
import { projectDisplayName } from "../core/config.js";

export interface EmailMessage {
  /** One address per request: each recipient gets their own message. */
  to: string;
  subject: string;
  html: string;
  /** Plain-text alternative; included when the caller has one. */
  text?: string;
}

export type EmailSendResult = { ok: true } | { ok: false; reason: string };

/** Longest wait for one Resend call, body included. */
const EMAIL_SEND_TIMEOUT_MS = 15_000;

/**
 * The standardized default sender name: "RepoOS at <repo>", where <repo> is
 * the checkout's directory name (same convention as the ntfy test
 * notification in notify.ts). auth.emailProvider.fromName overrides it.
 */
function defaultFromName(config: RepoOSConfig): string {
  return `RepoOS at ${projectDisplayName(config.root)}`;
}

/**
 * RFC 5322 `From` header: "Display Name <addr>". Without a configured
 * fromName, mail clients fall back to showing the address's local part
 * (e.g. "otp") as the sender name, so this always supplies one.
 */
export function buildFromHeader(config: RepoOSConfig, provider: AuthEmailProvider): string {
  const name = provider.fromName || defaultFromName(config);
  return `${name} <${provider.fromAddress}>`;
}

/** True when `[auth.emailProvider]` can send mail (a Resend key and a From address). */
export function emailProviderConfigured(config: RepoOSConfig): boolean {
  const provider = config.auth?.emailProvider;
  return !!(provider && provider.type === "resend" && provider.apiKey && provider.fromAddress);
}

/**
 * Send one message through the configured provider. Never throws: a provider
 * outage is an answer the caller reports, not an exception that could abort a
 * release or a login.
 */
export async function sendEmail(
  config: RepoOSConfig,
  message: EmailMessage,
  fetchImpl: typeof fetch = fetch,
): Promise<EmailSendResult> {
  const provider = config.auth?.emailProvider;
  if (!provider || provider.type !== "resend") {
    return { ok: false, reason: "No email provider configured ([auth.emailProvider])." };
  }
  try {
    const res = await fetchImpl("https://api.resend.com/emails", {
      method: "POST",
      // A hung provider must not hold a release email, or a login, open forever.
      signal: AbortSignal.timeout(EMAIL_SEND_TIMEOUT_MS),
      headers: {
        Authorization: `Bearer ${provider.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: buildFromHeader(config, provider),
        to: [message.to],
        subject: message.subject,
        html: message.html,
        ...(message.text ? { text: message.text } : {}),
      }),
    });
    if (res.ok) return { ok: true };
    const detail = await res.text().catch(() => "");
    console.error(`Resend send to ${message.to} failed (${res.status}): ${detail.slice(0, 500)}`);
    return { ok: false, reason: `Resend answered ${res.status}` };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error(`Resend send to ${message.to} threw: ${detail}`);
    return { ok: false, reason: `Could not reach Resend: ${detail}` };
  }
}
