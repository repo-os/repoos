# QA: Model providers and API key screens (#1253)

Scope: the Model providers panel (`ModelProvidersPanel.vue`, shown on the Agents
page's Model providers tab) and the key save path it shares with Model routing
(`ModelRoutingPanel.vue`, same `POST /api/model-providers/:id/key` endpoint).

Method: fixtures only. Fake keys (`sk-or-v1-fake-1253`). The real component is
mounted in jsdom with a stubbed `fetch`; its markup is rendered in headless
WebKit with the built global stylesheet and the component's compiled scoped
CSS, at 375, 768 and 1280 px. No real key was used or printed, and no test
reads or writes the real `.env`. Save and error paths are covered by jsdom
component tests and route tests that use temporary repo folders.

Live provider calls were **not** made. Whether OpenRouter, opencode Go or
DeepInfra accept a real key, and what they return, is not verified here. A human
must check a live key on a real machine if that matters for this change.

## Checked

| State | What it checks | 375 | 768 | 1280 |
| --- | --- | --- | --- | --- |
| Missing key | Status reads **Not set**; the key field is `type="password"` with the placeholder "Paste your OpenRouter API key" | pass | pass | pass |
| Saved key, rejected key (401) | Status reads **Saved**; the message says the key was rejected and what to do ("…use Replace key to paste it again"); Replace key / Clear stay reachable | pass | pass | pass |
| Saved key, provider unreachable | Message says the provider could not be reached and to press Retry | pass | pass | pass |
| Save refused by server (multi-line paste) | The message explains the key spans more than one line; the field stays masked and holds the draft | pass | pass | pass |
| Empty Save on Replace key | The message asks for a key and says Clear removes a saved one; nothing is sent | pass | pass | pass |

Every state also passes the layout audit: no visible element leaves the viewport
and the document does not widen. No state puts the fake key into the rendered page.

## Issues found and fixed

1. **An empty Save deleted the saved key.** The API treats an empty key as
   "clear" (this is pinned by a route test). Replace key → Save with nothing
   pasted, or Enter in an empty field, sent `{ key: "" }` and removed the key.
   Fixed in `ModelProvidersPanel.vue` and `ModelRoutingPanel.vue`: an empty Save
   is refused with a plain message. Clear is still the only path that sends an
   empty value. Tests: `model-providers-panel.test.ts` (no POST sent),
   `api-key-screens-qa-browser.test.ts` (empty-save state at three widths).
2. **A failed Clear was invisible.** The error sat inside the key form, which is
   hidden once a key is saved. Fixed: the error now shows on the saved row.
   Test: `model-providers-panel.test.ts`, "a failed Clear shows its error".
3. **No Saved / Not set status.** The panel had no status label. The spec asks for
   one. Added a pill beside each live row (not on the CLI-login Muse row or the
   link-out rows). Tests: `model-providers-panel.test.ts` and the QA test.
4. **Status pills overlapped "Open dashboard" at 375 px.** The row header did not
   wrap. Fixed: the header and title wrap, and the link does not break. Checked
   in the 375 px screenshot.
5. **Errors were technical or had no next step.** Fixed:
   - Multi-line paste: "Secret value must not contain newlines" became a plain
     sentence telling the user to paste the key on one line.
   - Overlong key: now says the value does not look like a valid key.
   - A failed `.env` write no longer returns the raw error (which named the
     file path). It says to check the repo folder is writable.
   - 401 from OpenRouter, opencode Go and DeepInfra now always reads "X rejected
     the API key. Check the key was copied in full, then use Replace key to paste
     it again."
   - Network failures now read "X could not be reached. Check your internet
     connection, then press Retry."
   Tests: `model-providers-routes.test.ts`, `model-provider-spend.test.ts`.

## Gaps

- Model routing's key form (`ModelRoutingPanel.vue`) got the same empty-Save
  guard, but it has no test of its own and is not in the WebKit fixtures. Its
  error text is the server message, so the server tests cover the wording.
- Provider wording is unchanged when a request succeeds but the response has an
  unexpected shape. Only the rejected-key and unreachable paths were rewritten.
- Live provider behaviour was not observed (see the top of this document).

## Commands

```sh
bunx vitest run --config src/ui-app/vite.config.ts model-providers-panel model-providers-routes model-provider-spend model-routing-panel api-key-screens-qa-browser
QA_SHOTS=/tmp/qa-1253 bunx vitest run --config src/ui-app/vite.config.ts api-key-screens-qa-browser
```

`QA_SHOTS` writes full-page PNGs per state and width. Keep them out of the
repo.
