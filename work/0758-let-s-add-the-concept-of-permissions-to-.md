---
id: "0758"
title: Add page permissions for users
type: feature
status: inbox
priority: p2
area: [web, server]
assigned_to: ai
created_by: hello@repoos.org
branch: ""
created_at: "2026-10-12T04:04:24Z"
updated_at: "2026-10-12T04:04:46Z"
---
## Problem

RepoOS does not let administrators limit which parts of the product a user can access. Some users, such as non-technical collaborators, may only need pages like Inputs and Stories. Page access alone is not sufficient when a page also offers actions belonging to another area—for example, creating a task from Inputs.

## Desired UX

Administrators can manage a user's permissions from the user list using a clear checkbox dropdown or modal. They can grant all permissions or select specific pages, such as Inputs and Stories. Users can access only the pages and functionality their permissions allow; cross-page actions require permission for the area that owns the action.

## Acceptance criteria

- [ ] An administrator can open a user's permission controls from the user list.
- [ ] The controls allow granting all permissions or selecting individual page permissions.
- [ ] A user with only Inputs and Stories permissions can access those pages but not other restricted pages.
- [ ] Creating a task from the Inputs page requires Work/Task permission, even when the user has Inputs permission.
- [ ] Users without permission cannot perform restricted actions through the corresponding server/API endpoints.
- [ ] Existing users' access is handled consistently with the chosen permission defaults.

## Notes for AI

- Follow existing user-list, authentication, authorization, and UI patterns; inspect the current implementation before choosing where to store and enforce permissions.
- Use the shared styled dropdown or dialog conventions rather than an unstyled native select.
- Assume administrators can manage permissions for users and retain access to all pages and functionality.
- Assume existing users retain all permissions by default to avoid unintentionally removing access.
- Treat permission checks as applying to both page access and actions initiated from another page; hiding a control alone is not sufficient.

## Scope

This task covers page-based user permissions, administrator controls on the user list, and enforcement of cross-page actions. More granular permissions within a page are deferred.

## Original prompt

Let's add the concept of permissions to users in RepoOS. E.g. it could simply be page-based permissions to start, so a user could have all permissions (like me) or maybe a user only needs to be able to see certain pages like Inputs and Stories (a non-technical user) -- although keep in mind that some functionality is cross-page, like on inputs page you can create tasks (which someone with Inputs permission but not Work/Task permission shouldn't be able to do). I envision the permissions like a pretty checkbox dropdown or modal accessible from the user list which admin's have access to.

## Screenshots

![Screenshot-2026-10-02-at-17.23.41](/api/tasks/0758/attachments/screenshot-1.png)

## Activity

- 2026-10-12T04:04:24Z · created · hello@repoos.org
- 2026-10-12T04:04:25Z · screenshots
- 2026-10-12T04:04:46Z · status draft→inbox, title, area, body
