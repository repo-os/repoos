/**
 * Authentication API routes.
 *
 * POST /api/auth/request-otp     – Send an email OTP code
 * POST /api/auth/verify-otp      – Verify OTP, create session, set cookie
 * POST /api/auth/logout          – Revoke session, clear cookie
 * GET  /api/auth/me              – Current user info (or 401)
 * GET  /api/auth/status          – Auth enabled? Bootstrap needed?
 * POST /api/auth/bootstrap-admin – Create the first admin
 *
 * Admin-only:
 * GET    /api/auth/users         – List users
 * POST   /api/auth/users         – Add a user
 * DELETE /api/auth/users/:email  – Remove a user
 * PATCH  /api/auth/users/:email  – Change role
 * GET    /api/auth/audit         – Audit log
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import type { RouteHandler } from "./types.js";
import { json, readBody } from "./utils.js";
import { getAuthStore, type AuthStore } from "../../core/auth-store.js";
import type { AuthRole } from "../../core/auth.js";
import {
  generateOtp,
  hashOtp,
  timingSafeEqualStr,
  isValidEmail,
  parseCookies,
  buildSessionCookie,
  SESSION_COOKIE_NAME,
  DEFAULT_SESSION_MAX_AGE,
  otpRequestLimiter,
  otpVerifyLimiter,
  globalRateLimiter,
  generatePkceVerifier,
  pkceChallenge,
  randomHex,
} from "../../core/auth.js";
import type { RepoOSConfig } from "../../core/types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getClientIp(req: IncomingMessage): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string") return forwarded.split(",")[0].trim();
  return req.socket.remoteAddress ?? "unknown";
}

function getConfiguredMaxAge(config: RepoOSConfig): number {
  return config.auth?.sessionMaxAge ?? DEFAULT_SESSION_MAX_AGE;
}

function getSecureFlag(req: IncomingMessage): boolean {
  const proto = req.headers["x-forwarded-proto"];
  if (proto === "https") return true;
  // In development, don't require Secure flag
  return false;
}

function getSessionTokenFromRequest(req: IncomingMessage): string | null {
  const cookies = parseCookies(req.headers.cookie);
  return cookies[SESSION_COOKIE_NAME] ?? null;
}

function getCurrentUser(
  req: IncomingMessage,
  config: RepoOSConfig,
): { email: string; role: AuthRole } | null {
  if (!config.auth?.enabled) return null; // auth disabled, no user context
  const store = getAuthStore(config.root);
  if (!store) return null;
  const token = getSessionTokenFromRequest(req);
  if (!token) return null;
  const session = store.getSession(token);
  if (!session) return null;
  return { email: session.email, role: session.role };
}

function requireAdmin(
  req: IncomingMessage,
  config: RepoOSConfig,
  res: ServerResponse,
): { email: string; role: AuthRole } | null {
  const user = getCurrentUser(req, config);
  if (!user) {
    json(res, 401, { error: "Authentication required" });
    return null;
  }
  if (user.role !== "admin") {
    json(res, 403, { error: "Admin access required" });
    return null;
  }
  return user;
}

// ---------------------------------------------------------------------------
// Email sending via Resend
// ---------------------------------------------------------------------------

async function sendOtpEmail(
  config: RepoOSConfig,
  toEmail: string,
  code: string,
): Promise<boolean> {
  const provider = config.auth?.emailProvider;
  if (!provider || provider.type !== "resend") return false;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${provider.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: provider.fromAddress,
        to: [toEmail],
        subject: "Your RepoOS Login Code",
        html: `
          <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 32px;">
            <h2 style="margin-bottom: 16px;">RepoOS Login Code</h2>
            <p>Your one-time login code is:</p>
            <div style="font-size: 32px; font-weight: bold; letter-spacing: 8px; margin: 24px 0; text-align: center; color: #333;">
              ${code}
            </div>
            <p style="color: #666; font-size: 14px;">This code expires in 10 minutes and can only be used once.</p>
            <p style="color: #999; font-size: 12px; margin-top: 24px;">If you didn't request this code, you can safely ignore this email.</p>
          </div>
        `,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Route handlers
// ---------------------------------------------------------------------------

/** Auth status: is auth enabled? Is bootstrap needed? */
export const authStatus: RouteHandler = (ctx, _req, res) => {
  const { config } = ctx;
  const auth = config.auth ?? {};
  const store = getAuthStore(config.root);
  const userCount = store?.listUsers().length ?? 0;
  return json(res, 200, {
    enabled: auth.enabled === true,
    bootstrapNeeded: auth.enabled === true && userCount === 0,
    hasGoogle: !!(auth.google?.clientId && auth.google?.clientSecret),
    hasEmailProvider: !!(auth.emailProvider?.apiKey && auth.emailProvider?.fromAddress),
  });
};

/** Bootstrap the first admin account. Only works when no users exist. */
export const bootstrapAdmin: RouteHandler = async (ctx, req, res) => {
  const { config } = ctx;
  if (!config.auth?.enabled) {
    return json(res, 400, { error: "Auth is not enabled" });
  }
  const store = getAuthStore(config.root);
  if (!store) {
    return json(res, 500, { error: "Auth store unavailable" });
  }
  if (store.listUsers().length > 0) {
    return json(res, 400, { error: "Users already exist — use the admin panel instead" });
  }

  const body = (await readBody(req)) as Record<string, unknown>;
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!isValidEmail(email)) {
    return json(res, 400, { error: "Valid email address required" });
  }

  // Create the admin user
  store.upsertUser(email, "admin", null, email.split("@")[0]);
  store.logAudit("bootstrap_admin", email, null, "Initial bootstrap");

  // Clear the bootstrap admin config
  if (config.auth) {
    delete config.auth.bootstrapAdmin;
  }

  // Create a session for the new admin
  const maxAge = getConfiguredMaxAge(config);
  const token = store.createSession(email, "admin", maxAge);
  if (!token) {
    return json(res, 500, { error: "Failed to create session" });
  }

  const secure = getSecureFlag(req);
  res.setHeader("Set-Cookie", buildSessionCookie(token, maxAge, secure));
  return json(res, 200, {
    ok: true,
    email,
    role: "admin",
  });
};

/** Request an OTP code via email. */
export const requestOtp: RouteHandler = async (ctx, req, res) => {
  const { config, logger } = ctx;
  if (!config.auth?.enabled) {
    return json(res, 400, { error: "Auth is not enabled" });
  }
  const store = getAuthStore(config.root);
  if (!store) {
    return json(res, 500, { error: "Auth store unavailable" });
  }

  const ip = getClientIp(req);
  if (!globalRateLimiter.tryAcquire(ip)) {
    return json(res, 429, { error: "Too many requests. Please try again later." });
  }

  const body = (await readBody(req)) as Record<string, unknown>;
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!isValidEmail(email)) {
    // Non-enumerating response
    return json(res, 200, { ok: true });
  }

  // Rate limit per email
  const emailKey = `otp_req:${email}`;
  if (!otpRequestLimiter.tryAcquire(emailKey)) {
    return json(res, 429, { error: "Too many OTP requests. Please wait before trying again." });
  }

  // Check if email is in the allowlist
  const user = store.getUser(email);
  if (!user) {
    // Non-enumerating: same response whether or not user exists
    return json(res, 200, { ok: true });
  }

  // Check OTP attempt limits
  if (!otpVerifyLimiter.tryAcquire(`otp_verify:${email}`)) {
    return json(res, 429, { error: "Too many failed attempts. Please wait before trying again." });
  }

  // Generate and store OTP
  const code = generateOtp();
  const codeHash = hashOtp(code);
  store.createOtpChallenge(email, codeHash, 600, ip); // 10 minutes

  // Send email
  const sent = await sendOtpEmail(config, email, code);
  if (!sent) {
    logger.system("warn", "Failed to send OTP email", { email });
    // Still return ok to avoid enumeration
  }

  return json(res, 200, { ok: true });
};

/** Verify an OTP code and create a session. */
export const verifyOtp: RouteHandler = async (ctx, req, res) => {
  const { config } = ctx;
  if (!config.auth?.enabled) {
    return json(res, 400, { error: "Auth is not enabled" });
  }
  const store = getAuthStore(config.root);
  if (!store) {
    return json(res, 500, { error: "Auth store unavailable" });
  }

  const ip = getClientIp(req);

  const body = (await readBody(req)) as Record<string, unknown>;
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const code = typeof body.code === "string" ? body.code.trim() : "";

  if (!isValidEmail(email) || !code) {
    return json(res, 401, { error: "Invalid or expired code" });
  }

  // Rate limit verify attempts
  if (!otpVerifyLimiter.tryAcquire(`otp_verify:${email}`)) {
    return json(res, 429, { error: "Too many failed attempts. Please wait before trying again." });
  }

  const user = store.getUser(email);
  if (!user) {
    return json(res, 401, { error: "Invalid or expired code" });
  }

  const codeHash = hashOtp(code);
  const challenge = store.findValidOtp(email, codeHash);

  if (!challenge) {
    // Check if any valid (non-matching) OTP exists to distinguish "wrong code" from "expired"
    return json(res, 401, { error: "Invalid or expired code" });
  }

  // Mark OTP as used
  store.markOtpUsed(challenge.id);
  otpVerifyLimiter.reset(`otp_verify:${email}`);
  otpRequestLimiter.reset(`otp_req:${email}`);

  // Create session
  const maxAge = getConfiguredMaxAge(config);
  const token = store.createSession(email, user.role, maxAge);
  if (!token) {
    return json(res, 500, { error: "Failed to create session" });
  }

  store.logAudit("otp_login", email, email);

  const secure = getSecureFlag(req);
  res.setHeader("Set-Cookie", buildSessionCookie(token, maxAge, secure));
  return json(res, 200, {
    ok: true,
    email,
    role: user.role,
  });
};

/** Google OAuth login redirect. */
export const googleLogin: RouteHandler = (ctx, _req, res) => {
  const { config } = ctx;
  if (!config.auth?.enabled || !config.auth?.google) {
    return json(res, 400, { error: "Google OAuth not configured" });
  }

  const state = randomHex(16);
  const nonce = randomHex(16);
  const codeVerifier = generatePkceVerifier();
  const codeChallenge = pkceChallenge(codeVerifier);
  const redirectUri = `${_req.headers["x-forwarded-proto"] ?? "http"}://${_req.headers.host}/api/auth/callback/google`;

  // Store state, nonce, and PKCE verifier in short-lived cookies
  const secure = getSecureFlag(_req);
  const cookieBase = "HttpOnly; Path=/; Max-Age=600; SameSite=Lax" + (secure ? "; Secure" : "");
  res.setHeader("Set-Cookie", [
    `repoos_oauth_state=${state}; ${cookieBase}`,
    `repoos_oauth_nonce=${nonce}; ${cookieBase}`,
    `repoos_oauth_pkce=${codeVerifier}; ${cookieBase}`,
  ]);

  const params = new URLSearchParams({
    client_id: config.auth.google.clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state,
    nonce,
    access_type: "offline",
    prompt: "select_account",
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });

  res.writeHead(302, { Location: `https://accounts.google.com/o/oauth2/v2/auth?${params}` });
  res.end();
};

/** Google OAuth callback. */
export const googleCallback: RouteHandler = async (ctx, req, res) => {
  const { config, logger } = ctx;
  const url = new URL(req.url ?? "/", "http://localhost");
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  if (error || !code || !state) {
    res.writeHead(302, { Location: "/login?error=oauth_failed" });
    res.end();
    return;
  }

  // Verify state
  const cookies = parseCookies(req.headers.cookie);
  const savedState = cookies["repoos_oauth_state"];
  const savedNonce = cookies["repoos_oauth_nonce"];
  const codeVerifier = cookies["repoos_oauth_pkce"];

  if (!savedState || !timingSafeEqualStr(state, savedState)) {
    res.writeHead(302, { Location: "/login?error=invalid_state" });
    res.end();
    return;
  }

  // Clear the OAuth cookies
  res.setHeader("Set-Cookie", [
    "repoos_oauth_state=; HttpOnly; Path=/; Max-Age=0",
    "repoos_oauth_nonce=; HttpOnly; Path=/; Max-Age=0",
    "repoos_oauth_pkce=; HttpOnly; Path=/; Max-Age=0",
  ]);

  if (!config.auth?.google) {
    res.writeHead(302, { Location: "/login?error=oauth_not_configured" });
    res.end();
    return;
  }

  const proto = req.headers["x-forwarded-proto"] ?? "http";
  const redirectUri = `${proto}://${req.headers.host}/api/auth/callback/google`;

  // Exchange code for tokens
  try {
    const tokenBody: Record<string, string> = {
      code,
      client_id: config.auth.google.clientId,
      client_secret: config.auth.google.clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    };
    // PKCE: include the code verifier so Google can validate the challenge
    if (codeVerifier) {
      tokenBody.code_verifier = codeVerifier;
    }

    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(tokenBody),
    });

    if (!tokenRes.ok) {
      logger.system("warn", "Google OAuth token exchange failed", { status: tokenRes.status });
      res.writeHead(302, { Location: "/login?error=oauth_failed" });
      res.end();
      return;
    }

    const tokens = (await tokenRes.json()) as { id_token?: string };
    if (!tokens.id_token) {
      res.writeHead(302, { Location: "/login?error=oauth_failed" });
      res.end();
      return;
    }

    // Decode JWT payload and verify nonce claim
    const payload = JSON.parse(
      Buffer.from(tokens.id_token.split(".")[1], "base64url").toString("utf8"),
    );

    if (savedNonce && payload.nonce !== savedNonce) {
      res.writeHead(302, { Location: "/login?error=invalid_nonce" });
      res.end();
      return;
    }

    const email = payload.email as string | undefined;
    if (!email) {
      res.writeHead(302, { Location: "/login?error=no_email" });
      res.end();
      return;
    }

    // Check allowlist
    const store = getAuthStore(config.root);
    const user = store?.getUser(email);
    if (!user) {
      res.writeHead(302, { Location: "/login?error=not_allowed" });
      res.end();
      return;
    }

    // Create session
    const maxAge = getConfiguredMaxAge(config);
    const token = store!.createSession(email, user.role, maxAge);
    if (!token) {
      res.writeHead(302, { Location: "/login?error=session_failed" });
      res.end();
      return;
    }

    store!.logAudit("google_login", email, email);

    const secure = getSecureFlag(req);
    res.setHeader("Set-Cookie", buildSessionCookie(token, maxAge, secure));
    res.writeHead(302, { Location: "/" });
    res.end();
    return;
  } catch (err) {
    logger.system("error", "Google OAuth callback error", { error: String(err) });
    res.writeHead(302, { Location: "/login?error=oauth_failed" });
    res.end();
    return;
  }
};

/** Get current user info. */
export const authMe: RouteHandler = (ctx, req, res) => {
  const { config } = ctx;
  if (!config.auth?.enabled) {
    return json(res, 200, { authenticated: false, authEnabled: false });
  }
  const user = getCurrentUser(req, config);
  if (!user) {
    return json(res, 200, { authenticated: false, authEnabled: true });
  }
  return json(res, 200, {
    authenticated: true,
    authEnabled: true,
    email: user.email,
    role: user.role,
  });
};

/** Logout: revoke session and clear cookie. */
export const authLogout: RouteHandler = (ctx, req, res) => {
  const { config } = ctx;
  const token = getSessionTokenFromRequest(req);
  if (token) {
    const store = getAuthStore(config.root);
    store?.revokeSession(token);
  }
  res.setHeader("Set-Cookie", `${SESSION_COOKIE_NAME}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax`);
  return json(res, 200, { ok: true });
};

// ---------------------------------------------------------------------------
// Admin routes
// ---------------------------------------------------------------------------

/** List all users. */
export const listUsers: RouteHandler = (ctx, req, res) => {
  const { config } = ctx;
  const user = requireAdmin(req, config, res);
  if (!user) return;

  const store = getAuthStore(config.root);
  if (!store) return json(res, 500, { error: "Auth store unavailable" });

  const users = store.listUsers();
  return json(res, 200, { users });
};

/** Add a user. */
export const addUser: RouteHandler = async (ctx, req, res) => {
  const { config } = ctx;
  const admin = requireAdmin(req, config, res);
  if (!admin) return;

  const store = getAuthStore(config.root);
  if (!store) return json(res, 500, { error: "Auth store unavailable" });

  const body = (await readBody(req)) as Record<string, unknown>;
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const role: AuthRole = body.role === "admin" ? "admin" : "member";

  if (!isValidEmail(email)) {
    return json(res, 400, { error: "Valid email address required" });
  }

  const existing = store.getUser(email);
  if (existing) {
    return json(res, 409, { error: "User already exists" });
  }

  store.upsertUser(email, role, admin.email);
  store.logAudit("add_user", email, admin.email, `role: ${role}`);
  return json(res, 200, { ok: true, email, role });
};

/** Remove a user. */
export const deleteUser: RouteHandler = async (ctx, req, res) => {
  const { config } = ctx;
  const admin = requireAdmin(req, config, res);
  if (!admin) return;

  const store = getAuthStore(config.root);
  if (!store) return json(res, 500, { error: "Auth store unavailable" });

  // Extract email from URL path: /api/auth/users/:email
  const url = new URL(req.url ?? "/", "http://localhost");
  const email = decodeURIComponent(url.pathname.split("/").pop() ?? "").trim().toLowerCase();

  if (!isValidEmail(email)) {
    return json(res, 400, { error: "Invalid email" });
  }

  // Prevent removing the last admin
  const user = store.getUser(email);
  if (!user) {
    return json(res, 404, { error: "User not found" });
  }
  if (user.role === "admin" && store.getAdminCount() <= 1) {
    return json(res, 400, { error: "Cannot remove the last admin" });
  }

  store.deleteUser(email);
  store.revokeAllSessions(email);
  store.logAudit("remove_user", email, admin.email);
  return json(res, 200, { ok: true });
};

/** Change a user's role. */
export const updateUserRole: RouteHandler = async (ctx, req, res) => {
  const { config } = ctx;
  const admin = requireAdmin(req, config, res);
  if (!admin) return;

  const store = getAuthStore(config.root);
  if (!store) return json(res, 500, { error: "Auth store unavailable" });

  const body = (await readBody(req)) as Record<string, unknown>;
  const role: AuthRole = body.role === "admin" ? "admin" : "member";

  // Extract email from URL path
  const url = new URL(req.url ?? "/", "http://localhost");
  const email = decodeURIComponent(url.pathname.split("/").pop() ?? "").trim().toLowerCase();

  if (!isValidEmail(email)) {
    return json(res, 400, { error: "Invalid email" });
  }

  const user = store.getUser(email);
  if (!user) {
    return json(res, 404, { error: "User not found" });
  }

  // Prevent demoting the last admin
  if (user.role === "admin" && role !== "admin" && store.getAdminCount() <= 1) {
    return json(res, 400, { error: "Cannot demote the last admin" });
  }

  store.upsertUser(email, role, admin.email);
  // Propagate the new role to all active sessions so authorization is immediate.
  store.updateSessionRoles(email, role);
  store.logAudit("change_role", email, admin.email, `role: ${role}`);
  return json(res, 200, { ok: true, email, role });
};

/** Get audit log. */
export const getAuditLog: RouteHandler = (ctx, req, res) => {
  const { config } = ctx;
  const admin = requireAdmin(req, config, res);
  if (!admin) return;

  const store = getAuthStore(config.root);
  if (!store) return json(res, 500, { error: "Auth store unavailable" });

  const url = new URL(req.url ?? "/", "http://localhost");
  const limit = Math.min(Number(url.searchParams.get("limit") ?? "50"), 200);
  const entries = store.getAuditLog(limit);
  return json(res, 200, { entries });
};
