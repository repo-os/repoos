---
id: "0102"
title: Add new document creation to Context
type: feature
status: review
priority: p2
area: web
assigned_to: ai
created_by: ""
branch: feat/add-new-document-creation-to-context
created_at: "2026-08-11T16:28:09Z"
updated_at: "2026-08-12T19:45:04Z"
---
## Problem

The Context page does not provide a way to create documentation. Users need a document-creation flow similar to the existing “New task” button and side panel on the work queue page, including an AI-assisted option that can turn a rough description into a well-formatted Markdown document and choose an appropriate path.

## Desired UX

The Context page displays a “+ New doc” button. Selecting it opens a side panel modeled on the work queue’s “New task” panel.

The panel has two tabs:

- **Freeform** — accepts a description of the desired document. The PM AI agent converts the description into polished, well-formatted Markdown and determines an appropriate file path, such as an ADR or general documentation path.
- **Manual doc** — allows the user to create the document directly rather than having the PM AI agent derive it from a freeform description.

## Acceptance criteria

- [ ] The Context page includes a visible “+ New doc” button.
- [ ] Selecting “+ New doc” opens a side panel consistent with the existing “New task” side panel UI.
- [ ] The side panel provides “Freeform” and “Manual doc” tabs.
- [ ] The Freeform tab accepts a description of the document to create.
- [ ] Submitting a Freeform description sends it to the PM AI agent.
- [ ] The PM AI agent converts the description into polished, well-formatted Markdown.
- [ ] The PM AI agent determines an appropriate repository file path for the document, including choosing between locations such as ADRs and general documentation.
- [ ] The generated Markdown document is created at the path selected by the PM AI agent.
- [ ] The Manual doc tab supports direct document creation without requiring AI transformation.

## Notes for AI

- Reuse the interaction and visual patterns of the work queue page’s “New task” button and side panel.
- Keep document creation within the Context page experience.
- Assume the Manual doc flow should expose the document content and destination path for direct user entry; the exact fields and validation should follow existing RepoOS UI conventions.
- Do not add document types, AI behaviors, or categorization rules beyond choosing an appropriate path from the submitted description.

## Activity

- 2026-08-11T16:28:09Z · created · unknown
- 2026-08-11T17:33:44Z · status inbox→ready
- 2026-08-11T17:34:14Z · status ready→inbox
- 2026-08-11T17:37:51Z · status inbox→ready
- 2026-08-11T17:40:46Z · status ready→inbox
- 2026-08-11T17:40:49Z · status inbox→ready
- 2026-08-11T17:40:54Z · status ready→inbox
- 2026-08-11T17:40:59Z · status inbox→ready
- 2026-08-12T18:45:43Z · status ready→review, branch
- 2026-08-12T19:45:04Z · status done→review
