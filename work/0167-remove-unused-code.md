---
id: "0167"
title: Remove unused code
type: chore
status: active
priority: p2
area: tech-debt
assigned_to: unassigned
created_by: tech-debt-agent
branch: feat/remove-unused-code
created_at: "2026-08-13T13:45:29.814Z"
updated_at: "2026-08-14T07:04:54Z"
---
## Issues Identified

### Exported "isExecutable" is never referenced by any other file — consider removing it
- **File**: `src/core/detect.ts`
- **Line**: 148
- **Severity**: low

### Exported "binaryCandidates" is never referenced by any other file — consider removing it
- **File**: `src/core/detect.ts`
- **Line**: 158
- **Severity**: low

### Exported "captureVersion" is never referenced by any other file — consider removing it
- **File**: `src/core/detect.ts`
- **Line**: 200
- **Severity**: low

### Exported "VERSION_TIMEOUT_MS" is never referenced by any other file — consider removing it
- **File**: `src/core/detect.ts`
- **Line**: 46
- **Severity**: low

### Exported "DetectOptions" is never referenced by any other file — consider removing it
- **File**: `src/core/detect.ts`
- **Line**: 255
- **Severity**: low

### Exported "CreateTaskInput" is never referenced by any other file — consider removing it
- **File**: `src/core/repoos.ts`
- **Line**: 30
- **Severity**: low

### Exported "TunnelPublishInput" is never referenced by any other file — consider removing it
- **File**: `src/core/tunnel-assistant.ts`
- **Line**: 6
- **Severity**: low

### Exported "TunnelRunMode" is never referenced by any other file — consider removing it
- **File**: `src/core/tunnel-assistant.ts`
- **Line**: 1
- **Severity**: low

### Exported "indexCachePath" is never referenced by any other file — consider removing it
- **File**: `src/core/indexer.ts`
- **Line**: 136
- **Severity**: low

### Exported "readIndexCache" is never referenced by any other file — consider removing it
- **File**: `src/core/indexer.ts`
- **Line**: 152
- **Severity**: low

## Next Steps

1. Review each issue in the files listed above
2. Make the suggested improvements
3. Test the changes thoroughly
4. Move this task to done when complete

## Activity

- 2026-08-13T17:59:49Z · status inbox→ready
- 2026-08-14T03:33:52Z · status ready→active, branch
