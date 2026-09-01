---
name: frontend-testing
description: How to verify a RepoOS UI change in the running app — driving the browser, and getting past the login wall with the dev auth backdoor instead of a real email OTP.
---

# Frontend testing

Use this when a task changes the web UI and you need to see it render / click
through it — not just "does it compile". A `vue-tsc` pass and the headless UI
smoke test in `repoos check` catch mount errors and unrendered `{{ mustache }}`,
but they do not tell you whether a modal is padded, a toggle sticks, or a flow
works end to end. For that, open the running app.

## Don't get stuck at the login screen

Local `repoos serve` and task previews run with `auth.enabled = true`. You do
**not** need a real inbox — there is a dev backdoor:

- **Email:** an already-allowlisted user. Use **`hello@repoos.org`** (the
  `bootstrapAdmin` in `repoos.toml`). The backdoor does not let you sign in as
  an arbitrary address — the email must already be in the allowlist.
- **Code:** the value of **`REPOOS_AUTH_DEV_BACKDOOR_CODE`** in the gitignored
  `.env` at the repo root:

  ```bash
  grep REPOOS_AUTH_DEV_BACKDOOR_CODE .env
  ```

  If that line is empty or missing, `.env` is the source of truth — the value
  may have changed, or `.env` may not exist yet (`.env.example` shows the key
  with an empty placeholder). It is env-var only, never a `repoos.toml` key,
  and is ignored when `NODE_ENV=production`.

On the `/login` page: enter the email, request the code, then enter the backdoor
code in place of the OTP. The resulting session is otherwise normal. The same
code works against any locally-served instance (a task preview, or a
`repoos serve` a human is already running).

Wiring, if you need it: `src/core/config.ts` reads the env var into
`config.auth.devBackdoorCode`; `src/server/routes/auth.ts` accepts it in place
of the OTP (`verifyOtp`).

## Getting a browser onto the app

- **A managed task preview** (`::repoos-preview-request::`) starts the server
  from your worktree and probes it — but that probe is a plain HTTP health
  check, it does **not** open a browser or log in. Use it to confirm the change
  *serves*; use a real browser for anything visual.
- **A `repoos serve` a human already has running** — ask which port (this repo
  is pinned to `:7171`; other repos derive one, see `repoos serve` /
  `resolveServePort`). Point your browser tooling at it and log in with the
  backdoor above.
- Task-runner agents must not run `repoos serve` themselves — previews and the
  control-plane port are server-owned.

## Verify, then show

1. Log in (backdoor), navigate to the view your change touches.
2. Screenshot it. Compare against what the task asked for — padding, alignment,
   empty states, the specific interaction.
3. Check the browser console for errors and the network tab for failed API
   calls (`api()` now says "Can't reach the RepoOS server" on a dead server, not
   the browser's "Failed to fetch").
4. Exercise the actual interaction (open the modal, toggle the setting, submit
   the form) and re-screenshot — a static render is not proof the flow works.
5. Put the screenshot(s) in your report. Never ask the human to check manually.

## Notes

- Reset any viewport emulation when you're done.
- If a setting "doesn't stick" after save, suspect the config store: `auth.*`
  and `remoteValidation.*` arrive from `/api/config` as nested objects, not flat
  keys — `fillForm` walks the dotted path for those.
