---
id: "0228"
title: "Fix blocking operations"
type: chore
status: inbox
priority: p2
area: performance
assigned_to: unassigned
created_by: performance-agent
created_at: "2026-08-16T11:41:17.842Z"
updated_at: "2026-08-16T11:41:17.842Z"
---
## Performance Issues Identified

### Large object serialization could block; consider streaming
- **File**: `src/commands/tasks.ts`
- **Line**: 216
- **Severity**: high
- **Type**: blocking-operation

### Large object serialization could block; consider streaming
- **File**: `src/commands/tunnel.ts`
- **Line**: 305
- **Severity**: high
- **Type**: blocking-operation

### Large object serialization could block; consider streaming
- **File**: `src/core/context-pack.ts`
- **Line**: 245
- **Severity**: high
- **Type**: blocking-operation

### Large object serialization could block; consider streaming
- **File**: `src/core/context-pack.ts`
- **Line**: 831
- **Severity**: high
- **Type**: blocking-operation

### Large object serialization could block; consider streaming
- **File**: `src/core/indexer.ts`
- **Line**: 149
- **Severity**: high
- **Type**: blocking-operation

### Large object serialization could block; consider streaming
- **File**: `src/core/logger.ts`
- **Line**: 154
- **Severity**: high
- **Type**: blocking-operation

### Large object serialization could block; consider streaming
- **File**: `src/server/__tests__/integration-job.test.ts`
- **Line**: 120
- **Severity**: high
- **Type**: blocking-operation

### Large object serialization could block; consider streaming
- **File**: `src/server/agents.ts`
- **Line**: 224
- **Severity**: high
- **Type**: blocking-operation

### Large object serialization could block; consider streaming
- **File**: `src/server/agents.ts`
- **Line**: 619
- **Severity**: high
- **Type**: blocking-operation

### Large object serialization could block; consider streaming
- **File**: `src/server/agents.ts`
- **Line**: 2983
- **Severity**: high
- **Type**: blocking-operation

### Synchronous file read blocks the event loop
- **File**: `src/server/auto-engineering.ts`
- **Line**: 135
- **Severity**: high
- **Type**: blocking-operation

### Synchronous file write blocks the event loop
- **File**: `src/server/auto-engineering.ts`
- **Line**: 122
- **Severity**: high
- **Type**: blocking-operation

## Next Steps

1. Profile the identified performance issues with real-world data
2. Optimize the code using appropriate techniques (async, streaming, caching, etc.)
3. Measure the improvement with benchmarks
4. Test thoroughly to ensure no regressions
5. Move this task to done when optimized
