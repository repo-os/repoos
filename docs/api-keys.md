# API keys in RepoOS features

RepoOS never stores provider API keys in `repoos.toml` or any other tracked
file. Keys live in the gitignored `.env` at the repo root (via
`setDotEnvSecret`), or in a harness auth store the provider adapter already
reads.

Named **project** environments (registered in `.repoos/environments.json`) use
a separate management API and `repoos secrets` CLI. Those routes never return
saved values, reject `REPOOS_*` and fixed provider credential names, and keep
provider saves on `POST /api/model-providers/:id/key` unchanged. See
`user-docs/environment-and-secrets.md`.

## How to add a feature that needs a key

1. **Register the provider** in `MODEL_PROVIDERS` (`src/core/providers/spend.ts`)
   with a **fixed** `envVar` name (for example `REPOOS_OPENROUTER_API_KEY`).
   Do not expose that name as a user-editable setting.
2. **Save only through** `POST /api/model-providers/:id/key`, which calls
   `setDotEnvSecret` — the same path the Model providers tab uses.
3. **Read** with `readProviderKey` (`src/server/routes/model-providers.ts`) so
   boot-time env, in-process updates after save, and harness fallbacks stay
   consistent.
4. **UI:** masked input (`type="password"`), a real `placeholder` attribute,
   save **only** on an explicit Save action, and status text of **Saved** /
   **Not set** / **Ready** — never echo the secret or show the env var as a
   free-text field.
5. **Tests:** use fake values only (for example `sk-test-fake-0803`). Assert that
   saving a key does not modify `repoos.toml` or any tracked path.

## Incident (2026-10-16, task #0803)

A TypeSafe Jev key was pasted into Model routing’s old “API key variable” field.
That value was written to `model_routing.credentialEnv` in `repoos.toml` and
committed locally. The key was deactivated; the commit was not pushed. **Never**
paste a live key into a task, chat, or config field — only into the masked
`.env` save flow.
