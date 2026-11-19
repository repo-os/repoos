# Agents page failure states and Test button QA

Ran the task worktree's auth-less server with `just serve-noauth 7272` and used
headless Playwright Chromium on `/agents?shotState=agents:lastRuns`. The page
loaded its deterministic last-run fixture. I intercepted only
`POST /api/models/test` to return representative missing-executable,
authentication, and HTTP 429 failures; no provider credentials or live model
calls were used.

| Case | Test result shown inline |
| --- | --- |
| CLI could not launch (`spawn opencode ENOENT`) | “OpenCode CLI is not installed or could not be found. Install OpenCode and make sure its CLI is on this computer's PATH.” |
| Signed out (`Not logged in`) | “OpenCode is signed out. Re-authenticate OpenCode on this computer.” |
| Provider rate limited (`HTTP 429: too many requests`) | “OpenCode hit a provider quota or rate limit. Wait for the provider limit to reset, then retry.” |

Each case displayed the `failed` status and its actionable message in the card;
the failure text no longer depends on a native title tooltip. The browser
reported no page errors. The same three responses are covered by the AgentsView
Test-button tests and the shared failure classifier test.

The focused tests passed. `REPOOS_CHECK_CHANGED=main repoos check` passed on the
formatted tree, including the remote build and changed-path test run, local
format/lint/build guards, rendered contrast audit, and UI smoke. The remote
suite reported 4,566 passed and one skipped. No live agent CLI or provider
account was used, so this verifies the UI's handling of the failure payloads,
not provider authentication or rate-limit behavior against a real account.
