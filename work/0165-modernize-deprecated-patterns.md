---
id: "0165"
title: Modernize deprecated patterns
type: chore
status: ready
priority: p2
area: tech-debt
assigned_to: unassigned
created_by: tech-debt-agent
branch: feat/modernize-deprecated-patterns
created_at: "2026-08-13T13:45:29.814Z"
updated_at: "2026-08-14T07:42:25Z"
---
## Issues Identified

### File uses 'var' declarations — modernize to 'const' or 'let'
- **File**: `src/core/config.ts`
- **Line**: 359
- **Severity**: low

### File uses 'var' declarations — modernize to 'const' or 'let'
- **File**: `src/ui-app/tests/built-in-agents.test.ts`
- **Line**: 56
- **Severity**: low

### File uses 'var' declarations — modernize to 'const' or 'let'
- **File**: `src/ui-app/tests/built-in-agents.test.ts`
- **Line**: 57
- **Severity**: low

### File uses 'var' declarations — modernize to 'const' or 'let'
- **File**: `src/ui-app/tests/built-in-agents.test.ts`
- **Line**: 58
- **Severity**: low

## Next Steps

1. Review each issue in the files listed above
2. Make the suggested improvements
3. Test the changes thoroughly
4. Move this task to done when complete

## Activity

- 2026-08-14T04:20:10Z · status inbox→ready
- 2026-08-14T04:20:16Z · status ready→active, branch
- 2026-08-14T07:42:25Z · watchdog: auto-surfaced stuck task · status active→ready · agent never started — no session exists for this task · next step: resume the session manually from the task's worktree and check for uncommitted work
