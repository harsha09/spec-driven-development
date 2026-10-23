# Brainstorm

> **Issue 62 model selection** · approaches compared before design. Not a final design, and not an acceptance.

## A. Call the decider inside matchRoute

Every ask, including `Two roles own this.`, would reach a model. `takeRole` and `chooseLead` would start calling one too. Existing router tests that expect those asks with no model would fail. A rules table inside the match would also invent a role ranking the issue does not name.

Rejected. The decider stays outside `matchRoute`.

## B. Store overrides on team.yaml

One file would hold bots and model slots. `TeamSchema` is strict, and the team tests reject unknown keys. Secrets would sit next to the team roster. The issue allows this file, and Q2 records why this change does not use it.

Rejected for this change. A later issue can add a team-file slot if the schema grows on purpose.

## C. A separate models.yaml, consulted only on "No rule matched."

`selectModel` is pure precedence. `decide` is the runtime, and only `routeRole` calls it, and only for that one reason, and only when the file exists. Rules return `human` and do not rank roles. Command and Ollama are the only model calls. Decision tokens sit in their own array so the existing report header and provider enum stay.

Chosen. It keeps today's route and `SDD_ROLE_MODEL` behavior when the file is absent, and it does not pull escalation, rooms, or the evidence gate into this change.

## Comparison

| | A | B | C |
|---|---|---|---|
| No models.yaml matches today | No | No | Yes |
| Two owners stay with the human | No | Yes | Yes |
| Team schema stays strict | Yes | No | Yes |
| Report header stays | Unspecified | Unspecified | Yes |
| Ollama stays behind config | Unspecified | Unspecified | Yes |
