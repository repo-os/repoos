/**
 * Credential redaction for the Telegram adapter (#0531).
 *
 * A project bot token is a credential that travels inside request URLs
 * (`<api base>/bot<token>/METHOD`) exactly once on the wire — and could
 * therefore surface in an error message built from a URL, an unexpected API
 * echo, or a debug print. Everything that leaves the adapter — thrown errors,
 * console output, persisted status strings — passes through these helpers, so
 * neither the raw token nor the `/bot<token>` URL shape survives.
 *
 * This layer is deliberately separate from `src/core/redact.ts` (the support
 * bundle's denylist): here we redact *by value* against the token the adapter
 * itself is holding, which catches the token even if a future Bot API header
 * shape would not match a static pattern. `core/redact.ts` additionally
 * catches a bare `TELEGRAM_BOT_TOKEN=` line anywhere a bundle ever sees one.
 */
import { REDACTED } from "../../core/redact.js";

/** The canonical Telegram cloud Bot API base. */
export const TELEGRAM_API_BASE = "https://api.telegram.org";

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * The shape of a Telegram bot token: `123456789:AA…` (at least 20 suffix chars).
 */
const TELEGRAM_TOKEN_SHAPE = /\b\d{6,}:[A-Za-z0-9_-]{20,}\b/g;

/**
 * A value-based redactor bound to one token. Matches the raw token, the
 * `/bot<token>` request-URL fragment, and (belt and braces) any string that
 * merely *looks* like a Telegram token. Repeated substrings merely get
 * redacted twice — re-scanning already-redacted content is stable.
 */
export function makeTokenRedactor(
  token: string,
  apiBase = TELEGRAM_API_BASE,
): (text: string) => string {
  const safeToken = typeof token === "string" ? token : "";
  return (text: string): string => {
    let out = String(text ?? "");
    // URL fragment first: <base>/bot<token>/<method>
    const urlRe = new RegExp(`${escapeRegExp(apiBase)}/bot[^/\\s"',)]+`, "gi");
    out = out.replace(urlRe, `${apiBase}/bot${REDACTED}`);
    // The bare token, wherever else it leaked.
    if (safeToken) out = out.replace(new RegExp(escapeRegExp(safeToken), "g"), REDACTED);
    out = out.replace(TELEGRAM_TOKEN_SHAPE, REDACTED);
    return out;
  };
}

/**
 * Redact a string against the given token — the stateless convenience form of
 * {@link makeTokenRedactor} for one-off call sites.
 */
export function redactTokenText(text: string, token: string, apiBase?: string): string {
  return makeTokenRedactor(token, apiBase)(text);
}
