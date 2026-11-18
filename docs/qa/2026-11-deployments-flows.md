# Deployments page and deploy-flow QA (November 2026)

## Scope and method

Reviewed the Deployments view at desktop width (1280 × 900) and narrow mobile width (375 × 812) using headless Playwright against the auth-less `just serve-noauth` server on an isolated scratch worktree. The scratch server used the branch's built UI and local-only fixture data. No deployment provider, project secret, or remote Git push was contacted.

The browser pass covered the local environment binding card, the branch deploy confirmation, and a refused-push state. The failure was first exercised through a mocked HTTP 409 response (`Push rejected: remote branch has diverged`), then captured through the deterministic `deployments:deployFailure` fixture. Browser output showed no page errors or console errors for the fixture captures.

## Results

| State | 1280px | 375px | Result |
| --- | --- | --- | --- |
| Environment binding | Rendered | Rendered | Shows selected local environment, binding control, and copy that variables are not uploaded or synced to the provider. |
| Deploy confirmation | Rendered and clicked | Rendered and clicked | Names the branch and service, lists the exact `git push origin prod` command, and explains the push is real and never force-pushed. |
| Refused push | Rendered after mocked 409 | Rendered after mocked 409 | Error is announced in the still-open confirmation; the user retains command and branch context. |

At each width, `document.documentElement.scrollWidth` equaled `clientWidth` (1280/1280 and 375/375). The narrow failure dialog fit within the viewport and retained its close, retry, and cancel controls. At 375px, branch cards and service details stack into a single column. The mobile bottom navigation remains visible while page content continues in the page scroll area.

The environment fixture accurately communicates that environment bindings are local metadata. Deployments only read Git state; the page explicitly directs users to the provider dashboard for actual build/deploy status. No live build outcome was claimed or tested.

## Regression coverage added

- Component test verifies the refused-push fixture opens the confirmation and renders the alert without making API calls.
- Component test submits a deploy that rejects, then verifies the error remains visible and the confirmation stays open.
- Fixture is registered in the preview fixture registry so the failure presentation can be captured deterministically without pushing to a remote.

## Limits

The browser run used deterministic fixtures and a mocked HTTP failure. It did not use a provider account, deploy credentials, or a remote repository, so it does not establish that a provider build succeeds. Existing component and server tests cover the API-side branch validation and deployment behavior; this pass focused on the user-facing state and responsive layout.
