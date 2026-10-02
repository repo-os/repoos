---
id: mukxd6it-r635p
number: "0035"
title: Replace or fall back from a failing coding agent globally
status: new
type: improvement
area: agents
created_by: hello@repoos.org
created_at: "2026-09-28T07:27:26.021Z"
updated_at: "2026-10-02T18:15:44.178Z"
resolution: ""
resolved_task: ""
---
Sometimes a coding agent becomes unavailable (e.g. you ran out of usage credits for the month) or it's having a problem and you need to turn it off everywhere and replace it with another coding agent + model combo that works. We might need to have a tab in the agents that shows all currently set coding agent + model combos (and where they're being used, e.g. which agent or which task override etc) and change them all at once if say for example a coding agent or model stops working and you don't want to get hit by random agent/model failures that you need to hunt down and change one-by-one. Or another option would be to set a global default fallback agent+model which gets used whenever there's this kind of error. Let's think about it...because it's fairly common.
