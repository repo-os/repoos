# Environment and secrets

RepoOS separates configuration into three buckets so the same project can stay safe and predictable:

| Place | Good for | Keep here? |
| --- | --- | --- |
| `repoos.toml` | committed project behavior | Yes |
| repo-root `.env` | repo-specific secrets and local overrides | Yes, but gitignored |
| machine/service environment | machine-wide provider keys and infra credentials | Yes |

The rule is simple: no secret belongs in `repoos.toml`.

## What gets loaded, and in what order

RepoOS loads the repo-root `.env` before resolving config values that can come from the environment. The loader is intentionally conservative:

1. Real shell or service environment variables win.
2. A repo-root `.env` fills in only missing values.
3. `repoos.toml` is the committed source of non-secret config.
4. A value set in the environment overrides the same key in `.env` or `repoos.toml`.

This is how a machine-wide provider key, like `CLOUDFLARE_API_TOKEN`, can be set once for the whole host while a project-specific secret remains in the repo's `.env` file.

## Project secrets in `.env`

Use a gitignored `.env` at the repository root for secrets that belong to this codebase. The file is read from the repo root by RepoOS at startup, and it is the correct home for the provider keys and session secrets that need to vary between repos.

```bash
# Auth
REPOOS_RESEND_API_KEY=re_...
REPOOS_GOOGLE_CLIENT_SECRET=...
REPOOS_AUTH_SESSION_SECRET=...
REPOOS_AUTH_DEV_BACKDOOR_CODE=local-only-code

# Model providers
REPOOS_OPENROUTER_API_KEY=...
REPOOS_OPENCODE_GO_API_KEY=...
REPOOS_WHISPER_KEY=...

# Common direct-provider fallbacks for whisper
GROQ_API_KEY=...
OPENAI_API_KEY=...
```

These names are the supported ones the config loader reads. Keep placeholders only in documentation; never copy a real value from a production machine into a repo or a shared example.

## Machine or service environment

Use the machine/service environment for credentials that are not unique to one repo, such as a shared provider token or a host-level SSH key path.

```bash
# shared provider credentials
CLOUDFLARE_API_TOKEN=...
HETZNER_API_TOKEN=...

# SSH key path used by the remote validation runner
REPOOS_REMOTE_SSH_KEY=/absolute/path/to/private_key
```

This is the right place for a machine-wide Cloudflare or Hetzner token because it does not belong in the repo and should not be copied into every checkout. The repo-root `.env` is better for per-project secrets that only this repository should see.

## Supported env values

### Auth and login

- `REPOOS_RESEND_API_KEY`: API key for the Resend email OTP provider.
- `REPOOS_GOOGLE_CLIENT_SECRET`: client secret for Google OAuth.
- `REPOOS_AUTH_SESSION_SECRET`: session-signing secret for auth cookies.
- `REPOOS_AUTH_DEV_BACKDOOR_CODE`: local-only dev backdoor code for a login flow that does not require a real inbox. It is ignored in production.

These are never read from `repoos.toml`; they are env-only and stay out of git-tracked configuration.

### Model provider keys

- `REPOOS_OPENROUTER_API_KEY`
- `REPOOS_OPENCODE_GO_API_KEY`
- `REPOOS_WHISPER_KEY`
- `GROQ_API_KEY`
- `OPENAI_API_KEY`

These are used for model-provider access. RepoOS prefers the RepoOS-specific env names when they are present; the generic provider env vars are used as fallback inputs for the Whisper integration and are not a general config surface.

### Infrastructure and remote validation

- `CLOUDFLARE_API_TOKEN`: required by Cloudflare Tunnel + Access setup.
- `HETZNER_API_TOKEN`: required by remote validation / Hetzner runner setup.
- `REPOOS_REMOTE_SSH_KEY`: absolute path to the private SSH key used by the remote validation runner.

These are infrastructure credentials and do not belong in the committed project config.

### Runtime override

Supported user-facing runtime overrides are:

- `REPOOS_RUNTIME`: `auto`, `bun`, or `node`
- `REPOOS_BUN_PATH`: explicit path to a Bun binary

These are legitimate overrides for how RepoOS starts itself. They are the public runtime controls. Do not treat internal lifecycle vars as normal configuration.

## Internal / test / reload variables you should not set in `.env`

The repo has several internal variables that exist for process management, reload loops, and the check pipeline. They are not top-level user settings and should not be copied into a project `.env` file as if they were regular configuration.

Examples:

- `REPOOS_AGENT`
- `REPOOS_RELOAD`
- `REPOOS_PREVIEW_CHILD`
- `REPOOS_PROCESS_TITLE`
- `REPOOS_RUNTIME_REEXEC`
- `REPOOS_CHECK_CHANGED`
- `REPOOS_TEST_WORKERS`
- `REPOOS_SKIP_TESTS`
- `REPOOS_FORCE_BUILD`

If you need a project setting, prefer `repoos.toml` or a supported `REPOOS_*` override documented here. If a variable is only used by internal process management, leave it to the runtime rather than documenting it as ordinary configuration.

## Rotation and safe placeholders

- Rotate keys as soon as a secret is exposed in git, CI logs, screenshots, or screenshots uploaded to a ticket.
- Keep `.env` outside the repo, and keep `.env.example` tracked with placeholders only.
- Prefer generated or per-host env management (systemd, launchd, docker, CI secret stores) for machine-wide credentials.
- Never commit a real key, a half-redacted secret, or a placeholder that looks like a real credential (`abc123`, `secret`, `your-key-here`) when the environment is meant to be user-safe.

## `.env.example`

A tracked `.env.example` is the safe contract for a repo: it shows which secrets are expected without revealing real values.

```bash
# Copy to .env and fill in what this repo needs.
# Real values stay local and out of git.

REPOOS_RESEND_API_KEY=re_...
REPOOS_GOOGLE_CLIENT_SECRET=...
REPOOS_AUTH_SESSION_SECRET=...
REPOOS_AUTH_DEV_BACKDOOR_CODE=local-only-code

REPOOS_OPENROUTER_API_KEY=...
REPOOS_OPENCODE_GO_API_KEY=...
REPOOS_WHISPER_KEY=...
GROQ_API_KEY=...
OPENAI_API_KEY=...

CLOUDFLARE_API_TOKEN=...
HETZNER_API_TOKEN=...
REPOOS_REMOTE_SSH_KEY=/absolute/path/to/private_key

REPOOS_RUNTIME=auto
REPOOS_BUN_PATH=/path/to/bun
```

See also:

- [repoos.toml reference](/configuration)
- [Authentication](/authentication)
- [Deployments and releases](/deployments-and-releases)
- [Troubleshooting](/troubleshooting)
