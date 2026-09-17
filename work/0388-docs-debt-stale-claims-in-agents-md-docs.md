---
id: "0388"
title: "Docs debt: stale claims in AGENTS.md, docs/, and user-docs/"
type: chore
status: inbox
priority: p2
area: docs-debt
assigned_to: unassigned
created_by: docs-debt-agent
created_at: "2026-09-17T11:47:26.068Z"
updated_at: "2026-09-17T11:47:26.068Z"
---
## Docs Debt Findings

The Docs Debt Agent verified concrete claims in `AGENTS.md`/`docs/`/`user-docs/` against the actual repo and found 22 that need a human decision.

### 1. ignorePatterns
- **Doc**: `AGENTS.md`:279
- **Kind**: missing-symbol
- **Severity**: medium
- **Evidence**: `ignorePatterns` does not appear anywhere under `src/`
- **Suggested fix**: Confirm the symbol was renamed or removed, then update the doc.

### 2. oldString
- **Doc**: `docs/agent-model-recommendations.md`:35
- **Kind**: missing-symbol
- **Severity**: medium
- **Evidence**: `oldString` does not appear anywhere under `src/`
- **Suggested fix**: Confirm the symbol was renamed or removed, then update the doc.

### 3. newString
- **Doc**: `docs/agent-model-recommendations.md`:35
- **Kind**: missing-symbol
- **Severity**: medium
- **Evidence**: `newString` does not appear anywhere under `src/`
- **Suggested fix**: Confirm the symbol was renamed or removed, then update the doc.

### 4. prepublishOnly
- **Doc**: `docs/dogfooding-vs-general.md`:114
- **Kind**: missing-symbol
- **Severity**: medium
- **Evidence**: `prepublishOnly` does not appear anywhere under `src/`
- **Suggested fix**: Confirm the symbol was renamed or removed, then update the doc.

### 5. ensureFreshBuild
- **Doc**: `docs/dogfooding-vs-general.md`:125
- **Kind**: missing-symbol
- **Severity**: medium
- **Evidence**: `ensureFreshBuild` does not appear anywhere under `src/`
- **Suggested fix**: Confirm the symbol was renamed or removed, then update the doc.

### 6. startPreviewServer
- **Doc**: `docs/close-out-pipeline.md`:194
- **Kind**: missing-symbol
- **Severity**: medium
- **Evidence**: `startPreviewServer` does not appear anywhere under `src/`
- **Suggested fix**: Confirm the symbol was renamed or removed, then update the doc.

### 7. launchWebkit
- **Doc**: `docs/close-out-pipeline.md`:194
- **Kind**: missing-symbol
- **Severity**: medium
- **Evidence**: `launchWebkit` does not appear anywhere under `src/`
- **Suggested fix**: Confirm the symbol was renamed or removed, then update the doc.

### 8. work/0202
- **Doc**: `docs/close-out-pipeline.md`:388
- **Kind**: missing-path
- **Severity**: medium
- **Evidence**: `work/0202` is referenced but does not exist in the repo
- **Suggested fix**: Update the reference or restore the path.

### 9. work/0275
- **Doc**: `docs/close-out-pipeline.md`:388
- **Kind**: missing-path
- **Severity**: medium
- **Evidence**: `work/0275` is referenced but does not exist in the repo
- **Suggested fix**: Update the reference or restore the path.

### 10. availableModels
- **Doc**: `docs/audits/2026-08-agent-skill-gap-audit.md`:168
- **Kind**: missing-symbol
- **Severity**: medium
- **Evidence**: `availableModels` does not appear anywhere under `src/`
- **Suggested fix**: Confirm the symbol was renamed or removed, then update the doc.

### 11. docs/agent-cli-compat.md
- **Doc**: `docs/audits/2026-08-agent-skill-gap-audit.md`:395
- **Kind**: missing-path
- **Severity**: medium
- **Evidence**: `docs/agent-cli-compat.md` is referenced but does not exist in the repo
- **Suggested fix**: Update the reference or restore the path.

### 12. startPreviewServer
- **Doc**: `docs/audits/2026-09-check-step-genericity-audit.md`:22
- **Kind**: missing-symbol
- **Severity**: medium
- **Evidence**: `startPreviewServer` does not appear anywhere under `src/`
- **Suggested fix**: Confirm the symbol was renamed or removed, then update the doc.

### 13. cssPath
- **Doc**: `docs/audits/2026-09-check-step-genericity-audit.md`:44
- **Kind**: missing-symbol
- **Severity**: medium
- **Evidence**: `cssPath` does not appear anywhere under `src/`
- **Suggested fix**: Confirm the symbol was renamed or removed, then update the doc.

### 14. openInWebView
- **Doc**: `docs/mobile-architecture.md`:17
- **Kind**: missing-symbol
- **Severity**: medium
- **Evidence**: `openInWebView` does not appear anywhere under `src/`
- **Suggested fix**: Confirm the symbol was renamed or removed, then update the doc.

### 15. openInSystemBrowser
- **Doc**: `docs/mobile-architecture.md`:98
- **Kind**: missing-symbol
- **Severity**: medium
- **Evidence**: `openInSystemBrowser` does not appear anywhere under `src/`
- **Suggested fix**: Confirm the symbol was renamed or removed, then update the doc.

### 16. mutateRegistry
- **Doc**: `docs/tunnel-registry.md`:115
- **Kind**: missing-symbol
- **Severity**: medium
- **Evidence**: `mutateRegistry` does not appear anywhere under `src/`
- **Suggested fix**: Confirm the symbol was renamed or removed, then update the doc.

### 17. readRegistryForDisplay
- **Doc**: `docs/tunnel-registry.md`:117
- **Kind**: missing-symbol
- **Severity**: medium
- **Evidence**: `readRegistryForDisplay` does not appear anywhere under `src/`
- **Suggested fix**: Confirm the symbol was renamed or removed, then update the doc.

### 18. resolveServeEntry
- **Doc**: `docs/previews.md`:50
- **Kind**: missing-symbol
- **Severity**: medium
- **Evidence**: `resolveServeEntry` does not appear anywhere under `src/`
- **Suggested fix**: Confirm the symbol was renamed or removed, then update the doc.

### 19. ensureFreshBuild
- **Doc**: `docs/previews.md`:132
- **Kind**: missing-symbol
- **Severity**: medium
- **Evidence**: `ensureFreshBuild` does not appear anywhere under `src/`
- **Suggested fix**: Confirm the symbol was renamed or removed, then update the doc.

### 20. ensureFile
- **Doc**: `docs/onboarding.md`:31
- **Kind**: missing-symbol
- **Severity**: medium
- **Evidence**: `ensureFile` does not appear anywhere under `src/`
- **Suggested fix**: Confirm the symbol was renamed or removed, then update the doc.

### 21. testPoolSize
- **Doc**: `docs/remote-validation.md`:100
- **Kind**: missing-symbol
- **Severity**: medium
- **Evidence**: `testPoolSize` does not appear anywhere under `src/`
- **Suggested fix**: Confirm the symbol was renamed or removed, then update the doc.

### 22. work/0002-read-the-codebase.md
- **Doc**: `user-docs/existing-repo.md`:24
- **Kind**: missing-path
- **Severity**: medium
- **Evidence**: `work/0002-read-the-codebase.md` is referenced but does not exist in the repo
- **Suggested fix**: Update the reference or restore the path.

## Next Steps

1. Confirm each finding is real drift and not a deliberate, documented difference.
2. Update the doc(s) or the code so the two agree.
3. Move this task to done when complete.
