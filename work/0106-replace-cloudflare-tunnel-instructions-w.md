---
id: "0106"
title: Replace Cloudflare tunnel instructions with a validated publishing setup assistant
type: feature
status: review
needs_input: true
priority: p1
area: ui
assigned_to: AI
created_by: ""
branch: ""
cli_override: codex
model_override: gpt-5.6-luna
created_at: "2026-08-11T19:35:08Z"
updated_at: "2026-08-11T20:11:29Z"
---
## Problem

The Cloudflare Tunnel setting currently behaves like an enable toggle but only reveals generic static instructions. It does not collect the values needed to publish an app, explain what is already configured, or generate commands tailored to the user. This makes setup feel more automated than it is and allows avoidable mistakes such as using dev instead of repoos.org as the base domain, choosing the wrong local port, or expecting an API token to be entered into the web UI.

## Desired UX

Replace the misleading toggle-first experience with a Cloudflare Tunnel status card and a guided publishing setup assistant. The user enters a zone/domain, app or subdomain, local port, allowed email addresses, and preferred run mode. RepoOS validates those values, shows the derived public URL and local service, reports safe readiness checks, and produces exact copyable terminal commands. Secrets must remain outside the UI and generated commands.

Example values should make the mapping obvious: zone repoos.org, app dev, public URL https://dev.repoos.org, local service http://localhost:7171. Port 7171 is RepoOS; port 3000 is only correct when the intended local app actually listens there.

## Acceptance criteria

- [ ] Replace or rename the current Cloudflare Tunnel toggle so the UI does not imply that enabling it completes configuration or starts a tunnel.
- [ ] Show a clear state such as Not configured, Configured but stopped, Running, or Needs attention, with a Configure publishing action.
- [ ] The setup UI collects and validates the Cloudflare zone/base domain, app name or subdomain, local port, one or more allowed email addresses, and foreground/background run preference.
- [ ] Show the derived public hostname/URL and local origin before generating commands; reject malformed domains, hostnames, ports, and email addresses.
- [ ] Generate exact copyable repoos tunnel setup/create/start/status commands from the entered values. For repoos.org + dev + 7171, the create command targets dev.repoos.org and port 7171.
- [ ] Never request, display, persist, interpolate, or copy a Cloudflare API token in the browser UI or generated command text. Explain that the token is pasted only into the interactive repoos tunnel setup prompt.
- [ ] Include a direct link to Cloudflare custom-token creation and list the required least-privilege permissions: Account / Access: Apps and Policies / Edit; Account / Cloudflare Tunnel / Edit; Zone / DNS / Edit scoped to repoos.org; Account Settings / Read only if the implementation still requires it.
- [ ] Explain that wildcard hostnames are not entered in the token resource scope: the zone is repoos.org, while dev.repoos.org and other subdomains are created as individual published apps/routes.
- [ ] Add safe readiness checks through a narrow server API for: cloudflared installed/version, origin certificate present and usable, API token stored yes/no without exposing its value, configured tunnel identity/base domain, local origin port listening, tunnel running state, and published hostnames.
- [ ] Readiness failures provide specific recovery guidance, including re-running cloudflared tunnel login when the origin certificate is unauthorized and waiting for cloudflared tunnel list to succeed before continuing.
- [ ] The command generator remains useful when checks cannot run, and clearly distinguishes generated instructions from actions RepoOS has actually performed.
- [ ] Add automated server and UI tests covering validation, command generation, readiness-state mapping, secret redaction, and the repoos.org/dev/7171 example.
- [ ] Rebuild UI assets, refresh relevant screenshots, and pass repoos check.

## Notes for AI

Build on task 0068 tunnel CLI behavior and replace the static instructional treatment introduced by task 0079. Prefer narrow typed server endpoints over arbitrary shell execution. Do not add runtime dependencies. Do not implement one-click secret submission in this task. If a later task adds Run step buttons, each action must call a constrained RepoOS operation rather than accept arbitrary commands. Preserve the CLI as the authority for credential storage and Cloudflare mutations.

## Activity

- 2026-08-11T19:35:38Z · body
- 2026-08-11T20:11:29Z · cli_override, model_override
