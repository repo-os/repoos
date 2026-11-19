# November 2026 app copy review

This pass reviewed user-facing terminology and errors across the web app, mobile
Hub, and macOS Hub. The most actionable inconsistencies were in connection
failures: the web API error exposed a terminal command even though the recovery
banner provides a restart action, and the macOS Hub used the networking acronym
“HTTP” in an address-checking error.

The web message now says the RepoOS server may be offline and tells the user to
start it before reloading. The macOS health-check message now calls the numeric
value an “error code” and tells the user to check that the address points to a
RepoOS server. The response code stays visible because support and debugging
often need it.

Terminology reviewed: “server” names the reachable RepoOS instance; “project”
names the repository served by it; “runner” and “agent” remain distinct product
roles. “Worktree,” “endpoint,” and “payload” appeared mainly in implementation
details and diagnostic views, so this pass did not rename those concepts
broadly. Some advanced task and developer screens intentionally expose Git or
build details to users who need them.

Mobile connection guidance already uses actionable language such as “That
server needs an HTTPS URL” and “Looking for RepoOS servers,” so no mobile copy
change was warranted in this focused pass. The macOS Hub’s HTTPS certificate
and timeout guidance is also specific about the next step. The remaining “HTTP”
references are protocol requirements, provider diagnostics, or internal code,
not general connection guidance.

The web copy assertion checks the new plain-language message and guards against
reintroducing the terminal command. No browser was opened; this copy-only change
does not need a visual review. Automated checks are recorded by the task handoff.
