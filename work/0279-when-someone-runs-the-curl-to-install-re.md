---
id: "0279"
title: ```markdown
type: feature
status: inbox
priority: p2
area: general
assigned_to: ai
created_by: hello@repoos.org
branch: ""
model_override: default
created_at: "2026-08-24T16:56:37Z"
updated_at: "2026-08-24T16:57:49Z"
---
```markdown
---
title: Add pretty terminal output to curl installer
type: feature
priority: p2
area: cli
assigned_to: ai
---

## Problem

The current installation experience for RepoOS lacks polish. When users run the curl-piped installer command, they receive minimal feedback. Modern installers like Herdr provide visual ASCII art, clear progress indicators, OS/architecture detection, and friendly messaging that makes the installation feel polished and professional.

## Desired UX

When a user runs `curl -fsSL <install-url> | sh`, they should see:

- An eye-catching ASCII art header with RepoOS branding
- Clear, step-by-step status messages indicating what's happening
- Auto-detected OS and architecture (e.g., "detected linux/x86_64")
- Progress indicators for key steps: fetching manifest, downloading release, installing
- The final installation path clearly displayed
- A friendly "ready to go" message with instructions on how to start

The overall aesthetic should feel polished, modern, and even prettier than the herdr reference if possible.

## Acceptance criteria

- [ ] Install script detects and displays OS/architecture
- [ ] ASCII art or visual branding header displays at the start
- [ ] Step-by-step progress messages for fetch, download, and install
- [ ] Installation path is clearly shown in output
- [ ] "Ready to use" message with next steps is displayed
- [ ] Works on Linux and macOS
- [ ] Output formatting is clean and terminal-friendly
- [ ] Script is idempotent (can be run multiple times safely)

## Notes for AI

- The install.sh script should be the target for modification
- Use herdr.dev/install.sh as a style reference but aim for equal or better polish
- Consider using color output (if terminal supports it) for visual hierarchy
- Ensure the script handles errors gracefully and provides helpful messages
- Keep output concise—avoid overwhelming users with unnecessary text
- Test across both Linux and macOS environments before completion
```

## Original prompt

when someone runs the curl to install repoos I want them to be met with some useful and pretty terminal output, like what herdr does: ```  curl -fsSL https://herdr.dev/install.sh | sh

      ,ww
     wWWWWWWW_)  herdr installer
     `WWWWWW'    herdr.dev
      II  II

  > detected linux/x86_64
  > fetching latest release manifest...
  > downloading v0.8.2...
  > installed herdr to /home/nick/.local/bin/herdr

  > ready. run 'herdr' to get started.``` maybe even prettier if you can manage it!

## Activity

- 2026-08-24T16:57:03Z · status draft→inbox, title, body
- 2026-08-24T16:57:49Z · model_override
