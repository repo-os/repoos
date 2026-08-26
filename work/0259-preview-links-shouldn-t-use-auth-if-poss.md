---
id: "0259"
title: Preview links should inherit main auth or be auth-free
type: feature
status: ready
priority: p2
area: web
assigned_to: ai
created_by: hello@repoos.org
branch: ""
model_override: default
created_at: "2026-08-19T18:46:11Z"
updated_at: "2026-08-26T00:47:04Z"
---
## Problem

Preview links for tasks currently require separate authentication or prompt users to log in again when accessing them. This creates friction for human users who are already authenticated in the main application. The preview URL is shared in the task drawer, and having to authenticate again disrupts the review workflow.

## Desired UX

When a human user clicks a preview link from a task they have access to, they should either:

1. **Be able to access the preview without any additional authentication**, if the preview can be served publicly or with a time-limited token embedded in the URL; or

2. **Have the preview inherit their existing session/auth** from the main RepoOS application, so clicking the link does not prompt for credentials or require re-authentication.

The goal is zero friction: the user clicks the preview URL and sees the live preview immediately.

## Acceptance criteria

- [ ] Preview links do not require separate authentication if feasible
- [ ] If auth is required, the preview inherits the user's session from the main RepoOS app
- [ ] No additional login prompt appears when accessing a preview link from an authenticated session
- [ ] The preview remains secure — unauthorized users cannot access previews they shouldn't see
- [ ] The solution works whether the RepoOS server is running locally or on a remote host

## Notes for AI

- This likely involves the preview server port and how cookies/tokens are scoped or forwarded.
- Consider whether previews can use the same session cookie as the main app, or if a signed URL with an embedded token is more practical.
- The preview server is started by RepoOS from the worktree — see how `repoos serve` and the preview path are handled in `src/server/`.
- Security is important: if previews are auth-free, ensure they cannot be accessed by unintended parties (e.g., limit to localhost or require a one-time token).
- If the main app uses `bun` or Node's built-in server, check how cookies are set and whether the preview port inherits them.
- Do not over-engineer: a signed URL with an expiry may be simpler than session sharing across ports.

## Scope

- This task covers the authentication flow for preview links only.
- It does not cover changes to the main app's auth system or the preview content itself.

## Related

- Preview system: `src/server/` and the preview path handling
- See AGENTS.md section on previews and `repoos serve`

## Original prompt

preview links shouldn't use auth if possible, or it should inherit the auth of the main (to limit friction for the human user)

## Activity

- 2026-08-19T18:48:33Z · status draft→inbox, title, area, body
- 2026-08-24T17:27:42Z · model_override
- 2026-08-24T19:54:32Z · status inbox→ready
