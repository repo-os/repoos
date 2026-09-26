---
resolved_task: "0518"
resolution: "task"
area: "sidebar"
id: "mui5cnj3-quh81"
number: "0029"
title: "Sidebar: alert counts overlap server name when narrow; color bar shifts layout"
status: "processed"
type: "improvement"
created_by: "hello@repoos.org"
created_at: "2026-09-26T08:47:39.807Z"
updated_at: "2026-09-26T09:41:46.580Z"
---

2 things:
- when the sidebar is wide enough the current alert counts are fine on the right side, not overlapping the server name/title, but when it becomes narrow they cover the server name, instead I'd like it to move to below the server name (and  don't show the server url), so that way we should always be able to see the server name and alert circles
- when a server has a color selected (vertical color bar on the left) don't add so much padding / spacing between the color bar and the green/red server icon, ideally the server icon (or other icon if changed) should always be in the same position and the color bar is just added or removed but not changing the position of the other items in it's item/block
