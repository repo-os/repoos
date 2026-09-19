# Environment and secrets

RepoOS separates configuration into three buckets so a project stays safe and
predictable:

| Place | Good for | Committed? |
| --- | --- | --- |
| `repoos.toml` (repo root) | project behavior — board, previews, checks, releases | Yes — git-tracked |
| `.env` (repo root, gitignored) | secrets that belong to this repository | No |
| machine / service environment | machine-wide provider keys and infrastructure credentials | No |

**No secret belongs in `repoos.toml`.** Set provider and session secrets in
`.env` or the machine environment instead. The one secret field the Settings UI
will write to the file is `whisper.apiKey` — and you should still prefer
`REPOOS_WHISPER_KEY` in `.env`. The full list of project settings is in the
[repoos.toml reference](/configuration).

## What gets loaded, and in what order

RepoOS reads the repo-root `.env` at startup, before resolving any value that can
come from the environment. The loader is intentionally conservative:

1. Real shell or service environment variables win.
2. A repo-root `.env` fills in only values the environment hasn't already set.
3. `repoos.toml` is the committed source of non-secret config.
4. For fields that have an environment form, the environment overrides the
   `repoos.toml` value (for example `REPOOS_RESEND_API_KEY` fills
   `[auth.emailProvider]`, and `NTFY_BASE_URL` overrides `ntfyBaseUrl`).

The `.env` parser is deliberately minimal: one `KEY=value` per line, blank lines
and `#` comments ignored, optional surrounding single or double quotes stripped.
There is no `export` keyword and no variable interpolation. A key already present
in the process environment is never overwritten by the file.

Because a machine-wide provider key can be set once for the whole host while a
project-specific secret stays in the repo's `.env`, the two coexist without
either shadowing the other.

## Project secrets in `.env`

Use a gitignored `.env` at the repository root for secrets that belong to this
codebase. It is the right home for provider keys and session secrets that should
vary between repos.

```bash
# Auth
REPOOS_RESEND_API_KEY=re_...
REPOOS_GOOGLE_CLIENT_SECRET=...
REPOOS_AUTH_SESSION_SECRET=...
REPOOS_AUTH_DEV_BACKDOOR_CODE=your-local-code

# Model providers and voice transcription
REPOOS_OPENROUTER_API_KEY=...
REPOOS_OPENCODE_GO_API_KEY=...
REPOOS_WHISPER_KEY=...

# Provider fallbacks for whisper
GROQ_API_KEY=...
OPENAI_API_KEY=...
```

Keep placeholders only in documentation and examples. Never copy a real value
from a production machine into a repo, an issue, or a shared example.

## Machine or service environment

Use the machine or service environment for credentials that are not unique to
one repo — a shared provider token, a host-level SSH key path, a self-hosted
service URL:

```bash
# Shared infrastructure credentials
CLOUDFLARE_API_TOKEN=...
HETZNER_API_TOKEN=...
REPOOS_REMOTE_SSH_KEY=/absolute/path/to/private_key

# Self-hosted ntfy server
NTFY_BASE_URL=https://ntfy.example.com
```

This is the right place for a machine-wide Cloudflare or Hetzner token: it does
not belong in the repo and should not be copied into every checkout. The
repo-root `.env` is better for per-project secrets that only this repository
should see. Prefer your platform's secret store — systemd `Environment=`,
launchd, Docker secrets, or a CI secret store — over a file on disk for
machine-wide credentials.

## Supported environment variables

These are the variables RepoOS reads for users. Everything else with a `REPOOS_`
prefix is internal (see below).

### Auth and login

| Variable | Purpose |
| --- | --- |
| `REPOOS_RESEND_API_KEY` | API key for the Resend email OTP provider. |
| `REPOOS_GOOGLE_CLIENT_SECRET` | Client secret for Google OAuth. |
| `REPOOS_AUTH_SESSION_SECRET` | Session-signing secret. Auto-generated at startup if unset, so you don't have to set one. |
| `REPOOS_AUTH_DEV_BACKDOOR_CODE` | Local-only code that replaces the emailed OTP on a dev instance. Ignored when `NODE_ENV=production`. |

These belong in `.env`, never in committed config — the Settings API refuses to
write them to `repoos.toml`. See [Authentication](/authentication).

### Model providers and voice transcription

| Variable | Purpose |
| --- | --- |
| `REPOOS_OPENROUTER_API_KEY` | OpenRouter key used for the Agents page's live spend view. |
| `REPOOS_OPENCODE_GO_API_KEY` | OpenCode Go key used for the Agents page's live spend view. |
| `REPOOS_WHISPER_KEY` | API key for the configured voice-to-text provider. |
| `GROQ_API_KEY` | Fallback key used when `[whisper] provider = "groq"`. |
| `OPENAI_API_KEY` | Fallback key used when `[whisper] provider = "openai"`. |

RepoOS prefers the RepoOS-specific name when present. The generic provider keys
are provider-aware fallbacks for whisper — an `OPENAI_API_KEY` is never sent to
Groq, or the reverse.

### Infrastructure and remote validation

| Variable | Purpose |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | Required by Cloudflare Tunnel and Access setup. |
| `HETZNER_API_TOKEN` | Required by the remote validation runner. |
| `REPOOS_REMOTE_SSH_KEY` | Absolute path to the private SSH key the remote validation runner uses. |

### Notifications

| Variable | Purpose |
| --- | --- |
| `NTFY_BASE_URL` | Overrides `ntfyBaseUrl` in `repoos.toml` for a self-hosted ntfy server. |

### Runtime

| Variable | Purpose |
| --- | --- |
| `REPOOS_RUNTIME` | `auto` (default), `bun`, or `node`. |
| `REPOOS_BUN_PATH` | Explicit path to a Bun binary. |

These are the supported public controls for how RepoOS starts itself. See
[Configuration → Worktrees and runtime](/configuration#worktrees-and-runtime).

## Internal, test, and reload variables — do not set these

The codebase uses many other variables for process management, the reload loop,
and the check pipeline. They are implementation details, not project settings,
and should not be copied into `.env` as if they were configuration.

Examples: `REPOOS_AGENT`, `REPOOS_RELOAD`, `REPOOS_PREVIEW_CHILD`,
`REPOOS_PROCESS_TITLE`, `REPOOS_RUNTIME_REEXEC`, `REPOOS_CHECK_CHANGED`,
`REPOOS_TEST_WORKERS`, `REPOOS_SKIP_TESTS`, `REPOOS_FORCE_BUILD`,
`REPOOS_SKIP_BUILD`, `REPOOS_STRICT_BUILD`, `REPOOS_STRICT_TIMING`,
`REPOOS_TASK_ID`, `REPOOS_RUN_ID`, and `REPOOS_NO_WORKTREE_GC`.

If you need a project setting, use `repoos.toml` or a supported override
documented above. If a variable is only used to drive RepoOS's own processes,
leave it to the runtime.

## Rotation and safe placeholders

- Rotate a key as soon as it is exposed in git, CI logs, a screenshot, or a
  ticket attachment.
- Keep `.env` out of git and keep a tracked `.env.example` with placeholders
  only.
- Never commit a real key, a half-redacted secret, or a placeholder that looks
  like a real credential.
- Prefer generated or per-host secret management (systemd, launchd, Docker, a
  CI secret store) for machine-wide credentials.
- After rotating, restart `repoos serve` so the new value is loaded.

## `.env.example`

A tracked `.env.example` is the safe contract for a repo: it shows which secrets
are expected without revealing real values.

```bash
# Copy to .env and fill in what this repo needs. `.env` is gitignored; this
# file is tracked so the project documents which secrets are expected without
# exposing real values.
#
# RepoOS loads `.env` from the repo root at startup; real shell/service env vars
# still take precedence over it. No key belongs in repoos.toml.

# Auth / login
REPOOS_RESEND_API_KEY=re_...
REPOOS_GOOGLE_CLIENT_SECRET=...
REPOOS_AUTH_SESSION_SECRET=...
REPOOS_AUTH_DEV_BACKDOOR_CODE=your-local-code

# Model providers / voice transcription
REPOOS_OPENROUTER_API_KEY=...
REPOOS_OPENCODE_GO_API_KEY=...
REPOOS_WHISPER_KEY=...
GROQ_API_KEY=...
OPENAI_API_KEY=...

# Infrastructure / third-party runners
CLOUDFLARE_API_TOKEN=...
HETZNER_API_TOKEN=...
REPOOS_REMOTE_SSH_KEY=/absolute/path/to/private_key

# Self-hosted notifications
# NTFY_BASE_URL=https://ntfy.example.com

# Supported runtime overrides
REPOOS_RUNTIME=auto
REPOOS_BUN_PATH=/path/to/bun
```

The tracked `.env.example` at the RepoOS repo root is the source of truth for
this template; keep the two in sync when a supported variable changes.

See also:

- [repoos.toml reference](/configuration)
- [Authentication](/authentication)
- [Deployments and releases](/deployments-and-releases)
- [Troubleshooting](/troubleshooting)
